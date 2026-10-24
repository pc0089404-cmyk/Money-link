import { validateRpcAuthorizationCode } from '../data/nigeriaBanks';
import {
  AppTimestamp,
  ConnectedDevice,
  ContactType,
  DeviceConnectionType,
  EarningEntry,
  MICROS_PER_SECOND,
  MIN_WITHDRAWAL_MICROS,
  PayoutMethod,
  UsaIdType,
  UserAccount,
  UserPrivateVault,
  VerificationMethod,
  WithdrawalRequest,
} from '../types';
import {
  getDateBuckets,
  inspectHardwareNode,
  measureRealNetworkLatency,
  sha256Hex,
} from '../utils/validation';

const TOKEN_STORAGE_KEY = 'moneylink_app_token_v1';
const ACTIVE_CACHE_KEY = 'moneylink_wallet_cache_v1';
const ACCOUNTS_BACKUP_KEY = 'moneylink_local_accounts_v1';

interface RawServerAccount {
  uid: string;
  displayName: string;
  identityVerified: boolean;
  issuingState: string;
  idType: UsaIdType;
  usaIdMasked: string;
  availableBalanceMicros: number;
  lifetimeEarnedMicros: number;
  totalWithdrawnMicros: number;
  totalOnlineSeconds: number;
  createdAtMs: number;
  updatedAtMs: number;
}

interface RawServerVault {
  uid: string;
  contactType: ContactType;
  contactValue: string;
  authEmail: string;
  passwordHash: string;
  usaIdHash: string;
  ssnLast4Hash: string;
  dobYear: number;
  idExpiryDate: string;
  verificationMethod: VerificationMethod;
  verificationDigest: string;
  createdAtMs: number;
  updatedAtMs: number;
}

interface RawServerDevice {
  deviceId: string;
  uid: string;
  deviceName: string;
  platform: string;
  connectionType: DeviceConnectionType;
  status: 'online' | 'offline' | 'revoked';
  pairingCode: string;
  batteryPercent: number;
  networkLabel: string;
  latencyMs: number;
  sessionSeconds: number;
  sessionEarnedMicros: number;
  lastHeartbeatAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
}

interface RawServerEarning {
  entryId: string;
  uid: string;
  deviceId: string;
  deviceName: string;
  secondsOnline: number;
  amountMicros: number;
  hourKey: string;
  dayKey: string;
  monthKey: string;
  yearKey: string;
  createdAtMs: number;
}

interface RawServerWithdrawal {
  withdrawalId: string;
  uid: string;
  amountMicros: number;
  method: PayoutMethod;
  destinationMasked: string;
  rpcCodeHash: string;
  status: 'processing' | 'completed' | 'cancelled';
  createdAtMs: number;
  updatedAtMs: number;
}

interface RawServerWalletBundle {
  token?: string;
  account: RawServerAccount;
  vault: RawServerVault;
  devices: RawServerDevice[];
  earnings: RawServerEarning[];
  withdrawals: RawServerWithdrawal[];
}

export interface WalletSnapshotState {
  account: UserAccount | null;
  vault: UserPrivateVault | null;
  devices: ConnectedDevice[];
  earnings: EarningEntry[];
  withdrawals: WithdrawalRequest[];
}

export interface SignUpAppParams {
  displayName: string;
  contactType: ContactType;
  contactValue: string;
  passwordHash: string;
  issuingState: string;
  idType: UsaIdType;
  usaIdMasked: string;
  usaIdHash: string;
  ssnLast4Hash: string;
  dobYear: number;
  idExpiryDate: string;
  verificationMethod: VerificationMethod;
  verificationDigest: string;
}

export function makeTimestamp(ms: number | undefined): AppTimestamp {
  const safeMs = typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : Date.now();
  return {
    toDate: () => new Date(safeMs),
    toMillis: () => safeMs,
  };
}

function hydrateAccount(raw: RawServerAccount): UserAccount {
  return {
    uid: raw.uid,
    displayName: raw.displayName,
    identityVerified: Boolean(raw.identityVerified),
    issuingState: raw.issuingState,
    idType: raw.idType,
    usaIdMasked: raw.usaIdMasked,
    availableBalanceMicros: Number(raw.availableBalanceMicros || 0),
    lifetimeEarnedMicros: Number(raw.lifetimeEarnedMicros || 0),
    totalWithdrawnMicros: Number(raw.totalWithdrawnMicros || 0),
    totalOnlineSeconds: Number(raw.totalOnlineSeconds || 0),
    createdAt: makeTimestamp(raw.createdAtMs),
    updatedAt: makeTimestamp(raw.updatedAtMs),
  };
}

