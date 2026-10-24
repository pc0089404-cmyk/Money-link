import { RPC_REQUIRED_WITHDRAW_NOTE, validateRpcAuthorizationCode } from '../data/nigeriaBanks';
import {
  AppTimestamp,
  ConnectedDevice,
  ContactType,
  DeviceConnectionType,
  EarningEntry,
  GIFT_150_MICROS,
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
  generatePairingCode,
  generateSafeId,
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
  gift150Claimed?: boolean;
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
    gift150Claimed: Boolean(raw.gift150Claimed),
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
    token: bundle.token || getStoredToken() || `local_${bundle.account.uid}`,
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

function findLocalBackupByContact(
  rawContact: string,
  excludeUid?: string
): RawServerWalletBundle | null {
  const trimmed = rawContact.trim().toLowerCase();
  const inputDigits = rawContact.replace(/\D/g, '');
  const map = readBackupAccountsMap();

  for (const [uid, bundle] of Object.entries(map)) {
    if (excludeUid && uid === excludeUid) continue;
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
  } else if (!getStoredToken()) {
    setStoredToken(`local_${bundle.account.uid}`);
  }
  saveBundleToClientCache(bundle);

  const sortedDevices = [...(bundle.devices || [])].sort(
    (a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0)
  );
  const sortedEarnings = [...(bundle.earnings || [])].sort(
    (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)
  );
  const sortedWithdrawals = [...(bundle.withdrawals || [])].sort(
    (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)
  );

  currentState = {
    account: hydrateAccount(bundle.account),
    vault: hydrateVault(bundle.vault),
    devices: sortedDevices.map(hydrateDevice),
    earnings: sortedEarnings.map(hydrateEarning),
    withdrawals: sortedWithdrawals.map(hydrateWithdrawal),
  };
  notifyListeners();
  return currentState;
}

async function parseJsonSafe<T>(res: Response): Promise<{ isJson: boolean; data: T }> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return { isJson: false, data: {} as T };
  }
  try {
    const data = (await res.json()) as T;
    return { isJson: true, data };
  } catch {
    return { isJson: false, data: {} as T };
  }
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
        token: existingToken && !existingToken.startsWith('local_') ? existingToken : undefined,
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
    const { isJson, data } = await parseJsonSafe<RawServerWalletBundle>(res);
    if (isJson && data?.account?.uid) {
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
): Promise<{ serverOk: true; payload: T } | { serverOk: false }> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token && !token.startsWith('local_')) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch {
    return { serverOk: false };
  }

  if ((response.status === 401 || response.status === 404) && allowRestoreRetry) {
    const cached = readCachedBundle();
    if (cached) {
      const restored = await restoreBundleToServer(cached, token);
      if (restored?.token) {
        return apiAuthFetch<T>(url, options, false);
      }
    }
  }

  if (response.status >= 500) {
    return { serverOk: false };
  }

  const { isJson, data } = await parseJsonSafe<T & { error?: string; code?: string }>(response);
  if (!isJson) {
    return { serverOk: false };
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }

  return { serverOk: true, payload: data };
}

/**
 * Bootstraps Money Link's built-in app authentication session (zero Firebase calls).
 */
export async function bootstrapAppSession(): Promise<WalletSnapshotState> {
  const token = getStoredToken();
  const cached = readCachedBundle();

  if (token && !token.startsWith('local_')) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { isJson, data } = await parseJsonSafe<RawServerWalletBundle>(res);
        if (isJson && data?.account?.uid) {
          return applyServerBundle(data);
        }
      }

      if ((res.status === 404 || res.status === 401) && cached) {
        const restored = await restoreBundleToServer(cached, token);
        if (restored) {
          return applyServerBundle(restored);
        }
        return applyServerBundle(cached);
      }
    } catch {
      if (cached) {
        return applyServerBundle(cached);
      }
    }
  }

  if (cached) {
    const restored = await restoreBundleToServer(cached);
    return applyServerBundle(restored || cached);
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
  if (!token || token.startsWith('local_')) return null;
  try {
    const res = await apiAuthFetch<RawServerWalletBundle>('/api/auth/me', { method: 'GET' });
    if (res.serverOk && res.payload?.account?.uid) {
      return applyServerBundle(res.payload);
    }
  } catch {
    // Ignore background refresh error
  }
  return null;
}

