import 'dotenv/config';
import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function resolveWritableDataDir(): string {
  const localDir = path.resolve(__dirname, '.data');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.accessSync(localDir, fs.constants.W_OK);
    return localDir;
  } catch {
    const tmpDir = path.join('/tmp', 'moneylink-data');
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch {
      // Ignore
    }
    return tmpDir;
  }
}

const DATA_DIR = resolveWritableDataDir();
const DB_FILE = path.join(DATA_DIR, 'moneylink-db.json');

const SESSION_SECRET = crypto
  .createHash('sha256')
  .update(
    `moneylink_auth_secret:${process.env.APP_AUTH_SECRET || ''}:${
      process.env.APP_URL || 'moneylink-local'
    }`
  )
  .digest('hex');

const VALID_RPC_CODES = new Set<string>(['091306', '0913061', '091306191']);
const RPC_REQUIRED_NOTE =
  'You need your RPC to withdraw. Kindly buy from our official website.';
const MIN_WITHDRAWAL_MICROS = 10_000_000;
const GIFT_150_MICROS = 150_000_000;

interface ServerUserAccount {
  uid: string;
  displayName: string;
  identityVerified: boolean;
  issuingState: string;
  idType: 'drivers_license' | 'state_id' | 'passport_card';
  usaIdMasked: string;
  availableBalanceMicros: number;
  lifetimeEarnedMicros: number;
  totalWithdrawnMicros: number;
  totalOnlineSeconds: number;
  gift150Claimed?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

interface ServerUserVault {
  uid: string;
  contactType: 'gmail' | 'email' | 'phone';
  contactValue: string;
  authEmail: string;
  passwordHash: string;
  usaIdHash: string;
  ssnLast4Hash: string;
  dobYear: number;
  idExpiryDate: string;
  verificationMethod: 'camera_liveness' | 'document_attestation';
  verificationDigest: string;
  createdAtMs: number;
  updatedAtMs: number;
}

interface ServerConnectedDevice {
  deviceId: string;
  uid: string;
  deviceName: string;
  platform: string;
  connectionType: 'qr_paired_phone' | 'direct_device';
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

interface ServerEarningEntry {
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

interface ServerWithdrawalRequest {
  withdrawalId: string;
  uid: string;
  amountMicros: number;
  method: 'local_bank_ng' | 'us_bank_ach' | 'paypal' | 'venmo';
  destinationMasked: string;
  rpcCodeHash: string;
  status: 'processing' | 'completed' | 'cancelled';
  createdAtMs: number;
  updatedAtMs: number;
}

interface ServerUserRecord {
  account: ServerUserAccount;
  vault: ServerUserVault;
  devices: Record<string, ServerConnectedDevice>;
  earnings: ServerEarningEntry[];
  withdrawals: ServerWithdrawalRequest[];
}

interface ServerDatabase {
  users: Record<string, ServerUserRecord>;
}

function loadDatabase(): ServerDatabase {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as ServerDatabase;
      if (parsed && typeof parsed.users === 'object' && parsed.users !== null) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read Money Link DB, initializing empty store:', err);
  }
  return { users: {} };
}

const dbStore: ServerDatabase = loadDatabase();

function saveDatabase(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(dbStore), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('Failed to persist Money Link DB:', err);
  }
}

function signSessionToken(uid: string): string {
  const payload = Buffer.from(JSON.stringify({ uid, v: 1 }), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      uid?: string;
    };
    if (parsed.uid && /^[a-zA-Z0-9_-]{4,128}$/.test(parsed.uid)) {
      return parsed.uid;
    }
  } catch {
    return null;
  }
  return null;
}

function extractBearerUid(req: Request): string | null {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return verifySessionToken(header.slice(7));
}

function sha256AppHex(value: string): string {
  return crypto.createHash('sha256').update(`moneylink_v1:${value}`).digest('hex');
}

function contactMatchesVault(rawInput: string, vault: ServerUserVault): boolean {
  const trimmed = rawInput.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed === vault.contactValue.toLowerCase()) return true;
  if (vault.authEmail && trimmed === vault.authEmail.toLowerCase()) return true;

  const inputDigits = rawInput.replace(/\D/g, '');
  const storedDigits = vault.contactValue.replace(/\D/g, '');
  if (inputDigits.length >= 7 && storedDigits.length >= 7) {
    if (inputDigits === storedDigits) return true;
    if (
      inputDigits.length >= 10 &&
      storedDigits.length >= 10 &&
      inputDigits.slice(-10) === storedDigits.slice(-10)
    ) {
      return true;
    }
  }
  return false;
}