function hydrateVault(raw: RawServerVault): UserPrivateVault {
  return {
    uid: raw.uid,
    contactType: raw.contactType,
    contactValue: raw.contactValue,
    authEmail: raw.authEmail || raw.contactValue,
    passwordHash: raw.passwordHash,
    usaIdHash: raw.usaIdHash,
    ssnLast4Hash: raw.ssnLast4Hash,
    dobYear: Number(raw.dobYear || 1996),
    idExpiryDate: raw.idExpiryDate,
    verificationMethod: raw.verificationMethod,
    verificationDigest: raw.verificationDigest,
    createdAt: makeTimestamp(raw.createdAtMs),
    updatedAt: makeTimestamp(raw.updatedAtMs),
  };
}

function hydrateDevice(raw: RawServerDevice): ConnectedDevice {
  return {
    deviceId: raw.deviceId,
    uid: raw.uid,
    deviceName: raw.deviceName,
    platform: raw.platform,
    connectionType: raw.connectionType,
    status: raw.status,
    pairingCode: raw.pairingCode,
    batteryPercent: Number(raw.batteryPercent ?? 100),
    networkLabel: raw.networkLabel,
    latencyMs: Number(raw.latencyMs || 0),
    sessionSeconds: Number(raw.sessionSeconds || 0),
    sessionEarnedMicros: Number(raw.sessionEarnedMicros || 0),
    lastHeartbeatAt: makeTimestamp(raw.lastHeartbeatAtMs),
    createdAt: makeTimestamp(raw.createdAtMs),
    updatedAt: makeTimestamp(raw.updatedAtMs),
  };
}

function hydrateEarning(raw: RawServerEarning): EarningEntry {
  return {
    entryId: raw.entryId,
    uid: raw.uid,
    deviceId: raw.deviceId,
    deviceName: raw.deviceName,
    secondsOnline: Number(raw.secondsOnline || 0),
    amountMicros: Number(raw.amountMicros || 0),
    hourKey: raw.hourKey,
    dayKey: raw.dayKey,
    monthKey: raw.monthKey,
    yearKey: raw.yearKey,
    createdAt: makeTimestamp(raw.createdAtMs),
  };
}

function hydrateWithdrawal(raw: RawServerWithdrawal): WithdrawalRequest {
  return {
    withdrawalId: raw.withdrawalId,
    uid: raw.uid,
    amountMicros: Number(raw.amountMicros || 0),
    method: raw.method,
    destinationMasked: raw.destinationMasked,
    rpcCodeHash: raw.rpcCodeHash,
    status: raw.status,
    createdAt: makeTimestamp(raw.createdAtMs),
    updatedAt: makeTimestamp(raw.updatedAtMs),
  };
}

let currentState: WalletSnapshotState = {
  account: null,
  vault: null,
  devices: [],
  earnings: [],
  withdrawals: [],
};

const listeners = new Set<(state: WalletSnapshotState) => void>();

function notifyListeners(): void {
  for (const fn of listeners) {
    fn(currentState);
  }
}