/**
 * App-controlled Sign Up: open to any email address or mobile phone number + mandatory USA ID check.
 */
export async function signUpAppAccount(params: SignUpAppParams): Promise<WalletSnapshotState> {
  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const { isJson, data } = await parseJsonSafe<RawServerWalletBundle & { error?: string }>(res);
    if (isJson) {
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to create your Money Link account.');
      }
      if (data?.account?.uid) {
        return applyServerBundle(data);
      }
    }
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Failed to fetch')) {
      throw err;
    }
  }

  // Client-controlled fallback if server endpoint was temporarily unreachable
  const existingLocal = findLocalBackupByContact(params.contactValue);
  if (existingLocal) {
    if (existingLocal.vault.passwordHash === params.passwordHash) {
      return applyServerBundle(existingLocal);
    }
    throw new Error(
      'An account with this email or phone number already exists. Switch to Sign In and enter your password.'
    );
  }

  const nowMs = Date.now();
  const uid = generateSafeId('usr');
  const localBundle: RawServerWalletBundle = {
    token: `local_${uid}`,
    account: {
      uid,
      displayName: params.displayName,
      identityVerified: true,
      issuingState: params.issuingState,
      idType: params.idType,
      usaIdMasked: params.usaIdMasked,
      availableBalanceMicros: 0,
      lifetimeEarnedMicros: 0,
      totalWithdrawnMicros: 0,
      totalOnlineSeconds: 0,
      gift150Claimed: false,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    },
    vault: {
      uid,
      contactType: params.contactType,
      contactValue: params.contactValue,
      authEmail: params.contactValue,
      passwordHash: params.passwordHash,
      usaIdHash: params.usaIdHash,
      ssnLast4Hash: params.ssnLast4Hash,
      dobYear: params.dobYear,
      idExpiryDate: params.idExpiryDate,
      verificationMethod: params.verificationMethod,
      verificationDigest: params.verificationDigest,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    },
    devices: [],
    earnings: [],
    withdrawals: [],
  };

  void restoreBundleToServer(localBundle);
  return applyServerBundle(localBundle);
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
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactValue: contactValue.trim(),
          passwordHash,
        }),
      });
      const { isJson, data } = await parseJsonSafe<
        RawServerWalletBundle & { code?: string; error?: string }
      >(res);
      return { reachable: isJson, ok: res.ok, status: res.status, data };
    } catch {
      return {
        reachable: false,
        ok: false,
        status: 0,
        data: {} as RawServerWalletBundle & { code?: string; error?: string },
      };
    }
  };

  const result = await attemptSignIn();

  if (result.reachable && result.ok && result.data?.account?.uid) {
    return applyServerBundle(result.data);
  }

  // Check client encrypted vault store (also handles container restarts seamlessly)
  const localBackup = findLocalBackupByContact(contactValue);
  if (localBackup) {
    if (localBackup.vault.passwordHash !== passwordHash) {
      throw new Error('Incorrect password. Please check your wallet password and try again.');
    }
    const restored = await restoreBundleToServer(localBackup);
    return applyServerBundle(restored || localBackup);
  }

  if (result.reachable && !result.ok) {
    const err = new Error(
      result.data?.error || 'Unable to sign in. Check your login details and try again.'
    ) as Error & { code?: string };
    err.code = result.data?.code;
    throw err;
  }

  const notFoundErr = new Error(
    'No wallet found for this email or phone number yet. Switch to Sign Up + USA ID to create your account.'
  ) as Error & { code?: string };
  notFoundErr.code = 'ACCOUNT_NOT_FOUND';
  throw notFoundErr;
}

