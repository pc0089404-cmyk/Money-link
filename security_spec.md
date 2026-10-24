# Money Link — Zero-Trust Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Zero-Balance Initialization**: Every `UserAccount` (`/users/{userId}`) MUST initialize with `availableBalanceMicros == 0`, `lifetimeEarnedMicros == 0`, `totalWithdrawnMicros == 0`, and `totalOnlineSeconds == 0`. Demo or pre-seeded balances are strictly forbidden.
2. **Mandatory USA Identity Gate**: A `UserAccount` cannot be created unless `identityVerified == true`, valid US state/ID metadata are present, AND the isolated KYC document `/users/{userId}/private/vault` exists atomically (`existsAfter`).
3. **PII Split-Collection Isolation**: Email/phone contact info, password hashes, and USA ID / SSN cryptographic hashes reside exclusively in `/users/{userId}/private/vault` and can only be read or written by the verified owner (`request.auth.uid == userId && request.auth.token.email_verified == true`).
4. **Rate-Bounded Real Fast-Stream & Data-Boost Earnings**: Balance increments on `/users/{userId}` can only occur in `1..120` second intervals per heartbeat commit where `deltaMicros >= 10000 && deltaMicros <= deltaSeconds * 2500000` (allowing base +$0.10 fast ticks plus connected Data-Boost app multipliers of +0.1x, +0.5x, +1x, and +2x up to $2.50/sec while blocking arbitrary balance tampering such as $50.00 in 10 seconds).
5. **Atomic Earning & $10.00+ Withdrawal Ledger**:
   - An `EarningEntry` (`/users/{userId}/earnings/{entryId}`) is immutable after creation and requires an atomic update (`getAfter(...).data.updatedAt == request.time`) on `/users/{userId}` with matching `amountMicros`.
   - A `WithdrawalRequest` (`/users/{userId}/withdrawals/{withdrawalId}`) requires `amountMicros >= 10000000` ($10.00 minimum withdrawal), `method in ['local_bank_ng', 'us_bank_ach', 'paypal', 'venmo']`, `rpcCodeHash` matching strictly one of the 3 authorized SHA-256 RPC code digests (`091306`, `0913061`, `091306191`), `status == 'processing'` on creation, and an atomic balance deduction on `/users/{userId}`.
6. **Terminal State Locking**: Once a `ConnectedDevice` reaches `status == 'revoked'`, or a `WithdrawalRequest` reaches `status in ['completed', 'cancelled']`, all further updates are denied.
7. **Master Gate & Query Enforcer**: All subcollections enforce parent `/users/{userId}` existence on writes/gets and enforce `resource.data.uid == request.auth.uid` on `list` without `get()` cost explosions.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Identity Spoofing)**: Authenticated user `uid_attacker` creates `/users/uid_victim` with `{ uid: "uid_victim", ... }` -> `PERMISSION_DENIED`.
2. **Payload 2 (Unverified Email Bypass)**: Token with `email_verified: false` attempts to create `/users/uid_attacker` -> `PERMISSION_DENIED`.
3. **Payload 3 (Bypass USA ID Gate)**: Create `/users/uid_1` with `identityVerified: false` or without atomic `/users/uid_1/private/vault` -> `PERMISSION_DENIED`.
4. **Payload 4 (Fake Initial Balance)**: Create `/users/uid_1` with `availableBalanceMicros: 50000000` ($50.00) instead of `0` -> `PERMISSION_DENIED`.
5. **Payload 5 (Shadow Field Injection)**: Update `/users/uid_1` adding `{ isAdmin: true }` -> `PERMISSION_DENIED` (`hasOnly` rejection).
6. **Payload 6 (Arbitrary Balance Inflation)**: Update `/users/uid_1` incrementing `availableBalanceMicros` by `50000000` ($50.00) with `totalOnlineSeconds` delta of `10` -> `PERMISSION_DENIED` (exceeds fast-stream rate cap).
7. **Payload 7 (PII Cross-User Scrape)**: User `uid_2` attempts `get` on `/users/uid_1/private/vault` -> `PERMISSION_DENIED`.
8. **Payload 8 (Orphaned Earning Ledger Write)**: Create `/users/uid_1/earnings/e_1` without updating `/users/uid_1` in the same atomic batch -> `PERMISSION_DENIED`.
9. **Payload 9 (ID Poisoning / Oversized String)**: Create device with 2,000-character `deviceId` or `deviceName` exceeding 80 chars -> `PERMISSION_DENIED`.
10. **Payload 10 (Terminal State Mutation)**: Update `/users/uid_1/devices/dev_1` after `status` is `'revoked'` -> `PERMISSION_DENIED`.
11. **Payload 11 (Below $10 Minimum or Random RPC Code on Withdrawal)**: Create `/users/uid_1/withdrawals/w_1` with `amountMicros < 10000000` ($10.00) or random `rpcCodeHash` not in the 3 allowlisted SHA-256 digests -> `PERMISSION_DENIED`.
12. **Payload 12 (Unauthorized List Scraping)**: User `uid_2` executes `list` query on `/users/uid_1/earnings` -> `PERMISSION_DENIED`.