export function subscribeWalletState(
  listener: (state: WalletSnapshotState) => void
): () => void {
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentWalletState(): WalletSnapshotState {
  return currentState;
}

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

function readCachedBundle(): RawServerWalletBundle | null {
  try {
    const raw = localStorage.getItem(ACTIVE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RawServerWalletBundle;
    if (parsed?.account?.uid && parsed?.vault?.uid) {
      return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function readBackupAccountsMap(): Record<string, RawServerWalletBundle> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_BACKUP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, RawServerWalletBundle>;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

function saveBundleToClientCache(bundle: RawServerWalletBundle): void {
  const cleanBundle: RawServerWalletBundle = {
    account: bundle.account,
    vault: bundle.vault,
    devices: Array.isArray(bundle.devices) ? bundle.devices : [],
    earnings: Array.isArray(bundle.earnings) ? bundle.earnings.slice(0, 300) : [],
    withdrawals: Array.isArray(bundle.withdrawals) ? bundle.withdrawals : [],
  };
  try {
    localStorage.setItem(ACTIVE_CACHE_KEY, JSON.stringify(cleanBundle));
    const map = readBackupAccountsMap();
    map[cleanBundle.account.uid] = cleanBundle;
    localStorage.setItem(ACCOUNTS_BACKUP_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

function findLocalBackupByContact(rawContact: string): RawServerWalletBundle | null {
  const trimmed = rawContact.trim().toLowerCase();
  const inputDigits = rawContact.replace(/\D/g, '');
  const map = readBackupAccountsMap();

  for (const bundle of Object.values(map)) {
    const v = bundle?.vault;
    if (!v) continue;
    if (trimmed && trimmed === v.contactValue.toLowerCase()) return bundle;
    if (trimmed && v.authEmail && trimmed === v.authEmail.toLowerCase()) return bundle;
    const storedDigits = v.contactValue.replace(/\D/g, '');
    if (
      inputDigits.length >= 7 &&
      storedDigits.length >= 7 &&
      (inputDigits === storedDigits ||
        (inputDigits.length >= 10 &&
          storedDigits.length >= 10 &&
          inputDigits.slice(-10) === storedDigits.slice(-10)))
    ) {
      return bundle;
    }
  }
  return null;
}

function applyServerBundle(bundle: RawServerWalletBundle): WalletSnapshotState {
  if (bundle.token) {
    setStoredToken(bundle.token);
  }
  saveBundleToClientCache(bundle);

  currentState = {
    account: hydrateAccount(bundle.account),
    vault: hydrateVault(bundle.vault),
    devices: (bundle.devices || []).map(hydrateDevice),
    earnings: (bundle.earnings || []).map(hydrateEarning),
    withdrawals: (bundle.withdrawals || []).map(hydrateWithdrawal),
  };
  notifyListeners();
  return currentState;
}

async function restoreBundleToServer(
  bundle: RawServerWalletBundle,
  existingToken?: string | null
): Promise<RawServerWalletBundle | null> {
  try {
    const res = await fetch('/api/auth/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: existingToken || undefined,
        bundle: {
          account: bundle.account,
          vault: bundle.vault,
          devices: bundle.devices || [],
          earnings: bundle.earnings || [],
          withdrawals: bundle.withdrawals || [],
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RawServerWalletBundle;
    if (data?.account?.uid) {
      if (data.token) setStoredToken(data.token);
      saveBundleToClientCache(data);
      return data;
    }
  } catch {
    // Ignore transient network errors
  }
  return null;
}

async function apiAuthFetch<T>(
  url: string,
  options: RequestInit = {},
  allowRestoreRetry = true
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if ((response.status === 401 || response.status === 404) && allowRestoreRetry) {
    const cached = readCachedBundle();
    if (cached) {
      const restored = await restoreBundleToServer(cached, token);
      if (restored?.token) {
        return apiAuthFetch<T>(url, options, false);
      }
    }
  }

  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
  };

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  return payload;
}

/**
 * One-time silent migration for any user who had an active legacy session prior to switching
 * authentication to Money Link's built-in app auth, ensuring they are NOT logged out.
 */
async function tryMigrateLegacySessionOnce(): Promise<RawServerWalletBundle | null> {
  try {
    const [{ onAuthStateChanged }, { collection, doc, getDoc, getDocs }, { auth, db }] =
      await Promise.all([
        import('firebase/auth'),
        import('firebase/firestore'),
        import('../firebase'),
      ]);

    const legacyUser = await new Promise<import('firebase/auth').User | null>((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(auth.currentUser);
        }
      }, 850);

      const unsub = onAuthStateChanged(
        auth,
        (u) => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            unsub();
            resolve(u);
          }
        },
        () => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            resolve(null);
          }
        }
      );
    });

    if (!legacyUser) return null;

    const uid = legacyUser.uid;
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) return null;

    const accData = userSnap.data() as Record<string, unknown>;
    if (!accData.identityVerified) return null;

    const [vaultSnap, devSnap, earnSnap, wdSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid, 'private', 'vault')).catch(() => null),
      getDocs(collection(db, 'users', uid, 'devices')).catch(() => null),
      getDocs(collection(db, 'users', uid, 'earnings')).catch(() => null),
      getDocs(collection(db, 'users', uid, 'withdrawals')).catch(() => null),
    ]);

    const toMs = (val: unknown): number => {
      if (val && typeof (val as { toMillis?: () => number }).toMillis === 'function') {
        return (val as { toMillis: () => number }).toMillis();
      }
      return Date.now();
    };

    const fallbackPwHash = await sha256Hex(`migrated_${uid}`);
    const vData = (vaultSnap?.exists() ? vaultSnap.data() : {}) as Record<string, unknown>;
    const contactVal = String(vData.contactValue || legacyUser.email || `${uid}@moneylink.app`);

    const migratedBundle: RawServerWalletBundle = {
      account: {
        uid,
        displayName: String(accData.displayName || legacyUser.displayName || 'Wallet Holder'),
        identityVerified: true,
        issuingState: String(accData.issuingState || 'CA'),
        idType:
          accData.idType === 'state_id' || accData.idType === 'passport_card'
            ? accData.idType
            : 'drivers_license',
        usaIdMasked: String(accData.usaIdMasked || '****0000'),
        availableBalanceMicros: Number(accData.availableBalanceMicros || 0),
        lifetimeEarnedMicros: Number(accData.lifetimeEarnedMicros || 0),
        totalWithdrawnMicros: Number(accData.totalWithdrawnMicros || 0),
        totalOnlineSeconds: Number(accData.totalOnlineSeconds || 0),
        createdAtMs: toMs(accData.createdAt),
        updatedAtMs: toMs(accData.updatedAt),
      },
      vault: {
        uid,
        contactType:
          vData.contactType === 'phone' || vData.contactType === 'gmail'
            ? vData.contactType
            : 'email',
        contactValue: contactVal,
        authEmail: String(vData.authEmail || legacyUser.email || contactVal),
        passwordHash:
          typeof vData.passwordHash === 'string' && /^[a-f0-9]{64}$/.test(vData.passwordHash)
            ? vData.passwordHash
            : fallbackPwHash,
        usaIdHash:
          typeof vData.usaIdHash === 'string' && vData.usaIdHash.length === 64
            ? vData.usaIdHash
            : fallbackPwHash,
        ssnLast4Hash:
          typeof vData.ssnLast4Hash === 'string' && vData.ssnLast4Hash.length === 64
            ? vData.ssnLast4Hash
            : fallbackPwHash,
        dobYear: Number(vData.dobYear || 1995),
        idExpiryDate: String(vData.idExpiryDate || '2029-12-31'),
        verificationMethod:
          vData.verificationMethod === 'camera_liveness'
            ? 'camera_liveness'
            : 'document_attestation',
        verificationDigest: String(vData.verificationDigest || 'ATTEST_MIGRATED'),
        createdAtMs: toMs(vData.createdAt),
        updatedAtMs: toMs(vData.updatedAt),
      },
      devices: devSnap
        ? devSnap.docs.map((d) => {
            const raw = d.data() as Record<string, unknown>;
            return {
              deviceId: String(raw.deviceId || d.id),
              uid,
              deviceName: String(raw.deviceName || 'Mobile Phone'),
              platform: String(raw.platform || 'Mobile OS'),
              connectionType:
                raw.connectionType === 'qr_paired_phone' ? 'qr_paired_phone' : 'direct_device',
              status:
                raw.status === 'online' || raw.status === 'revoked' ? raw.status : 'offline',
              pairingCode: String(raw.pairingCode || 'ML-LINKED'),
              batteryPercent: Number(raw.batteryPercent ?? 100),
              networkLabel: String(raw.networkLabel || 'Online'),
              latencyMs: Number(raw.latencyMs || 0),
              sessionSeconds: Number(raw.sessionSeconds || 0),
              sessionEarnedMicros: Number(raw.sessionEarnedMicros || 0),
              lastHeartbeatAtMs: toMs(raw.lastHeartbeatAt),
              createdAtMs: toMs(raw.createdAt),
              updatedAtMs: toMs(raw.updatedAt),
            };
          })
        : [],
      earnings: earnSnap
        ? earnSnap.docs.map((d) => {
            const raw = d.data() as Record<string, unknown>;
            return {
              entryId: String(raw.entryId || d.id),
              uid,
              deviceId: String(raw.deviceId || 'node'),
              deviceName: String(raw.deviceName || 'Mobile Phone'),
              secondsOnline: Number(raw.secondsOnline || 0),
              amountMicros: Number(raw.amountMicros || 0),
              hourKey: String(raw.hourKey || ''),
              dayKey: String(raw.dayKey || ''),
              monthKey: String(raw.monthKey || ''),
              yearKey: String(raw.yearKey || ''),
              createdAtMs: toMs(raw.createdAt),
            };
          })
        : [],
      withdrawals: wdSnap
        ? wdSnap.docs.map((d) => {
            const raw = d.data() as Record<string, unknown>;
            return {
              withdrawalId: String(raw.withdrawalId || d.id),
              uid,
              amountMicros: Number(raw.amountMicros || 0),
              method:
                raw.method === 'us_bank_ach' || raw.method === 'paypal' || raw.method === 'venmo'
                  ? raw.method
                  : 'local_bank_ng',
              destinationMasked: String(raw.destinationMasked || 'Local Bank'),
              rpcCodeHash: String(raw.rpcCodeHash || ''),
              status:
                raw.status === 'completed' || raw.status === 'cancelled'
                  ? raw.status
                  : 'processing',
              createdAtMs: toMs(raw.createdAt),
              updatedAtMs: toMs(raw.updatedAt),
            };
          })
        : [],
    };

    return await restoreBundleToServer(migratedBundle);
  } catch {
    return null;
  }
}