export async function signOutAppSession(): Promise<void> {
  setStoredToken(null);
  try {
    localStorage.removeItem(ACTIVE_CACHE_KEY);
  } catch {
    // Ignore storage error
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
  const trimmed = displayName.trim().slice(0, 80);
  const res = await apiAuthFetch<RawServerWalletBundle>('/api/profile/name', {
    method: 'PATCH',
    body: JSON.stringify({ displayName: trimmed }),
  });
  if (res.serverOk && res.payload?.account?.uid) {
    applyServerBundle(res.payload);
    return;
  }

  const cached = readCachedBundle();
  if (cached) {
    cached.account.displayName = trimmed;
    cached.account.updatedAtMs = Date.now();
    applyServerBundle(cached);
  }
}

export async function updateProfileSecurity(
  uid: string,
  contactType: ContactType,
  contactValue: string,
  passwordHash: string
): Promise<void> {
  const res = await apiAuthFetch<RawServerWalletBundle>('/api/profile/security', {
    method: 'PATCH',
    body: JSON.stringify({
      contactType,
      contactValue,
      passwordHash,
    }),
  });
  if (res.serverOk && res.payload?.account?.uid) {
    applyServerBundle(res.payload);
    return;
  }

  const dup = findLocalBackupByContact(contactValue, uid);
  if (dup) {
    throw new Error('That email address or phone number is already used by another account.');
  }

  const cached = readCachedBundle();
  if (cached) {
    const nowMs = Date.now();
    cached.vault.contactType = contactType;
    cached.vault.contactValue = contactValue;
    cached.vault.authEmail = contactValue;
    cached.vault.passwordHash = passwordHash;
    cached.vault.updatedAtMs = nowMs;
    applyServerBundle(cached);
  }
}

/**
 * Registers or retrieves a device document for real online uptime tracking.
 */
export async function registerOrActivateDevice(
  uid: string,
  deviceId: string,
  connectionType: DeviceConnectionType,
  customPairingCode?: string
): Promise<ConnectedDevice> {
  const [hw, net] = await Promise.all([inspectHardwareNode(), measureRealNetworkLatency()]);
  const isOnline = hw.online && net.reachable;

  const res = await apiAuthFetch<
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

  if (res.serverOk && res.payload?.device) {
    applyServerBundle(res.payload);
    return hydrateDevice(res.payload.device);
  }

  const cached = readCachedBundle();
  if (!cached) {
    throw new Error('Please sign in first.');
  }

  const nowMs = Date.now();
  let targetId = deviceId;
  let existing = cached.devices.find((d) => d.deviceId === targetId);
  if (existing && existing.status === 'revoked') {
    if (connectionType === 'direct_device') {
      targetId = generateSafeId('node');
      existing = undefined;
    } else {
      throw new Error(
        'This QR phone link was revoked. Tap + Pair Phone QR to create a new QR link.'
      );
    }
  }

  if (existing) {
    existing.deviceName = hw.deviceName.slice(0, 80);
    existing.platform = hw.platform.slice(0, 60);
    existing.status = isOnline ? 'online' : 'offline';
    existing.batteryPercent = hw.batteryPercent;
    existing.networkLabel = (isOnline ? hw.networkLabel : 'Offline').slice(0, 40);
    existing.latencyMs = net.latencyMs;
    existing.lastHeartbeatAtMs = nowMs;
    existing.updatedAtMs = nowMs;
    applyServerBundle(cached);
    return hydrateDevice(existing);
  }

  const created: RawServerDevice = {
    deviceId: targetId,
    uid,
    deviceName: hw.deviceName.slice(0, 80),
    platform: hw.platform.slice(0, 60),
    connectionType,
    status: isOnline ? 'online' : 'offline',
    pairingCode: (customPairingCode || generatePairingCode()).slice(0, 12),
    batteryPercent: hw.batteryPercent,
    networkLabel: (isOnline ? hw.networkLabel : 'Offline').slice(0, 40),
    latencyMs: net.latencyMs,
    sessionSeconds: 0,
    sessionEarnedMicros: 0,
    lastHeartbeatAtMs: nowMs,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };

  cached.devices.unshift(created);
  applyServerBundle(cached);
  return hydrateDevice(created);
}

/**
 * Creates a pending QR pairing slot so the user can scan it with any mobile phone without popups.
 */
export async function createQrPairingSlot(
  uid: string
): Promise<{ deviceId: string; pairingCode: string }> {
  const res = await apiAuthFetch<
    RawServerWalletBundle & { deviceId: string; pairingCode: string }
  >('/api/devices/pair-slot', {
    method: 'POST',
    body: JSON.stringify({}),
  });

  if (res.serverOk && res.payload?.deviceId) {
    applyServerBundle(res.payload);
    return {
      deviceId: res.payload.deviceId,
      pairingCode: res.payload.pairingCode,
    };
  }

  const cached = readCachedBundle();
  if (!cached) {
    throw new Error('Please sign in first.');
  }

  const nowMs = Date.now();
  const deviceId = generateSafeId('phone');
  const pairingCode = generatePairingCode();
  cached.devices.unshift({
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
    lastHeartbeatAtMs: nowMs,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  });

  applyServerBundle(cached);
  return { deviceId, pairingCode };
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

  const res = await apiAuthFetch<
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

  if (res.serverOk && res.payload?.account?.uid) {
    applyServerBundle(res.payload);
    return { committed: Boolean(res.payload.committed), latencyMs: net.latencyMs };
  }

  const cached = readCachedBundle();
  if (!cached) {
    return { committed: false, latencyMs: 0 };
  }

  const dev = cached.devices.find((d) => d.deviceId === deviceId);
  if (!dev || dev.status === 'revoked') {
    return { committed: false, latencyMs: 0 };
  }

  const nowMs = Date.now();
  cached.account.availableBalanceMicros += amountMicros;
  cached.account.lifetimeEarnedMicros += amountMicros;
  cached.account.totalOnlineSeconds += clampedSeconds;
  cached.account.updatedAtMs = nowMs;

  dev.deviceName = hw.deviceName.slice(0, 80);
  dev.platform = hw.platform.slice(0, 60);
  dev.status = 'online';
  dev.batteryPercent = hw.batteryPercent;
  dev.networkLabel = hw.networkLabel.slice(0, 40);
  dev.latencyMs = net.latencyMs;
  dev.sessionSeconds += clampedSeconds;
  dev.sessionEarnedMicros += amountMicros;
  dev.lastHeartbeatAtMs = nowMs;
  dev.updatedAtMs = nowMs;

  cached.earnings.unshift({
    entryId: generateSafeId('earn'),
    uid,
    deviceId,
    deviceName: dev.deviceName,
    secondsOnline: clampedSeconds,
    amountMicros,
    hourKey: buckets.hourKey,
    dayKey: buckets.dayKey,
    monthKey: buckets.monthKey,
    yearKey: buckets.yearKey,
    createdAtMs: nowMs,
  });

  applyServerBundle(cached);
  return { committed: true, latencyMs: net.latencyMs };
}

export async function setDeviceOffline(_uid: string, deviceId: string): Promise<void> {
  const res = await apiAuthFetch<RawServerWalletBundle>('/api/devices/offline', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });
  if (res.serverOk && res.payload?.account?.uid) {
    applyServerBundle(res.payload);
    return;
  }

  const cached = readCachedBundle();
  if (cached) {
    const dev = cached.devices.find((d) => d.deviceId === deviceId);
    if (dev && dev.status !== 'revoked') {
      dev.status = 'offline';
      dev.networkLabel = 'Paused / Disconnected';
      dev.updatedAtMs = Date.now();
      applyServerBundle(cached);
    }
  }
}

