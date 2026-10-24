import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  ConnectedDevice,
  DeviceConnectionType,
  MICROS_PER_SECOND,
  MIN_WITHDRAWAL_MICROS,
  PayoutMethod,
  UserAccount,
} from '../types';
import {
  generatePairingCode,
  generateSafeId,
  getDateBuckets,
  inspectHardwareNode,
  measureRealNetworkLatency,
  sha256Hex,
} from '../utils/validation';
import { validateRpcAuthorizationCode } from '../data/nigeriaBanks';

/**
 * Registers or retrieves a device document for real online uptime tracking.
 */
export async function registerOrActivateDevice(
  uid: string,
  deviceId: string,
  connectionType: DeviceConnectionType,
  customPairingCode?: string
): Promise<ConnectedDevice> {
  const path = `users/${uid}/devices/${deviceId}`;
  const devRef = doc(db, 'users', uid, 'devices', deviceId);

  const [hw, net] = await Promise.all([inspectHardwareNode(), measureRealNetworkLatency()]);
  const isOnline = hw.online && net.reachable;

  let existingSnap;
  try {
    existingSnap = await getDoc(devRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  if (existingSnap?.exists()) {
    const existingData = existingSnap.data() as ConnectedDevice;
    if (existingData.status === 'revoked') {
      if (connectionType === 'direct_device') {
        const rotatedId = generateSafeId('node');
        return registerOrActivateDevice(uid, rotatedId, connectionType, customPairingCode);
      }
      throw new Error('This QR phone link was revoked. Tap + Pair Phone QR to create a new QR link.');
    }
    try {
      await updateDoc(devRef, {
        deviceName: hw.deviceName.slice(0, 80),
        platform: hw.platform.slice(0, 60),
        status: isOnline ? 'online' : 'offline',
        batteryPercent: hw.batteryPercent,
        networkLabel: (isOnline ? hw.networkLabel : 'Offline').slice(0, 40),
        latencyMs: net.latencyMs,
        lastHeartbeatAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }

    const updatedSnap = await getDoc(devRef);
    return updatedSnap.data() as ConnectedDevice;
  }

  const pairingCode = (customPairingCode || generatePairingCode()).slice(0, 12);
  try {
    await setDoc(devRef, {
      deviceId,
      uid,
      deviceName: hw.deviceName.slice(0, 80),
      platform: hw.platform.slice(0, 60),
      connectionType,
      status: isOnline ? 'online' : 'offline',
      pairingCode,
      batteryPercent: hw.batteryPercent,
      networkLabel: (isOnline ? hw.networkLabel : 'Offline').slice(0, 40),
      latencyMs: net.latencyMs,
      sessionSeconds: 0,
      sessionEarnedMicros: 0,
      lastHeartbeatAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }

  const createdSnap = await getDoc(devRef);
  return createdSnap.data() as ConnectedDevice;
}

/**
 * Creates a pending QR pairing slot in Firestore so the user can scan it with their real mobile phone.
 */
export async function createQrPairingSlot(
  uid: string
): Promise<{ deviceId: string; pairingCode: string }> {
  const deviceId = generateSafeId('phone');
  const pairingCode = generatePairingCode();
  const path = `users/${uid}/devices/${deviceId}`;
  const devRef = doc(db, 'users', uid, 'devices', deviceId);

  try {
    await setDoc(devRef, {
      deviceId,
      uid,
      deviceName: 'Awaiting Mobile Scan',
      platform: 'Mobile QR Link',
      connectionType: 'qr_paired_phone',
      status: 'offline',
      pairingCode,
      batteryPercent: 100,
      networkLabel: 'Waiting for scan',
      latencyMs: 0,
      sessionSeconds: 0,
      sessionEarnedMicros: 0,
      lastHeartbeatAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }

  return { deviceId, pairingCode };
}

/**
 * Atomically commits verified real online uptime seconds and exact micro-USD earnings via server transaction.
 */
export async function commitVerifiedUptimeInterval(
  uid: string,
  deviceId: string,
  secondsDelta: number,
  customAmountMicros?: number
): Promise<{ committed: boolean; latencyMs: number }> {
  const clampedSeconds = Math.max(1, Math.min(120, Math.round(secondsDelta)));
  const [hw, net] = await Promise.all([inspectHardwareNode(), measureRealNetworkLatency()]);

  if (!hw.online || !net.reachable) {
    await setDeviceOffline(uid, deviceId);
    return { committed: false, latencyMs: 0 };
  }

  const userRef = doc(db, 'users', uid);
  const devRef = doc(db, 'users', uid, 'devices', deviceId);
  const entryId = generateSafeId('earn');
  const earnRef = doc(db, 'users', uid, 'earnings', entryId);

  const rawMicros =
    customAmountMicros !== undefined
      ? Math.floor(customAmountMicros)
      : clampedSeconds * MICROS_PER_SECOND;
  const amountMicros = Math.min(
    clampedSeconds * 2_500_000,
    Math.max(10_000, rawMicros)
  );
  const buckets = getDateBuckets(new Date());

  try {
    const committed = await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      const devSnap = await tx.get(devRef);
      if (!userSnap.exists() || !devSnap.exists()) {
        return false;
      }

      const user = userSnap.data() as UserAccount;
      const dev = devSnap.data() as ConnectedDevice;
      if (dev.status === 'revoked') {
        return false;
      }

      tx.update(userRef, {
        availableBalanceMicros: user.availableBalanceMicros + amountMicros,
        lifetimeEarnedMicros: user.lifetimeEarnedMicros + amountMicros,
        totalOnlineSeconds: user.totalOnlineSeconds + clampedSeconds,
        updatedAt: serverTimestamp(),
      });

      tx.update(devRef, {
        deviceName: hw.deviceName.slice(0, 80),
        platform: hw.platform.slice(0, 60),
        status: 'online',
        batteryPercent: hw.batteryPercent,
        networkLabel: hw.networkLabel.slice(0, 40),
        latencyMs: net.latencyMs,
        sessionSeconds: dev.sessionSeconds + clampedSeconds,
        sessionEarnedMicros: dev.sessionEarnedMicros + amountMicros,
        lastHeartbeatAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(earnRef, {
        entryId,
        uid,
        deviceId,
        deviceName: hw.deviceName.slice(0, 80),
        secondsOnline: clampedSeconds,
        amountMicros,
        hourKey: buckets.hourKey,
        dayKey: buckets.dayKey,
        monthKey: buckets.monthKey,
        yearKey: buckets.yearKey,
        createdAt: serverTimestamp(),
      });

      return true;
    });

    return { committed, latencyMs: net.latencyMs };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/earnings/${entryId}`);
  }
}

export async function setDeviceOffline(uid: string, deviceId: string): Promise<void> {
  const path = `users/${uid}/devices/${deviceId}`;
  const devRef = doc(db, 'users', uid, 'devices', deviceId);
  try {
    const snap = await getDoc(devRef);
    if (!snap.exists()) return;
    const data = snap.data() as ConnectedDevice;
    if (data.status === 'revoked') return;
    await updateDoc(devRef, {
      status: 'offline',
      networkLabel: 'Paused / Disconnected',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function revokeConnectedDevice(uid: string, deviceId: string): Promise<void> {
  const path = `users/${uid}/devices/${deviceId}`;
  const devRef = doc(db, 'users', uid, 'devices', deviceId);
  try {
    await updateDoc(devRef, {
      status: 'revoked',
      networkLabel: 'Access Revoked',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Atomically submits a real withdrawal request and deducts from available balance via server transaction.
 * Requires one of the 3 authorized RPC codes (091306, 0913061, 091306191).
 */
export async function submitRealWithdrawal(
  uid: string,
  amountMicros: number,
  method: PayoutMethod,
  destinationMasked: string,
  rpcCode: string
): Promise<string> {
  const rpcCheck = validateRpcAuthorizationCode(rpcCode);
  if (!rpcCheck.valid) {
    throw new Error(rpcCheck.error || 'Valid RPC code is required to withdraw.');
  }

  const cleanMicros = Math.floor(amountMicros);
  if (cleanMicros < MIN_WITHDRAWAL_MICROS) {
    throw new Error('Minimum withdrawal is $10.00 USD.');
  }

  const rpcCodeHash = await sha256Hex(rpcCheck.normalized);
  const userRef = doc(db, 'users', uid);
  const withdrawalId = generateSafeId('wd');
  const wdRef = doc(db, 'users', uid, 'withdrawals', withdrawalId);

  try {
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('User ledger not found.');
      }

      const user = userSnap.data() as UserAccount;
      if (user.availableBalanceMicros < cleanMicros) {
        throw new Error('Insufficient real available balance for this withdrawal.');
      }

      tx.update(userRef, {
        availableBalanceMicros: user.availableBalanceMicros - cleanMicros,
        totalWithdrawnMicros: user.totalWithdrawnMicros + cleanMicros,
        updatedAt: serverTimestamp(),
      });

      tx.set(wdRef, {
        withdrawalId,
        uid,
        amountMicros: cleanMicros,
        method,
        destinationMasked: destinationMasked.trim().slice(0, 120),
        rpcCodeHash,
        status: 'processing',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('Insufficient') ||
        err.message.includes('ledger not found') ||
        err.message.includes('RPC Code'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/withdrawals/${withdrawalId}`);
  }

  return withdrawalId;
}