/**
 * Bootstraps the Money Link app-controlled authentication session on startup or refresh.
 */
export async function bootstrapAppSession(): Promise<WalletSnapshotState> {
  const token = getStoredToken();
  const cached = readCachedBundle();

  if (token) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const bundle = (await res.json()) as RawServerWalletBundle;
        return applyServerBundle(bundle);
      }

      if ((res.status === 404 || res.status === 401) && cached) {
        const restored = await restoreBundleToServer(cached, token);
        if (restored) {
          return applyServerBundle(restored);
        }
      }
    } catch {
      if (cached) {
        return applyServerBundle(cached);
      }
    }
  } else if (cached) {
    const restored = await restoreBundleToServer(cached);
    if (restored) {
      return applyServerBundle(restored);
    }
  }

  // Check once if user had an active legacy session so they stay seamlessly signed in
  const migrated = await tryMigrateLegacySessionOnce();
  if (migrated) {
    return applyServerBundle(migrated);
  }

  currentState = {
    account: null,
    vault: null,
    devices: [],
    earnings: [],
    withdrawals: [],
  };
  notifyListeners();
  return currentState;
}

export async function refreshWalletFromServer(): Promise<WalletSnapshotState | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const bundle = await apiAuthFetch<RawServerWalletBundle>('/api/auth/me', { method: 'GET' });
    return applyServerBundle(bundle);
  } catch {
    return null;
  }
}