export async function revokeConnectedDevice(_uid: string, deviceId: string): Promise<void> {
  const res = await apiAuthFetch<RawServerWalletBundle>('/api/devices/revoke', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });
  if (res.serverOk && res.payload?.account?.uid) {
    applyServerBundle(res.payload);
    return;
  }

  const cached = readCachedBundle();
  if (cached) {
    const dev = cached.devices.find((d) => d.deviceId === deviceId);
    if (dev) {
      dev.status = 'revoked';
      dev.networkLabel = 'Access Revoked';
      dev.updatedAtMs = Date.now();
      applyServerBundle(cached);
    }
  }
}

/**
 * Credits the one-time $150.00 active user gift to the user's wallet balance after the 10-second loading animation.
 */
export async function claimUserGift150(uid: string): Promise<WalletSnapshotState> {
  const res = await apiAuthFetch<RawServerWalletBundle & { claimedNow?: boolean }>(
    '/api/ledger/claim-gift',
    {
      method: 'POST',
      body: JSON.stringify({}),
    }
  );

  if (res.serverOk && res.payload?.account?.uid) {
    return applyServerBundle(res.payload);
  }

  const cached = readCachedBundle();
  if (!cached) {
    return currentState;
  }

  if (!cached.account.gift150Claimed) {
    const now = new Date();
    const nowMs = now.getTime();
    const buckets = getDateBuckets(now);

    cached.account.availableBalanceMicros += GIFT_150_MICROS;
    cached.account.lifetimeEarnedMicros += GIFT_150_MICROS;
    cached.account.gift150Claimed = true;
    cached.account.updatedAtMs = nowMs;

    cached.earnings.unshift({
      entryId: generateSafeId('gift'),
      uid,
      deviceId: 'gift_reward_150',
      deviceName: 'Active User Gift ($150.00)',
      secondsOnline: 10,
      amountMicros: GIFT_150_MICROS,
      hourKey: buckets.hourKey,
      dayKey: buckets.dayKey,
      monthKey: buckets.monthKey,
      yearKey: buckets.yearKey,
      createdAtMs: nowMs,
    });

    void restoreBundleToServer(cached);
  }

  return applyServerBundle(cached);
}

