/**
 * Security Rules Verification Suite — Dirty Dozen Payload Assertions
 * Verifies every adversarial payload defined in security_spec.md is rejected with PERMISSION_DENIED.
 */

export interface DirtyDozenScenario {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  authUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_SCENARIOS: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Identity Spoofing on UserAccount create',
    collectionPath: '/users/uid_victim',
    operation: 'create',
    authUid: 'uid_attacker',
    emailVerified: true,
    payload: { uid: 'uid_victim', availableBalanceMicros: 0 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Token Write',
    collectionPath: '/users/uid_1',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: false,
    payload: { uid: 'uid_1', identityVerified: true, availableBalanceMicros: 0 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Bypass USA ID Verification Gate',
    collectionPath: '/users/uid_1',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { uid: 'uid_1', identityVerified: false, availableBalanceMicros: 0 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Non-Zero Initial Balance Injection',
    collectionPath: '/users/uid_1',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { uid: 'uid_1', identityVerified: true, availableBalanceMicros: 50000000 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow Field Privilege Escalation',
    collectionPath: '/users/uid_1',
    operation: 'update',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { isAdmin: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Arbitrary Balance Inflation Beyond Fast-Stream Ceiling',
    collectionPath: '/users/uid_1',
    operation: 'update',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { availableBalanceMicros: 50000000, totalOnlineSeconds: 10 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Cross-User PII Vault Read',
    collectionPath: '/users/uid_1/private/vault',
    operation: 'get',
    authUid: 'uid_2',
    emailVerified: true,
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Orphaned EarningEntry Without Atomic User Ledger Update',
    collectionPath: '/users/uid_1/earnings/entry_1',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { entryId: 'entry_1', uid: 'uid_1', secondsOnline: 9, amountMicros: 500000 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Resource Poisoning Oversized String Payload',
    collectionPath: '/users/uid_1/devices/dev_1',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { deviceId: 'dev_1', deviceName: 'X'.repeat(500) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Revoked Device Terminal State Mutation',
    collectionPath: '/users/uid_1/devices/dev_1',
    operation: 'update',
    authUid: 'uid_1',
    emailVerified: true,
    payload: { status: 'online' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Below $10.00 Minimum or Unauthorized RPC Code Hash on Withdrawal',
    collectionPath: '/users/uid_1/withdrawals/w_1',
    operation: 'create',
    authUid: 'uid_1',
    emailVerified: true,
    payload: {
      withdrawalId: 'w_1',
      uid: 'uid_1',
      amountMicros: 5000000,
      method: 'local_bank_ng',
      destinationMasked: 'Access Bank Plc (044) · ••••8921 · Jordan Taylor',
      rpcCodeHash: '0'.repeat(64),
      status: 'processing',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Cross-User Earnings List Scraping',
    collectionPath: '/users/uid_1/earnings',
    operation: 'list',
    authUid: 'uid_2',
    emailVerified: true,
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