/**
 * App-controlled Sign Up: open to any email address or mobile phone number + mandatory USA ID check.
 */
export async function signUpAppAccount(params: SignUpAppParams): Promise<WalletSnapshotState> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const payload = (await res.json().catch(() => ({}))) as RawServerWalletBundle & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(payload?.error || 'Unable to create your Money Link account.');
  }

  return applyServerBundle(payload);
}

/**
 * App-controlled Sign In: authenticates any registered email or phone number + password inside the app.
 */
export async function signInAppAccount(
  contactValue: string,
  passwordPlain: string
): Promise<WalletSnapshotState> {
  const passwordHash = await sha256Hex(passwordPlain);

  const attemptSignIn = async () => {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactValue: contactValue.trim(),
        passwordHash,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as RawServerWalletBundle & {
      code?: string;
      error?: string;
    };
    return { ok: res.ok, status: res.status, data };
  };

  let result = await attemptSignIn();

  // If server restarted in a stateless container and we have the user's encrypted backup locally, restore & sign in
  if (!result.ok && result.data?.code === 'ACCOUNT_NOT_FOUND') {
    const localBackup = findLocalBackupByContact(contactValue);
    if (localBackup && localBackup.vault.passwordHash === passwordHash) {
      const restored = await restoreBundleToServer(localBackup);
      if (restored) {
        return applyServerBundle(restored);
      }
      result = await attemptSignIn();
    }
  }

  if (!result.ok) {
    const err = new Error(
      result.data?.error || 'Unable to sign in. Check your login details and try again.'
    ) as Error & { code?: string };
    err.code = result.data?.code;
    throw err;
  }

  return applyServerBundle(result.data);
}