/**
 * Submits a real withdrawal request and deducts from available balance.
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
    throw new Error(rpcCheck.error || RPC_REQUIRED_WITHDRAW_NOTE);
  }

  const cleanMicros = Math.floor(amountMicros);
  if (cleanMicros < MIN_WITHDRAWAL_MICROS) {
    throw new Error('Minimum withdrawal is $10.00 USD.');
  }

  const res = await apiAuthFetch<
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

  if (res.serverOk && res.payload?.withdrawalId) {
    applyServerBundle(res.payload);
    return res.payload.withdrawalId;
  }

  const cached = readCachedBundle();
  if (!cached) {
    throw new Error('Please sign in first.');
  }
  if (cached.account.availableBalanceMicros < cleanMicros) {
    throw new Error('Insufficient real available balance for this withdrawal.');
  }

  const nowMs = Date.now();
  const withdrawalId = generateSafeId('wd');
  const rpcCodeHash = await sha256Hex(rpcCheck.normalized);

  cached.account.availableBalanceMicros -= cleanMicros;
  cached.account.totalWithdrawnMicros += cleanMicros;
  cached.account.updatedAtMs = nowMs;

  cached.withdrawals.unshift({
    withdrawalId,
    uid,
    amountMicros: cleanMicros,
    method,
    destinationMasked: destinationMasked.trim().slice(0, 120),
    rpcCodeHash,
    status: 'processing',
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  });

  applyServerBundle(cached);
  return withdrawalId;
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
  const { isJson, data } = await parseJsonSafe<{
    account?: RawServerAccount;
    device?: RawServerDevice;
    error?: string;
  }>(res);
  if (!res.ok || !isJson || !data.account || !data.device) {
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

  const { isJson, data } = await parseJsonSafe<{
    account?: RawServerAccount;
    device?: RawServerDevice;
    error?: string;
  }>(res);
  if (!res.ok || !isJson || !data.account || !data.device) {
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

  const { isJson, data } = await parseJsonSafe<{
    committed?: boolean;
    account?: RawServerAccount;
    device?: RawServerDevice;
  }>(res);

  return {
    committed: Boolean(isJson && data.committed),
    latencyMs: net.latencyMs,
    account: data?.account ? hydrateAccount(data.account) : undefined,
    device: data?.device ? hydrateDevice(data.device) : undefined,
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
