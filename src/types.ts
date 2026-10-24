import { Timestamp } from 'firebase/firestore';

export const MICROS_PER_DOLLAR = 1_000_000;
export const MICROS_PER_TICK = 100_000; // Base +$0.10 exact per fast tick (1.0x)
export const TICK_INTERVAL_MS = 1800; // Every 1.8s adds +$0.10 * boostMultiplier -> 100 base ticks in 3m = $10.00
export const TICKS_PER_COMMIT = 5; // Syncs every 5 ticks (9 seconds)
export const HEARTBEAT_COMMIT_SECONDS = 9; // 9 seconds per server ledger commit
export const MICROS_PER_SECOND = 55_556; // Base ~$0.0556/sec ($10.00 in 3 minutes)
export const MAX_BOOST_MULTIPLIER = 20; // Safe ceiling within Firestore security rules
export const MIN_WITHDRAWAL_MICROS = 10_000_000; // $10.00 minimum real withdrawal

export type UsaIdType = 'drivers_license' | 'state_id' | 'passport_card';
export type ContactType = 'gmail' | 'phone';
export type VerificationMethod = 'camera_liveness' | 'document_attestation';
export type DeviceConnectionType = 'qr_paired_phone' | 'direct_device';
export type DeviceStatus = 'online' | 'offline' | 'revoked';
export type PayoutMethod = 'local_bank_ng' | 'us_bank_ach' | 'paypal' | 'venmo';
export type WithdrawalStatus = 'processing' | 'completed' | 'cancelled';

export enum AppPage {
  DASHBOARD = 'dashboard',
  BOOST = 'boost',
  EARNINGS = 'earnings',
  WITHDRAW = 'withdraw',
  PROFILE = 'profile',
}

export type EarningsTimeframe = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface UserAccount {
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
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserPrivateVault {
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
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ConnectedDevice {
  deviceId: string;
  uid: string;
  deviceName: string;
  platform: string;
  connectionType: DeviceConnectionType;
  status: DeviceStatus;
  pairingCode: string;
  batteryPercent: number;
  networkLabel: string;
  latencyMs: number;
  sessionSeconds: number;
  sessionEarnedMicros: number;
  lastHeartbeatAt: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface EarningEntry {
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
  createdAt: Timestamp | null;
}

export interface WithdrawalRequest {
  withdrawalId: string;
  uid: string;
  amountMicros: number;
  method: PayoutMethod;
  destinationMasked: string;
  rpcCodeHash: string;
  status: WithdrawalStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}