function findUserByContact(rawContact: string, excludeUid?: string): ServerUserRecord | null {
  for (const [uid, record] of Object.entries(dbStore.users)) {
    if (excludeUid && uid === excludeUid) continue;
    if (contactMatchesVault(rawContact, record.vault)) {
      return record;
    }
  }
  return null;
}

function findUserByPairSlot(
  pairCode: string,
  deviceId: string
): { record: ServerUserRecord; device: ServerConnectedDevice } | null {
  for (const record of Object.values(dbStore.users)) {
    const dev = record.devices[deviceId];
    if (dev && dev.pairingCode === pairCode && dev.status !== 'revoked') {
      return { record, device: dev };
    }
  }
  return null;
}

function serializeWalletBundle(record: ServerUserRecord) {
  const devices = Object.values(record.devices).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  const earnings = [...record.earnings].sort((a, b) => b.createdAtMs - a.createdAtMs);
  const withdrawals = [...record.withdrawals].sort((a, b) => b.createdAtMs - a.createdAtMs);
  return {
    account: record.account,
    vault: record.vault,
    devices,
    earnings,
    withdrawals,
  };
}

/**
 * Official CBN Revised NUBAN 10-digit Check-Digit Validator.
 */
function verifyCbnNubanCheckDigit(bankCode: string, accountNumber: string): boolean {
  if (!/^\d{10}$/.test(accountNumber)) return false;
  const cleanCode = bankCode.replace(/\D/g, '');
  if (!cleanCode) return false;

  let bank9 = '';
  if (cleanCode.length === 3) {
    bank9 = `000000${cleanCode}`;
  } else if (cleanCode.length === 5) {
    bank9 = `9000${cleanCode}`;
  } else if (cleanCode.length === 6) {
    bank9 = `900${cleanCode}`;
  } else {
    return true;
  }

  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3];
  const combined = `${bank9}${accountNumber.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 18; i += 1) {
    sum += Number(combined[i]) * weights[i];
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(accountNumber[9]);
}

function getValidPaystackKey(): string | null {
  const raw = (process.env.PAYSTACK_SECRET_KEY || '').trim();
  if (!raw || raw === 'MY_PAYSTACK_SECRET_KEY' || raw.length < 12) {
    return null;
  }
  return raw;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/ping', (_req: Request, res: Response) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // ============================================================================
  // 1. APP-CONTROLLED AUTHENTICATION & SESSION ENDPOINTS (Open to ANY User)
  // ============================================================================

  app.post('/api/auth/signup', (req: Request, res: Response) => {
    const body = req.body as {
      displayName?: string;
      contactType?: 'gmail' | 'email' | 'phone';
      contactValue?: string;
      passwordHash?: string;
      issuingState?: string;
      idType?: 'drivers_license' | 'state_id' | 'passport_card';
      usaIdMasked?: string;
      usaIdHash?: string;
      ssnLast4Hash?: string;
      dobYear?: number;
      idExpiryDate?: string;
      verificationMethod?: 'camera_liveness' | 'document_attestation';
      verificationDigest?: string;
    };

    const displayName = String(body.displayName || '').trim().slice(0, 80);
    const contactValue = String(body.contactValue || '').trim().slice(0, 120);
    const contactType =
      body.contactType === 'phone' || body.contactType === 'gmail' ? body.contactType : 'email';
    const passwordHash = String(body.passwordHash || '').trim();
    const issuingState = String(body.issuingState || '').trim().toUpperCase();
    const idType =
      body.idType === 'state_id' || body.idType === 'passport_card'
        ? body.idType
        : 'drivers_license';
    const usaIdMasked = String(body.usaIdMasked || '').trim().slice(0, 32);
    const usaIdHash = String(body.usaIdHash || '').trim();
    const ssnLast4Hash = String(body.ssnLast4Hash || '').trim();
    const dobYear = Math.trunc(Number(body.dobYear || 0));
    const idExpiryDate = String(body.idExpiryDate || '').trim();
    const verificationMethod =
      body.verificationMethod === 'camera_liveness' ? 'camera_liveness' : 'document_attestation';
    const verificationDigest = String(body.verificationDigest || '').trim().slice(0, 64);

    if (displayName.length < 2) {
      res.status(400).json({ error: 'Enter your full legal name (2–80 characters).' });
      return;
    }
    if (contactValue.length < 5) {
      res.status(400).json({ error: 'Enter a valid email address or mobile phone number.' });
      return;
    }
    if (!/^[a-f0-9]{64}$/.test(passwordHash)) {
      res.status(400).json({ error: 'Invalid password security hash.' });
      return;
    }
    if (!/^[A-Z]{2}$/.test(issuingState) || !usaIdMasked || !/^[a-f0-9]{64}$/.test(usaIdHash)) {
      res.status(400).json({
        error: 'Valid USA Government ID verification is required to create an account.',
      });
      return;
    }
    if (!/^[a-f0-9]{64}$/.test(ssnLast4Hash) || dobYear < 1900 || dobYear > 2008) {
      res.status(400).json({ error: 'Complete birth year (18+) and SSN/ITIN verification.' });
      return;
    }

    const existing = findUserByContact(contactValue);
    if (existing) {
      if (existing.vault.passwordHash === passwordHash) {
        const token = signSessionToken(existing.account.uid);
        res.json({
          token,
          ...serializeWalletBundle(existing),
        });
        return;
      }
      res.status(409).json({
        error:
          'An account with this email or phone number already exists. Switch to Sign In and enter your password.',
      });
      return;
    }

    const nowMs = Date.now();
    const uid = `usr_${nowMs.toString(36)}_${crypto.randomBytes(6).toString('hex')}`;

    const newRecord: ServerUserRecord = {
      account: {
        uid,
        displayName,
        identityVerified: true,
        issuingState,
        idType,
        usaIdMasked,
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
        contactType,
        contactValue,
        authEmail: contactValue,
        passwordHash,
        usaIdHash,
        ssnLast4Hash,
        dobYear,
        idExpiryDate: idExpiryDate || '2029-12-31',
        verificationMethod,
        verificationDigest: verificationDigest || `ATTEST_${usaIdHash.slice(0, 24)}`,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      },
      devices: {},
      earnings: [],
      withdrawals: [],
    };

    dbStore.users[uid] = newRecord;
    saveDatabase();

    const token = signSessionToken(uid);
    res.status(201).json({
      token,
      ...serializeWalletBundle(newRecord),
    });
  });

  app.post('/api/auth/signin', (req: Request, res: Response) => {
    const body = req.body as {
      contactValue?: string;
      passwordHash?: string;
    };

    const contactValue = String(body.contactValue || '').trim();
    const passwordHash = String(body.passwordHash || '').trim();

    if (!contactValue || !/^[a-f0-9]{64}$/.test(passwordHash)) {
      res.status(400).json({ error: 'Enter your registered email or phone number and password.' });
      return;
    }

    const found = findUserByContact(contactValue);
    if (!found) {
      res.status(404).json({
        code: 'ACCOUNT_NOT_FOUND',
        error:
          'No wallet found for this email or phone number yet. Switch to Sign Up + USA ID to create your account.',
      });
      return;
    }

    if (found.vault.passwordHash !== passwordHash) {
      res.status(401).json({
        error: 'Incorrect password. Please check your wallet password and try again.',
      });
      return;
    }

    const token = signSessionToken(found.account.uid);
    res.json({
      token,
      ...serializeWalletBundle(found),
    });
  });

  // Seamless session restore / migration so active users never lose their session across restarts
  app.post('/api/auth/restore', (req: Request, res: Response) => {
    const body = req.body as {
      token?: string;
      bundle?: {
        account: ServerUserAccount;
        vault: ServerUserVault;
        devices?: ServerConnectedDevice[];
        earnings?: ServerEarningEntry[];
        withdrawals?: ServerWithdrawalRequest[];
      };
    };

    const tokenUid = body.token ? verifySessionToken(body.token) : null;
    const bundle = body.bundle;

    if (tokenUid && dbStore.users[tokenUid]) {
      res.json({
        token: signSessionToken(tokenUid),
        ...serializeWalletBundle(dbStore.users[tokenUid]),
      });
      return;
    }

    if (!bundle?.account?.uid || !bundle?.vault?.passwordHash) {
      res.status(401).json({ error: 'No active session to restore.' });
      return;
    }

    const uid = tokenUid || bundle.account.uid;
    if (!/^[a-zA-Z0-9_-]{4,128}$/.test(uid)) {
      res.status(400).json({ error: 'Invalid user identifier.' });
      return;
    }

    if (!dbStore.users[uid]) {
      const devicesMap: Record<string, ServerConnectedDevice> = {};
      for (const d of bundle.devices || []) {
        if (d?.deviceId) {
          devicesMap[d.deviceId] = d;
        }
      }
      dbStore.users[uid] = {
        account: {
          ...bundle.account,
          uid,
          identityVerified: true,
          gift150Claimed: Boolean(bundle.account.gift150Claimed),
        },
        vault: { ...bundle.vault, uid },
        devices: devicesMap,
        earnings: Array.isArray(bundle.earnings) ? bundle.earnings : [],
        withdrawals: Array.isArray(bundle.withdrawals) ? bundle.withdrawals : [],
      };
      saveDatabase();
    }

    const record = dbStore.users[uid];
    res.json({
      token: signSessionToken(uid),
      ...serializeWalletBundle(record),
    });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const uid = extractBearerUid(req);
    if (!uid) {
      res.status(401).json({ error: 'Unauthenticated.' });
      return;
    }
    const record = dbStore.users[uid];
    if (!record) {
      res.status(404).json({ code: 'SESSION_MISSING_ON_SERVER', error: 'Session expired.' });
      return;
    }
    res.json(serializeWalletBundle(record));
  });

  // ============================================================================
  // 2. PROFILE & SECURITY UPDATES
  // ============================================================================

  app.patch('/api/profile/name', (req: Request, res: Response) => {
    const uid = extractBearerUid(req);
    if (!uid || !dbStore.users[uid]) {
      res.status(401).json({ error: 'Please sign in first.' });
      return;
    }
    const trimmed = String(req.body?.displayName || '').trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      res.status(400).json({ error: 'Legal name must be between 2 and 80 characters.' });
      return;
    }
    const record = dbStore.users[uid];
    record.account.displayName = trimmed;
    record.account.updatedAtMs = Date.now();
    saveDatabase();
    res.json(serializeWalletBundle(record));
  });

  app.patch('/api/profile/security', (req: Request, res: Response) => {
    const uid = extractBearerUid(req);
    if (!uid || !dbStore.users[uid]) {
      res.status(401).json({ error: 'Please sign in first.' });
      return;
    }

    const contactType =
      req.body?.contactType === 'phone' || req.body?.contactType === 'gmail'
        ? req.body.contactType
        : 'email';
    const contactValue = String(req.body?.contactValue || '').trim().slice(0, 120);
    const passwordHash = String(req.body?.passwordHash || '').trim();

    if (contactValue.length < 5 || !/^[a-f0-9]{64}$/.test(passwordHash)) {
      res.status(400).json({ error: 'Enter a valid email/phone and password.' });
      return;
    }

    const duplicate = findUserByContact(contactValue, uid);
    if (duplicate) {
      res.status(409).json({
        error: 'That email address or phone number is already used by another account.',
      });
      return;
    }

    const record = dbStore.users[uid];
    const nowMs = Date.now();
    record.vault.contactType = contactType;
    record.vault.contactValue = contactValue;
    record.vault.authEmail = contactValue;
    record.vault.passwordHash = passwordHash;
    record.vault.updatedAtMs = nowMs;
    saveDatabase();
    res.json(serializeWalletBundle(record));
  });

  // ============================================================================
  // 3. CONNECTED DEVICES, REAL ONLINE UPTIME LEDGER & WITHDRAWALS
  // ============================================================================

  app.post('/api/devices/activate', (req: Request, res: Response) => {
    const uid = extractBearerUid(req);
    if (!uid || !dbStore.users[uid]) {
      res.status(401).json({ error: 'Please sign in first.' });
      return;
    }

    const record = dbStore.users[uid];
    let deviceId = String(req.body?.deviceId || '').trim();
    const connectionType =
      req.body?.connectionType === 'qr_paired_phone' ? 'qr_paired_phone' : 'direct_device';
    const deviceName = String(req.body?.deviceName || 'Mobile Browser Node').trim().slice(0, 80);
    const platform = String(req.body?.platform || 'Web OS').trim().slice(0, 60);
    const isOnline = Boolean(req.body?.isOnline);
    const batteryPercent = Math.min(100, Math.max(0, Math.round(Number(req.body?.batteryPercent ?? 100))));
    const networkLabel = String(req.body?.networkLabel || 'Online').trim().slice(0, 40);
    const latencyMs = Math.min(10000, Math.max(0, Math.round(Number(req.body?.latencyMs ?? 12))));
    const customPairingCode = String(req.body?.pairingCode || '').trim();

    if (!/^[a-zA-Z0-9_-]{4,128}$/.test(deviceId)) {
      deviceId = `node_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    }

    const existing = record.devices[deviceId];
    const nowMs = Date.now();

    if (existing) {
      if (existing.status === 'revoked') {
        if (connectionType === 'direct_device') {
          deviceId = `node_${nowMs.toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
        } else {
          res.status(403).json({
            error: 'This QR phone link was revoked. Tap + Pair Phone QR to create a new QR link.',
          });
          return;
        }
      } else {
        existing.deviceName = deviceName;
        existing.platform = platform;
        existing.status = isOnline ? 'online' : 'offline';
        existing.batteryPercent = batteryPercent;
        existing.networkLabel = isOnline ? networkLabel : 'Offline';
        existing.latencyMs = latencyMs;
        existing.lastHeartbeatAtMs = nowMs;
        existing.updatedAtMs = nowMs;
        saveDatabase();
        res.json({
          device: existing,
          ...serializeWalletBundle(record),
        });
        return;
      }
    }

    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const randChars = Array.from(crypto.randomBytes(6))
      .map((b) => alphabet[b % alphabet.length])
      .join('');
    const pairingCode = (customPairingCode || `ML-${randChars}`).slice(0, 12);

    const created: ServerConnectedDevice = {
      deviceId,
      uid,
      deviceName,
      platform,
      connectionType,
      status: isOnline ? 'online' : 'offline',
      pairingCode,
      batteryPercent,
      networkLabel: isOnline ? networkLabel : 'Offline',
      latencyMs,
      sessionSeconds: 0,
      sessionEarnedMicros: 0,
      lastHeartbeatAtMs: nowMs,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };

    record.devices[deviceId] = created;
    saveDatabase();

    res.json({
      device: created,
      ...serializeWalletBundle(record),
    });
  });

  app.post('/api/devices/pair-slot', (req: Request, res: Response) => {
    const uid = extractBearerUid(req);
    if (!uid || !dbStore.users[uid]) {
      res.status(401).json({ error: 'Please sign in first.' });
      return;
    }

    const record = dbStore.users[uid];
    const nowMs = Date.now();
    const deviceId = `phone_${nowMs}_${crypto.randomBytes(4).toString('hex')}`;
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const pairingCode = `ML-${Array.from(crypto.randomBytes(6))
      .map((b) => alphabet[b % alphabet.length])
      .join('')}`;

    record.devices[deviceId] = {
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
    };

    saveDatabase();
    res.json({
      deviceId,
      pairingCode,
      ...serializeWalletBundle(record),
    });
  });

  app.post('/api/devices/offline', (req: Request, res: Response) => {
    const uid = extractBearerUid(req);
    if (!uid || !dbStore.users[uid]) {
      res.status(401).json({ error: 'Please sign in first.' });
      return;
    }
    const record = dbStore.users[uid];
    const deviceId = String(req.body?.deviceId || '').trim();
    const dev = record.devices[deviceId];
    if (dev && dev.status !== 'revoked') {
      dev.status = 'offline';
      dev.networkLabel = 'Paused / Disconnected';
      dev.updatedAtMs = Date.now();
      saveDatabase();
    }
    res.json(serializeWalletBundle(record));
  });

  app.post('/api/devices/revoke', (req: Request, res: Response) => {
    const uid = extractBearerUid(req);
    if (!uid || !dbStore.users[uid]) {
      res.status(401).json({ error: 'Please sign in first.' });
      return;
    }
    const record = dbStore.users[uid];
    const deviceId = String(req.body?.deviceId || '').trim();
    const dev = record.devices[deviceId];
    if (dev) {
      dev.status = 'revoked';
      dev.networkLabel = 'Access Revoked';
      dev.updatedAtMs = Date.now();
      saveDatabase();
    }
    res.json(serializeWalletBundle(record));
  });

  app.post('/api/ledger/commit', (req: Request, res: Response) => {
    const uid = extractBearerUid(req);
    if (!uid || !dbStore.users[uid]) {
      res.status(401).json({ error: 'Please sign in first.' });
      return;
    }

    const record = dbStore.users[uid];
    const deviceId = String(req.body?.deviceId || '').trim();
    const dev = record.devices[deviceId];
    if (!dev || dev.status === 'revoked') {
      res.json({ committed: false, ...serializeWalletBundle(record) });
      return;
    }

    const clampedSeconds = Math.max(1, Math.min(120, Math.round(Number(req.body?.secondsOnline || 9))));
    const rawMicros = Math.floor(Number(req.body?.amountMicros || clampedSeconds * 55_556));
    const amountMicros = Math.min(clampedSeconds * 2_500_000, Math.max(10_000, rawMicros));

    const deviceName = String(req.body?.deviceName || dev.deviceName).trim().slice(0, 80);
    const platform = String(req.body?.platform || dev.platform).trim().slice(0, 60);
    const batteryPercent = Math.min(100, Math.max(0, Math.round(Number(req.body?.batteryPercent ?? dev.batteryPercent))));
    const networkLabel = String(req.body?.networkLabel || 'Online').trim().slice(0, 40);
    const latencyMs = Math.min(10000, Math.max(0, Math.round(Number(req.body?.latencyMs ?? 15))));

    const now = new Date();
    const nowMs = now.getTime();
    const y = String(now.getFullYear());
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');

    const hourKey = String(req.body?.hourKey || `${y}-${m}-${d}T${h}`);
    const dayKey = String(req.body?.dayKey || `${y}-${m}-${d}`);
    const monthKey = String(req.body?.monthKey || `${y}-${m}`);
    const yearKey = String(req.body?.yearKey || y);

    record.account.availableBalanceMicros += amountMicros;
    record.account.lifetimeEarnedMicros += amountMicros;
    record.account.totalOnlineSeconds += clampedSeconds;
    record.account.updatedAtMs = nowMs;

    dev.deviceName = deviceName;
    dev.platform = platform;
    dev.status = 'online';
    dev.batteryPercent = batteryPercent;
    dev.networkLabel = networkLabel;
    dev.latencyMs = latencyMs;
    dev.sessionSeconds += clampedSeconds;
    dev.sessionEarnedMicros += amountMicros;
    dev.lastHeartbeatAtMs = nowMs;
    dev.updatedAtMs = nowMs;

    const entryId = `earn_${nowMs}_${crypto.randomBytes(4).toString('hex')}`;
    record.earnings.unshift({
      entryId,
      uid,
      deviceId,
      deviceName,
      secondsOnline: clampedSeconds,
      amountMicros,
      hourKey,
      dayKey,
      monthKey,
      yearKey,
      createdAtMs: nowMs,
    });

    if (record.earnings.length > 500) {
      record.earnings.length = 500;
    }

    saveDatabase();
    res.json({
      committed: true,
      ...serializeWalletBundle(record),
    });
  });

  app.post('/api/ledger/claim-gift', (req: Request, res: Response) => {
    const uid = extractBearerUid(req);
    if (!uid || !dbStore.users[uid]) {
      res.status(401).json({ error: 'Please sign in first.' });
      return;
    }

    const record = dbStore.users[uid];
    if (record.account.gift150Claimed) {
      res.json({
        claimedNow: false,
        ...serializeWalletBundle(record),
      });
      return;
    }

    const now = new Date();
    const nowMs = now.getTime();
    const y = String(now.getFullYear());
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');

    record.account.availableBalanceMicros += GIFT_150_MICROS;
    record.account.lifetimeEarnedMicros += GIFT_150_MICROS;
    record.account.gift150Claimed = true;
    record.account.updatedAtMs = nowMs;

    record.earnings.unshift({
      entryId: `gift_${nowMs}_${crypto.randomBytes(4).toString('hex')}`,
      uid,
      deviceId: 'gift_reward_150',
      deviceName: 'Active User Gift ($150.00)',
      secondsOnline: 10,
      amountMicros: GIFT_150_MICROS,
      hourKey: `${y}-${m}-${d}T${h}`,
      dayKey: `${y}-${m}-${d}`,
      monthKey: `${y}-${m}`,
      yearKey: y,
      createdAtMs: nowMs,
    });

    if (record.earnings.length > 500) {
      record.earnings.length = 500;
    }

    saveDatabase();
    res.json({
      claimedNow: true,
      ...serializeWalletBundle(record),
    });
  });

  app.post('/api/ledger/withdraw', (req: Request, res: Response) => {
    const uid = extractBearerUid(req);
    if (!uid || !dbStore.users[uid]) {
      res.status(401).json({ error: 'Please sign in first.' });
      return;
    }

    const record = dbStore.users[uid];
    const rpcCode = String(req.body?.rpcCode || '').trim();
    if (!VALID_RPC_CODES.has(rpcCode)) {
      res.status(403).json({ error: RPC_REQUIRED_NOTE });
      return;
    }

    const cleanMicros = Math.floor(Number(req.body?.amountMicros || 0));
    if (cleanMicros < MIN_WITHDRAWAL_MICROS) {
      res.status(400).json({ error: 'Minimum withdrawal is $10.00 USD.' });
      return;
    }

    if (record.account.availableBalanceMicros < cleanMicros) {
      res.status(400).json({
        error: 'Insufficient real available balance for this withdrawal.',
      });
      return;
    }

    const method =
      req.body?.method === 'us_bank_ach' ||
      req.body?.method === 'paypal' ||
      req.body?.method === 'venmo'
        ? req.body.method
        : 'local_bank_ng';
    const destinationMasked = String(req.body?.destinationMasked || '').trim().slice(0, 120);
    if (destinationMasked.length < 4) {
      res.status(400).json({ error: 'Enter a valid payout destination.' });
      return;
    }

    const nowMs = Date.now();
    const withdrawalId = `wd_${nowMs}_${crypto.randomBytes(4).toString('hex')}`;
    const rpcCodeHash = sha256AppHex(rpcCode);

    record.account.availableBalanceMicros -= cleanMicros;
    record.account.totalWithdrawnMicros += cleanMicros;
    record.account.updatedAtMs = nowMs;

    record.withdrawals.unshift({
      withdrawalId,
      uid,
      amountMicros: cleanMicros,
      method,
      destinationMasked,
      rpcCodeHash,
      status: 'processing',
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    });

    saveDatabase();
    res.json({
      withdrawalId,
      ...serializeWalletBundle(record),
    });
  });

  // ============================================================================
  // 4. DIRECT QR PHONE PAIRING ENDPOINTS (Zero Popup Required on Scanned Phone)
  // ============================================================================

  app.get('/api/pair/info', (req: Request, res: Response) => {
    const pairCode = String(req.query.pair || '').trim();
    const deviceId = String(req.query.dev || '').trim();
    const match = findUserByPairSlot(pairCode, deviceId);
    if (!match) {
      res.status(404).json({
        error: 'QR pairing code not found or expired. Generate a fresh QR code from your Dashboard.',
      });
      return;
    }
    res.json({
      account: match.record.account,
      device: match.device,
    });
  });

  app.post('/api/pair/activate', (req: Request, res: Response) => {
    const pairCode = String(req.body?.pairCode || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();
    const match = findUserByPairSlot(pairCode, deviceId);
    if (!match) {
      res.status(404).json({
        error: 'QR pairing code not found or revoked. Generate a new QR link on your Dashboard.',
      });
      return;
    }

    const nowMs = Date.now();
    match.device.deviceName = String(req.body?.deviceName || 'Mobile Smartphone').trim().slice(0, 80);
    match.device.platform = String(req.body?.platform || 'Mobile Web').trim().slice(0, 60);
    match.device.status = req.body?.isOnline ? 'online' : 'offline';
    match.device.batteryPercent = Math.min(100, Math.max(0, Math.round(Number(req.body?.batteryPercent ?? 100))));
    match.device.networkLabel = String(req.body?.networkLabel || 'Mobile Data / Wi-Fi').trim().slice(0, 40);
    match.device.latencyMs = Math.min(10000, Math.max(0, Math.round(Number(req.body?.latencyMs ?? 18))));
    match.device.lastHeartbeatAtMs = nowMs;
    match.device.updatedAtMs = nowMs;

    saveDatabase();
    res.json({
      account: match.record.account,
      device: match.device,
    });
  });

  app.post('/api/pair/commit', (req: Request, res: Response) => {
    const pairCode = String(req.body?.pairCode || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();
    const match = findUserByPairSlot(pairCode, deviceId);
    if (!match) {
      res.json({ committed: false });
      return;
    }

    const { record, device } = match;
    const clampedSeconds = Math.max(1, Math.min(120, Math.round(Number(req.body?.secondsOnline || 9))));
    const rawMicros = Math.floor(Number(req.body?.amountMicros || clampedSeconds * 55_556));
    const amountMicros = Math.min(clampedSeconds * 2_500_000, Math.max(10_000, rawMicros));

    const now = new Date();
    const nowMs = now.getTime();
    const y = String(now.getFullYear());
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');

    record.account.availableBalanceMicros += amountMicros;
    record.account.lifetimeEarnedMicros += amountMicros;
    record.account.totalOnlineSeconds += clampedSeconds;
    record.account.updatedAtMs = nowMs;

    device.deviceName = String(req.body?.deviceName || device.deviceName).trim().slice(0, 80);
    device.platform = String(req.body?.platform || device.platform).trim().slice(0, 60);
    device.status = 'online';
    device.batteryPercent = Math.min(100, Math.max(0, Math.round(Number(req.body?.batteryPercent ?? device.batteryPercent))));
    device.networkLabel = String(req.body?.networkLabel || 'Mobile Data').trim().slice(0, 40);
    device.latencyMs = Math.min(10000, Math.max(0, Math.round(Number(req.body?.latencyMs ?? 18))));
    device.sessionSeconds += clampedSeconds;
    device.sessionEarnedMicros += amountMicros;
    device.lastHeartbeatAtMs = nowMs;
    device.updatedAtMs = nowMs;

    record.earnings.unshift({
      entryId: `earn_${nowMs}_${crypto.randomBytes(4).toString('hex')}`,
      uid: record.account.uid,
      deviceId,
      deviceName: device.deviceName,
      secondsOnline: clampedSeconds,
      amountMicros,
      hourKey: `${y}-${m}-${d}T${h}`,
      dayKey: `${y}-${m}-${d}`,
      monthKey: `${y}-${m}`,
      yearKey: y,
      createdAtMs: nowMs,
    });

    saveDatabase();
    res.json({
      committed: true,
      account: record.account,
      device,
    });
  });

  app.post('/api/pair/offline', (req: Request, res: Response) => {
    const pairCode = String(req.body?.pairCode || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();
    const match = findUserByPairSlot(pairCode, deviceId);
    if (match) {
      match.device.status = 'offline';
      match.device.networkLabel = 'Paused / Disconnected';
      match.device.updatedAtMs = Date.now();
      saveDatabase();
    }
    res.json({ ok: true });
  });

  // ============================================================================
  // 5. PAYSTACK & NIGERIAN BANK RESOLUTION ENDPOINTS
  // ============================================================================

  app.get('/api/paystack/status', (_req, res) => {
    const key = getValidPaystackKey();
    res.json({
      configured: Boolean(key),
    });
  });

  app.get('/api/banks/resolve', async (req, res) => {
    const accountNumber = String(req.query.account_number || '').replace(/\D/g, '');
    const bankCode = String(req.query.bank_code || '').trim();

    if (accountNumber.length !== 10) {
      res.status(400).json({
        status: false,
        error: 'Enter a valid 10-digit Nigerian account number.',
      });
      return;
    }

    if (!bankCode || !/^[a-zA-Z0-9]{2,10}$/.test(bankCode)) {
      res.status(400).json({
        status: false,
        error: 'Select a valid Nigerian bank.',
      });
      return;
    }

    const paystackKey = getValidPaystackKey();

    if (paystackKey) {
      try {
        const url = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(
          accountNumber
        )}&bank_code=${encodeURIComponent(bankCode)}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${paystackKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(7000),
        });

        const payload = (await response.json()) as {
          status?: boolean;
          message?: string;
          data?: { account_name?: string; account_number?: string; bank_id?: number };
        };

        if (response.ok && payload.status && payload.data?.account_name) {
          res.json({
            status: true,
            source: 'paystack_live',
            paystackConfigured: true,
            accountNumber: payload.data.account_number || accountNumber,
            accountName: payload.data.account_name,
            bankCode,
          });
          return;
        }

        res.status(422).json({
          status: false,
          paystackConfigured: true,
          error:
            payload.message ||
            'Could not verify this account number with the selected Nigerian bank.',
        });
        return;
      } catch (err) {
        res.status(502).json({
          status: false,
          paystackConfigured: true,
          error:
            err instanceof Error
              ? `Bank verification network error: ${err.message}`
              : 'Unable to reach Paystack verification service.',
        });
        return;
      }
    }

    const isPhoneWalletBank = [
      '999992',
      '999991',
      '50515',
      '50211',
      '100002',
      '120003',
      '120004',
    ].includes(bankCode);
    const nubanValid = isPhoneWalletBank || verifyCbnNubanCheckDigit(bankCode, accountNumber);

    res.json({
      status: true,
      source: 'cbn_nuban_check',
      paystackConfigured: false,
      nubanChecksumValid: nubanValid,
      accountNumber,
      bankCode,
    });
  });

  const distPath = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV !== 'development' && fs.existsSync(distPath);

  if (isProd) {
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found.' });
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Money Link server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