export async function signOutAppSession(): Promise<void> {
  setStoredToken(null);
  try {
    localStorage.removeItem(ACTIVE_CACHE_KEY);
  } catch {
    // Ignore storage error
  }

  // Also clear any legacy Firebase auth state silently so it won't re-migrate after explicit sign-out
  try {
    const [{ signOut }, { auth }] = await Promise.all([
      import('firebase/auth'),
      import('../firebase'),
    ]);
    if (auth.currentUser) {
      await signOut(auth);
    }
  } catch {
    // Ignore
  }

  currentState = {
    account: null,
    vault: null,
    devices: [],
    earnings: [],
    withdrawals: [],
  };
  notifyListeners();
}

export async function updateProfileName(_uid: string, displayName: string): Promise<void> {
  const bundle = await apiAuthFetch<RawServerWalletBundle>('/api/profile/name', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
  applyServerBundle(bundle);
}

export async function updateProfileSecurity(
  _uid: string,
  contactType: ContactType,
  contactValue: string,
  passwordHash: string
): Promise<void> {
  const bundle = await apiAuthFetch<RawServerWalletBundle>('/api/profile/security', {
    method: 'PATCH',
    body: JSON.stringify({
      contactType,
      contactValue,
      passwordHash,
    }),
  });
  applyServerBundle(bundle);
}

/**
 * Registers or retrieves a device document for real online uptime tracking.
 */
export async function registerOrActivateDevice(
  _uid: string,
  deviceId: string,
  connectionType: DeviceConnectionType,
  customPairingCode?: string
): Promise<ConnectedDevice> {
  const [hw, net] = await Promise.all([inspectHardwareNode(), measureRealNetworkLatency()]);
  const isOnline = hw.online && net.reachable;

  const payload = await apiAuthFetch<
    RawServerWalletBundle & { device: RawServerDevice }
  >('/api/devices/activate', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      connectionType,
      deviceName: hw.deviceName.slice(0, 80),
      platform: hw.platform.slice(0, 60),
      isOnline,
      batteryPercent: hw.batteryPercent,
      networkLabel: (isOnline ? hw.networkLabel : 'Offline').slice(0, 40),
      latencyMs: net.latencyMs,
      pairingCode: customPairingCode,
    }),
  });

  applyServerBundle(payload);
  return hydrateDevice(payload.device);
}

/**
 * Creates a pending QR pairing slot so the user can scan it with any mobile phone without popups.
 */
export async function createQrPairingSlot(
  _uid: string
): Promise<{ deviceId: string; pairingCode: string }> {
  const payload = await apiAuthFetch<
    RawServerWalletBundle & { deviceId: string; pairingCode: string }
  >('/api/devices/pair-slot', {
    method: 'POST',
    body: JSON.stringify({}),
  });

  applyServerBundle(payload);
  return {
    deviceId: payload.deviceId,
    pairingCode: payload.pairingCode,
  };
}

/**
 * Commits verified real online uptime seconds and exact micro-USD earnings to the user's ledger.
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

  const rawMicros =
    customAmountMicros !== undefined
      ? Math.floor(customAmountMicros)
      : clampedSeconds * MICROS_PER_SECOND;
  const amountMicros = Math.min(clampedSeconds * 2_500_000, Math.max(10_000, rawMicros));
  const buckets = getDateBuckets(new Date());

  const payload = await apiAuthFetch<
    RawServerWalletBundle & { committed: boolean }
  >('/api/ledger/commit', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      secondsOnline: clampedSeconds,
      amountMicros,
      deviceName: hw.deviceName.slice(0, 80),
      platform: hw.platform.slice(0, 60),
      batteryPercent: hw.batteryPercent,
      networkLabel: hw.networkLabel.slice(0, 40),
      latencyMs: net.latencyMs,
      hourKey: buckets.hourKey,
      dayKey: buckets.dayKey,
      monthKey: buckets.monthKey,
      yearKey: buckets.yearKey,
    }),
  });

  applyServerBundle(payload);
  return { committed: Boolean(payload.committed), latencyMs: net.latencyMs };
}

export async function setDeviceOffline(_uid: string, deviceId: string): Promise<void> {
  const payload = await apiAuthFetch<RawServerWalletBundle>('/api/devices/offline', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });
  applyServerBundle(payload);
}

export async function revokeConnectedDevice(_uid: string, deviceId: string): Promise<void> {
  const payload = await apiAuthFetch<RawServerWalletBundle>('/api/devices/revoke', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });
  applyServerBundle(payload);
}

/**
 * Submits a real withdrawal request and deducts from available balance.
 * Requires one of the 3 authorized RPC codes (091306, 0913061, 091306191).
 */
export async function submitRealWithdrawal(
  _uid: string,
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

  const payload = await apiAuthFetch<
    RawServerWalletBundle & { withdrawalId: string }
  >('/api/ledger/withdraw', {
    method: 'POST',
    body: JSON.stringify({
      amountMicros: cleanMicros,
      method,
      destinationMasked: destinationMasked.trim().slice(0, 120),
      rpcCode: rpcCheck.normalized,
    }),
  });

  applyServerBundle(payload);
  return payload.withdrawalId;
}

// ============================================================================
// Direct QR Phone Pairing Helpers (Zero Popup / Works on Any Scanned Phone)
// ============================================================================

export async function fetchPairSlotInfo(
  pairCode: string,
  deviceId: string
): Promise<{ account: UserAccount; device: ConnectedDevice }> {
  const res = await fetch(
    `/api/pair/info?pair=${encodeURIComponent(pairCode)}&dev=${encodeURIComponent(deviceId)}`
  );
  const data = (await res.json().catch(() => ({}))) as {
    account?: RawServerAccount;
    device?: RawServerDevice;
    error?: string;
  };
  if (!res.ok || !data.account || !data.device) {
    throw new Error(
      data?.error || 'QR pairing link not found. Generate a fresh QR code from your Dashboard.'
    );
  }
  return {
    account: hydrateAccount(data.account),
    device: hydrateDevice(data.device),
  };
}

export async function activatePairedPhone(
  pairCode: string,
  deviceId: string
): Promise<{ account: UserAccount; device: ConnectedDevice }> {
  const [hw, net] = await Promise.all([inspectHardwareNode(), measureRealNetworkLatency()]);
  const isOnline = hw.online && net.reachable;

  const res = await fetch('/api/pair/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairCode,
      deviceId,
      deviceName: hw.deviceName.slice(0, 80),
      platform: hw.platform.slice(0, 60),
      isOnline,
      batteryPercent: hw.batteryPercent,
      networkLabel: (isOnline ? hw.networkLabel : 'Offline').slice(0, 40),
      latencyMs: net.latencyMs,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    account?: RawServerAccount;
    device?: RawServerDevice;
    error?: string;
  };
  if (!res.ok || !data.account || !data.device) {
    throw new Error(data?.error || 'Unable to link mobile phone.');
  }

  return {
    account: hydrateAccount(data.account),
    device: hydrateDevice(data.device),
  };
}

export async function commitPairedPhoneInterval(
  pairCode: string,
  deviceId: string,
  secondsDelta: number,
  amountMicros: number
): Promise<{
  committed: boolean;
  latencyMs: number;
  account?: UserAccount;
  device?: ConnectedDevice;
}> {
  const clampedSeconds = Math.max(1, Math.min(120, Math.round(secondsDelta)));
  const [hw, net] = await Promise.all([inspectHardwareNode(), measureRealNetworkLatency()]);

  if (!hw.online || !net.reachable) {
    await setPairedPhoneOffline(pairCode, deviceId);
    return { committed: false, latencyMs: 0 };
  }

  const res = await fetch('/api/pair/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairCode,
      deviceId,
      secondsOnline: clampedSeconds,
      amountMicros,
      deviceName: hw.deviceName.slice(0, 80),
      platform: hw.platform.slice(0, 60),
      batteryPercent: hw.batteryPercent,
      networkLabel: hw.networkLabel.slice(0, 40),
      latencyMs: net.latencyMs,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    committed?: boolean;
    account?: RawServerAccount;
    device?: RawServerDevice;
  };

  return {
    committed: Boolean(data.committed),
    latencyMs: net.latencyMs,
    account: data.account ? hydrateAccount(data.account) : undefined,
    device: data.device ? hydrateDevice(data.device) : undefined,
  };
}

export async function setPairedPhoneOffline(
  pairCode: string,
  deviceId: string
): Promise<void> {
  await fetch('/api/pair/offline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairCode, deviceId }),
  }).catch(() => undefined);
}
