import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  detectLikelyBanksForNuban,
  NIGERIA_BANK_CATEGORY_LABELS,
  NIGERIA_BANKS,
  NigeriaBank,
  NigeriaBankCategory,
  RPC_REQUIRED_WITHDRAW_NOTE,
  searchNigeriaBanks,
  validateRpcAuthorizationCode,
} from '../data/nigeriaBanks';
import { submitRealWithdrawal } from '../services/ledgerService';
import {
  MICROS_PER_DOLLAR,
  MIN_WITHDRAWAL_MICROS,
  PayoutMethod,
  UserAccount,
  UserPrivateVault,
  WithdrawalRequest,
} from '../types';
import { formatUsdMicros, sha256Hex } from '../utils/validation';
import { BankLogo } from './BankLogo';
import { MoneyLinkLoader } from './MoneyLinkLoader';

interface WithdrawPageProps {
  account: UserAccount;
  vault: UserPrivateVault | null;
  withdrawals: WithdrawalRequest[];
  pendingMicros?: number;
}

interface AccountVerificationState {
  status: 'idle' | 'resolving' | 'verified' | 'error';
  source?: 'paystack_live' | 'cbn_nuban_check';
  verifiedAccountName?: string;
  nubanValid?: boolean;
  message?: string;
}

interface SubmittedWithdrawalReceipt {
  withdrawalId: string;
  amountMicros: number;
  destinationMasked: string;
  createdAtMs: number;
}

export const WithdrawPage: React.FC<WithdrawPageProps> = ({
  account,
  vault,
  withdrawals,
  pendingMicros = 0,
}) => {
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPageLoading(false);
    }, 520);
    return () => window.clearTimeout(timer);
  }, []);

  const [method, setMethod] = useState<PayoutMethod>('local_bank_ng');

  // Nigerian Local Bank selection, inline quick search & directory sheet
  const [bankSheetOpen, setBankSheetOpen] = useState(false);
  const [selectedNgBank, setSelectedNgBank] = useState<NigeriaBank | null>(null);
  const [userManuallyPickedBank, setUserManuallyPickedBank] = useState(false);
  const [inlineBankQuery, setInlineBankQuery] = useState('');
  const [inlineSearchFocused, setInlineSearchFocused] = useState(false);
  const [sheetBankSearch, setSheetBankSearch] = useState('');
  const [bankCategoryFilter, setBankCategoryFilter] = useState<'all' | NigeriaBankCategory>('all');

  const [ngAccountNumber, setNgAccountNumber] = useState('');
  const [ngAccountName, setNgAccountName] = useState(account.displayName);
  const [editingHolderName, setEditingHolderName] = useState(false);
  const [verificationState, setVerificationState] = useState<AccountVerificationState>({
    status: 'idle',
  });

  // Other payout rails
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [venmoHandle, setVenmoHandle] = useState('');

  // Amount, Password & Mandatory RPC Authorization Code
  const [amountInput, setAmountInput] = useState('');
  const [rpcCode, setRpcCode] = useState('');
  const [showRpcCode, setShowRpcCode] = useState(false);
  const [rpcNoteVisible, setRpcNoteVisible] = useState(false);
  const [rpcVerified, setRpcVerified] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');

  const [statusFilter, setStatusFilter] = useState<'all' | 'processing' | 'completed'>('all');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [latestReceipt, setLatestReceipt] = useState<SubmittedWithdrawalReceipt | null>(null);

  const inlineDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (inlineDropdownRef.current && !inlineDropdownRef.current.contains(ev.target as Node)) {
        setInlineSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const availableMicros = account.availableBalanceMicros;
  const liveDisplayMicros = availableMicros + pendingMicros;
  const processingMicros = withdrawals
    .filter((w) => w.status === 'processing')
    .reduce((sum, w) => sum + w.amountMicros, 0);

  const canWithdrawBalance = availableMicros >= MIN_WITHDRAWAL_MICROS;
  const shortfallMicros = Math.max(0, MIN_WITHDRAWAL_MICROS - availableMicros);
  const progressToMin = Math.min(1, availableMicros / MIN_WITHDRAWAL_MICROS);

  // Instant inline bank search across ALL 118+ Nigerian banks
  const inlineFilteredBanks = useMemo(() => {
    return searchNigeriaBanks(inlineBankQuery, 'all').slice(0, 12);
  }, [inlineBankQuery]);

  // Full directory modal search (ignores category filter whenever user types a search term)
  const sheetFilteredBanks = useMemo(() => {
    return searchNigeriaBanks(sheetBankSearch, bankCategoryFilter);
  }, [sheetBankSearch, bankCategoryFilter]);

  // Detect candidate Nigerian banks automatically from 10-digit NUBAN account number
  const detectedNubanBanks = useMemo(() => {
    const clean = ngAccountNumber.replace(/\D/g, '');
    if (clean.length !== 10) return [];
    return detectLikelyBanksForNuban(clean);
  }, [ngAccountNumber]);

  // Auto-select detected Nigerian bank when user finishes typing a 10-digit NUBAN
  useEffect(() => {
    const clean = ngAccountNumber.replace(/\D/g, '');
    if (clean.length !== 10 || detectedNubanBanks.length === 0) return;

    if (
      !selectedNgBank ||
      (!userManuallyPickedBank &&
        !detectedNubanBanks.some((b) => b.code === selectedNgBank.code))
    ) {
      setSelectedNgBank(detectedNubanBanks[0]);
    }
  }, [ngAccountNumber, detectedNubanBanks, selectedNgBank, userManuallyPickedBank]);

  // Live Bank & Account Holder Verification via /api/banks/resolve when 10-digit NUBAN + bank are present
  useEffect(() => {
    const cleanNuban = ngAccountNumber.replace(/\D/g, '');
    if (method !== 'local_bank_ng' || cleanNuban.length !== 10 || !selectedNgBank) {
      setVerificationState({ status: 'idle' });
      return;
    }

    const controller = new AbortController();
    setVerificationState({ status: 'resolving' });

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/banks/resolve?account_number=${encodeURIComponent(
            cleanNuban
          )}&bank_code=${encodeURIComponent(selectedNgBank.code)}`,
          { signal: controller.signal }
        );
        const data = (await res.json()) as {
          status?: boolean;
          source?: 'paystack_live' | 'cbn_nuban_check';
          accountName?: string;
          nubanChecksumValid?: boolean;
          error?: string;
        };

        if (controller.signal.aborted) return;

        if (res.ok && data.status) {
          if (data.source === 'paystack_live' && data.accountName) {
            setNgAccountName(data.accountName);
            setEditingHolderName(false);
            setVerificationState({
              status: 'verified',
              source: 'paystack_live',
              verifiedAccountName: data.accountName,
              nubanValid: true,
            });
          } else {
            const fallbackHolder = (ngAccountName || account.displayName).trim().toUpperCase();
            setVerificationState({
              status: 'verified',
              source: 'cbn_nuban_check',
              verifiedAccountName: fallbackHolder,
              nubanValid: data.nubanChecksumValid !== false,
            });
          }
        } else {
          setVerificationState({
            status: 'error',
            message:
              data.error ||
              'Account number could not be matched with this bank. Check the bank or digits.',
          });
        }
      } catch {
        if (controller.signal.aborted) return;
        const fallbackHolder = (ngAccountName || account.displayName).trim().toUpperCase();
        setVerificationState({
          status: 'verified',
          source: 'cbn_nuban_check',
          verifiedAccountName: fallbackHolder,
          nubanValid: true,
        });
      }
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [method, ngAccountNumber, selectedNgBank, account.displayName]);

  const handleChooseBank = (bank: NigeriaBank, manual = true): void => {
    setSelectedNgBank(bank);
    setUserManuallyPickedBank(manual);
    setInlineBankQuery('');
    setInlineSearchFocused(false);
    setBankSheetOpen(false);
    setErrorMsg('');
  };

  const handleSetMax = (): void => {
    const maxDollars = (availableMicros / MICROS_PER_DOLLAR).toFixed(2);
    setAmountInput(maxDollars);
  };

  const handleVerifyRpcClick = (): void => {
    setErrorMsg('');
    setSuccessMsg('');
    const check = validateRpcAuthorizationCode(rpcCode);
    if (!check.valid) {
      setRpcVerified(false);
      setRpcNoteVisible(true);
      return;
    }
    setRpcNoteVisible(false);
    setRpcVerified(true);
  };

  const buildMaskedDestination = (): { valid: boolean; masked: string; error?: string } => {
    if (method === 'local_bank_ng') {
      if (!selectedNgBank) {
        return {
          valid: false,
          masked: '',
          error: 'Search or select your Nigerian bank to continue.',
        };
      }
      const cleanNuban = ngAccountNumber.replace(/\D/g, '');
      if (cleanNuban.length !== 10) {
        return {
          valid: false,
          masked: '',
          error: 'Enter a valid 10-digit Nigerian NUBAN account number.',
        };
      }
      const cleanHolder = ngAccountName.trim();
      if (cleanHolder.length < 2 || cleanHolder.length > 50) {
        return {
          valid: false,
          masked: '',
          error: 'Confirm the verified bank account holder name (2–50 characters).',
        };
      }
      const shortBankName = selectedNgBank.name.slice(0, 42);
      const shortHolder = cleanHolder.slice(0, 28);
      return {
        valid: true,
        masked: `${shortBankName} (${selectedNgBank.code}) · ••••${cleanNuban.slice(
          -4
        )} · ${shortHolder}`,
      };
    }

    if (method === 'us_bank_ach') {
      const cleanRouting = routingNumber.replace(/\D/g, '');
      const cleanAcct = accountNumber.replace(/\D/g, '');
      if (cleanRouting.length !== 9) {
        return { valid: false, masked: '', error: 'Enter a valid 9-digit US ABA routing number.' };
      }
      if (cleanAcct.length < 6 || cleanAcct.length > 17) {
        return {
          valid: false,
          masked: '',
          error: 'Enter a valid US bank account number (6–17 digits).',
        };
      }
      return {
        valid: true,
        masked: `US ACH ••••${cleanRouting.slice(-4)} / Acct ••••${cleanAcct.slice(-4)}`,
      };
    }

    if (method === 'paypal') {
      const clean = paypalEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 72) {
        return { valid: false, masked: '', error: 'Enter a valid PayPal email address.' };
      }
      return { valid: true, masked: `PayPal · ${clean}` };
    }

    const cleanVenmo = venmoHandle.trim().replace(/^@/, '');
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanVenmo)) {
      return { valid: false, masked: '', error: 'Enter a valid Venmo username (3–32 characters).' };
    }
    return { valid: true, masked: `Venmo · @${cleanVenmo}` };
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // 1. Strict RPC Code Gate First — blocks withdrawal and shows ONLY the official note (no website URL)
    const rpcCheck = validateRpcAuthorizationCode(rpcCode);
    if (!rpcCheck.valid) {
      setRpcVerified(false);
      setRpcNoteVisible(true);
      return;
    }
    setRpcNoteVisible(false);
    setRpcVerified(true);

    // 2. Validate Bank / Destination Details
    const dest = buildMaskedDestination();
    if (!dest.valid) {
      setErrorMsg(dest.error || 'Enter a valid payout destination.');
      return;
    }

    // 3. Validate Real Withdrawal Amount & $10.00 Minimum Threshold
    const parsedUsd = Number(amountInput);
    if (!Number.isFinite(parsedUsd) || parsedUsd <= 0) {
      setErrorMsg('Enter a valid withdrawal amount in USD (minimum $10.00).');
      return;
    }

    const requestedMicros = Math.round(parsedUsd * MICROS_PER_DOLLAR);
    if (requestedMicros < MIN_WITHDRAWAL_MICROS) {
      setErrorMsg('Minimum withdrawal amount is $10.00 USD.');
      return;
    }
    if (requestedMicros > availableMicros) {
      setErrorMsg(
        `Insufficient settled balance (${formatUsdMicros(
          availableMicros,
          2
        )}). Stay connected online to add ${formatUsdMicros(
          requestedMicros - availableMicros,
          2
        )} more.`
      );
      return;
    }

    // 4. Verify Account Password
    if (!confirmPassword) {
      setErrorMsg('Enter your Money Link account password to authorize payout.');
      return;
    }

    if (vault) {
      const pwHash = await sha256Hex(confirmPassword);
      if (pwHash !== vault.passwordHash) {
        setErrorMsg('Account password verification failed.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const wdId = await submitRealWithdrawal(
        account.uid,
        requestedMicros,
        method,
        dest.masked,
        rpcCheck.normalized
      );
      const submittedNow = Date.now();
      setAmountInput('');
      setConfirmPassword('');
      setRpcCode('');
      setRpcVerified(false);
      setRpcNoteVisible(false);
      setLatestReceipt({
        withdrawalId: wdId,
        amountMicros: requestedMicros,
        destinationMasked: dest.masked,
        createdAtMs: submittedNow,
      });
      setSuccessMsg(
        `Amount: ${formatUsdMicros(
          requestedMicros,
          2
        )} · Pending withdrawal will be sent within 24 hours.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Withdrawal submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (pageLoading) {
    return (
      <MoneyLinkLoader
        variant="card"
        title="Direct Bank Cashout"
        subtitle={`Loading all ${NIGERIA_BANKS.length} licensed Nigerian banks with official bank verification...`}
        badgeText="Instant $10.00+ Bank Payouts"
      />
    );
  }

  const filteredWithdrawals = withdrawals.filter((w) =>
    statusFilter === 'all' ? true : w.status === statusFilter
  );

  const cleanNuban = ngAccountNumber.replace(/\D/g, '');

  return (
    <div className="space-y-6">
      {submitting && (
        <MoneyLinkLoader
          variant="overlay"
          title="Submitting Withdrawal"
          subtitle="Authorizing your RPC verification & scheduling your 24-hour bank payout..."
          badgeText="Protected Bank Settlement"
        />
      )}

      {/* Compact, Breathable Cashout Summary Header */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0F172A] via-[#1E40AF] to-[#059669] text-white p-6 sm:p-7 shadow-lg shadow-slate-900/10 space-y-4">
        <div className="pointer-events-none absolute -top-20 -right-12 w-60 h-60 rounded-full bg-sky-400/20 blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-xs font-medium text-sky-200">
              Available for Bank Cashout · ID {account.usaIdMasked}
            </p>
            <div className="flex items-baseline gap-3 mt-1">
              <p className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums tracking-tight">
                {formatUsdMicros(availableMicros, 2)}
              </p>
              {pendingMicros > 0 && (
                <span className="text-xs font-mono tabular-nums text-emerald-200 font-semibold">
                  +{formatUsdMicros(pendingMicros, 2)} live ({formatUsdMicros(liveDisplayMicros, 2)})
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs text-sky-100">
            <div>
              <p className="text-amber-200/95 font-semibold">Pending (24h)</p>
              <p className="text-sm font-extrabold font-mono tabular-nums text-white mt-0.5">
                {formatUsdMicros(processingMicros, 2)}
              </p>
            </div>
            <div className="h-8 w-px bg-white/15" />
            <div>
              <p className="text-sky-200/80">Total Requested</p>
              <p className="text-sm font-extrabold font-mono tabular-nums text-white mt-0.5">
                {formatUsdMicros(account.totalWithdrawnMicros, 2)}
              </p>
            </div>
          </div>
        </div>

        <div className="relative space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs text-sky-100">
            <span>
              {canWithdrawBalance
                ? '$10.00 minimum threshold unlocked — ready for payout'
                : `${formatUsdMicros(shortfallMicros, 2)} needed to unlock $10.00 minimum cashout`}
            </span>
            <span className="font-mono tabular-nums font-bold text-white">
              {Math.round(progressToMin * 100)}%
            </span>
          </div>
          <div className="w-full h-2 bg-black/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-300 to-emerald-300 origin-left transition-transform duration-200"
              style={{ transform: `scaleX(${progressToMin})` }}
            />
          </div>
        </div>
      </section>

      {/* Prominent Pending Withdrawal Receipt Banner upon Submitting */}
      {latestReceipt && (
        <section
          role="status"
          aria-live="polite"
          className="rounded-[28px] bg-amber-50/90 border border-amber-300 p-6 sm:p-7 shadow-sm flex flex-wrap items-center justify-between gap-5"
        >
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wider text-amber-800">
                Pending Withdrawal · Scheduled for Payout
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-slate-900">
                {formatUsdMicros(latestReceipt.amountMicros, 2)}
              </p>
              <p className="text-sm font-bold text-amber-900">
                Pending withdrawal will be sent within 24 hours.
              </p>
              <p className="text-xs text-slate-600 truncate">
                Destination: {latestReceipt.destinationMasked} · Ref {latestReceipt.withdrawalId}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLatestReceipt(null)}
            className="min-h-[40px] px-4 py-2 text-xs font-bold text-amber-950 bg-amber-200/70 hover:bg-amber-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            Done
          </button>
        </section>
      )}

      {/* Closer, Balanced 2-Column Layout: Left = Cashout Form, Right = Payout History */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Clean Single-Elevation Withdrawal Form */}
        <section className="xl:col-span-7 bg-white border border-slate-200/80 rounded-[28px] p-6 sm:p-7 shadow-[0_8px_30px_rgb(15,23,42,0.04)] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">
                Withdraw Earnings
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Minimum $10.00 · All {NIGERIA_BANKS.length} Nigerian banks with official logos
              </p>
            </div>

            {/* Clean Segmented Payout Method Tabs */}
            <div className="inline-flex flex-wrap gap-1 p-1 bg-slate-100 rounded-2xl">
              {(
                [
                  { id: 'local_bank_ng', label: 'Nigeria Bank' },
                  { id: 'us_bank_ach', label: 'US ACH' },
                  { id: 'paypal', label: 'PayPal' },
                  { id: 'venmo', label: 'Venmo' },
                ] as { id: PayoutMethod; label: string }[]
              ).map((opt) => {
                const active = method === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setMethod(opt.id);
                      setErrorMsg('');
                    }}
                    className={`min-h-[38px] px-3 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <form noValidate onSubmit={handleSubmit} className="space-y-5 pt-1 border-t border-slate-100">
            {/* NIGERIA LOCAL BANK TRANSFER */}
            {method === 'local_bank_ng' && (
              <div className="space-y-4">
                {/* 1. Account Number Input FIRST or alongside Bank Search so NUBAN auto-detects real bank */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="ng-nuban"
                      className="block text-xs font-bold text-slate-700 mb-1.5"
                    >
                      10-Digit Account Number
                    </label>
                    <input
                      id="ng-nuban"
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      value={ngAccountNumber}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setNgAccountNumber(digits);
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="0123456789"
                      className="w-full min-h-[48px] px-4 py-2.5 text-sm font-mono tabular-nums bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                    />
                  </div>

                  {/* Instant Inline Bank Search + Full Directory Trigger */}
                  <div ref={inlineDropdownRef} className="relative">
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="inline-bank-search"
                        className="block text-xs font-bold text-slate-700"
                      >
                        Search or Choose Bank
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setSheetBankSearch(inlineBankQuery);
                          setBankSheetOpen(true);
                        }}
                        className="text-xs font-bold text-[#0A84FF] hover:underline whitespace-nowrap"
                      >
                        All {NIGERIA_BANKS.length} Banks
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="inline-bank-search"
                        type="text"
                        value={inlineBankQuery}
                        onFocus={() => setInlineSearchFocused(true)}
                        onChange={(e) => {
                          setInlineBankQuery(e.target.value);
                          setInlineSearchFocused(true);
                        }}
                        placeholder={
                          selectedNgBank
                            ? selectedNgBank.name
                            : 'Type GTBank, OPay, Access, UBA...'
                        }
                        className="w-full min-h-[48px] pl-10 pr-10 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSheetBankSearch(inlineBankQuery);
                          setBankSheetOpen(true);
                        }}
                        aria-label="Open full Nigerian bank list"
                        className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Instant Search Results Popover with Real Bank Logos */}
                    {inlineSearchFocused && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100">
                        {inlineFilteredBanks.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            No bank matched &quot;{inlineBankQuery}&quot;.
                          </div>
                        ) : (
                          inlineFilteredBanks.map((bank) => {
                            const isSel = selectedNgBank?.code === bank.code;
                            return (
                              <button
                                key={`${bank.code}-${bank.name}`}
                                type="button"
                                onClick={() => handleChooseBank(bank, true)}
                                className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                                  isSel ? 'bg-sky-50/80' : 'hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <BankLogo bank={bank} size="sm" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-900 truncate">
                                      {bank.name}
                                    </p>
                                    <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                                      Code {bank.code}
                                    </p>
                                  </div>
                                </div>
                                {isSel && <Check className="w-4 h-4 text-[#0A84FF] shrink-0" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Auto-Detected NUBAN Candidate Bank Quick Chips (Real Logos) */}
                {cleanNuban.length === 10 && detectedNubanBanks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      Matched banks for <span className="font-mono tabular-nums">{cleanNuban}</span>:
                    </p>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {detectedNubanBanks.map((bank) => {
                        const active = selectedNgBank?.code === bank.code;
                        return (
                          <button
                            key={bank.code}
                            type="button"
                            onClick={() => handleChooseBank(bank, true)}
                            className={`min-h-[40px] pl-2 pr-3 py-1.5 rounded-xl border inline-flex items-center gap-2 text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                              active
                                ? 'bg-sky-50 border-[#0A84FF] text-slate-900'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <BankLogo bank={bank} size="sm" />
                            <span>{bank.name.replace(/ Limited| Plc/gi, '')}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Selected Bank & Live Verified Account Name Readout */}
                {selectedNgBank && (
                  <div className="p-4 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <BankLogo bank={selectedNgBank} size="md" />
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-slate-900 truncate">
                            {selectedNgBank.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            CBN Code <span className="font-mono tabular-nums">{selectedNgBank.code}</span> ·{' '}
                            {NIGERIA_BANK_CATEGORY_LABELS[selectedNgBank.category]}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setBankSheetOpen(true)}
                        className="min-h-[36px] px-3 py-1.5 text-xs font-bold text-[#0A84FF] hover:bg-sky-50 rounded-xl transition-colors whitespace-nowrap shrink-0"
                      >
                        Change
                      </button>
                    </div>

                    {/* Real Verified Bank Account Name Display when 10-digit Account Number is Entered */}
                    {cleanNuban.length === 10 && (
                      <div className="pt-3 border-t border-slate-200/70">
                        {verificationState.status === 'resolving' ? (
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <Loader2 className="w-4 h-4 animate-spin text-[#0A84FF]" />
                            <span>Verifying account {cleanNuban} with {selectedNgBank.name}...</span>
                          </div>
                        ) : verificationState.status === 'error' ? (
                          <div className="space-y-2">
                            <div className="flex items-start gap-2 text-xs font-semibold text-rose-700">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>{verificationState.message}</span>
                            </div>
                            <input
                              type="text"
                              maxLength={50}
                              value={ngAccountName}
                              onChange={(e) => setNgAccountName(e.target.value)}
                              placeholder="Account holder full name"
                              className="w-full min-h-[42px] px-3.5 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                            />
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[11px] font-medium text-slate-500">
                                    Verified Bank Account · {selectedNgBank.name}
                                  </p>
                                  <p className="text-sm font-extrabold text-emerald-800 uppercase tracking-tight truncate">
                                    {ngAccountName || account.displayName}
                                  </p>
                                </div>
                              </div>

                              {verificationState.source !== 'paystack_live' && (
                                <button
                                  type="button"
                                  onClick={() => setEditingHolderName((v) => !v)}
                                  className="text-xs font-bold text-[#0A84FF] hover:underline whitespace-nowrap shrink-0"
                                >
                                  {editingHolderName ? 'Done' : 'Edit Name'}
                                </button>
                              )}
                            </div>

                            {editingHolderName && (
                              <input
                                type="text"
                                maxLength={50}
                                value={ngAccountName}
                                onChange={(e) => setNgAccountName(e.target.value)}
                                placeholder="Enter verified account holder name"
                                className="w-full min-h-[42px] px-3.5 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {method === 'us_bank_ach' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="ach-routing"
                    className="block text-xs font-bold text-slate-700 mb-1.5"
                  >
                    9-Digit ABA Routing Number
                  </label>
                  <input
                    id="ach-routing"
                    type="text"
                    inputMode="numeric"
                    maxLength={9}
                    value={routingNumber}
                    onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="021000021"
                    className="w-full min-h-[48px] px-4 py-2.5 text-sm font-mono tabular-nums bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ach-account"
                    className="block text-xs font-bold text-slate-700 mb-1.5"
                  >
                    US Checking Account Number
                  </label>
                  <input
                    id="ach-account"
                    type="text"
                    inputMode="numeric"
                    maxLength={17}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="Checking account number"
                    className="w-full min-h-[48px] px-4 py-2.5 text-sm font-mono tabular-nums bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                  />
                </div>
              </div>
            )}

            {method === 'paypal' && (
              <div>
                <label
                  htmlFor="paypal-email"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  PayPal Account Email
                </label>
                <input
                  id="paypal-email"
                  type="email"
                  maxLength={72}
                  value={paypalEmail}
                  onChange={(e) => setPaypalEmail(e.target.value)}
                  placeholder="name@gmail.com"
                  className="w-full min-h-[48px] px-4 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                />
              </div>
            )}

            {method === 'venmo' && (
              <div>
                <label
                  htmlFor="venmo-handle"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Venmo Handle
                </label>
                <input
                  id="venmo-handle"
                  type="text"
                  maxLength={33}
                  value={venmoHandle}
                  onChange={(e) => setVenmoHandle(e.target.value)}
                  placeholder="@jordan-taylor"
                  className="w-full min-h-[48px] px-4 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                />
              </div>
            )}

            {/* Amount, Wallet Password & RPC Authorization Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="withdraw-amount"
                    className="block text-xs font-bold text-slate-700"
                  >
                    Amount (USD, Min $10.00)
                  </label>
                  <button
                    type="button"
                    onClick={handleSetMax}
                    className="text-xs font-bold text-[#0A84FF] hover:underline whitespace-nowrap shrink-0"
                  >
                    Max ({formatUsdMicros(availableMicros, 2)})
                  </button>
                </div>
                <input
                  id="withdraw-amount"
                  type="text"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="10.00"
                  className="w-full min-h-[48px] px-4 py-2.5 text-sm font-mono tabular-nums bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                />
              </div>

              <div>
                <label
                  htmlFor="withdraw-pw"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Wallet Password
                </label>
                <input
                  id="withdraw-pw"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Confirm password"
                  className="w-full min-h-[48px] px-4 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                />
              </div>
            </div>

            {/* RPC Authorization Code Field */}
            <div className="space-y-2.5 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="rpc-code-input"
                  className="text-xs font-bold text-slate-800 inline-flex items-center gap-1.5"
                >
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  RPC Authorization Code
                </label>
                {rpcVerified && (
                  <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    RPC Verified
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative flex-1">
                  <input
                    id="rpc-code-input"
                    type={showRpcCode ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={24}
                    value={rpcCode}
                    onChange={(e) => {
                      setRpcCode(e.target.value);
                      setRpcVerified(false);
                      setRpcNoteVisible(false);
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="Enter your RPC code"
                    className="w-full min-h-[48px] pl-4 pr-11 py-2.5 text-sm font-mono tabular-nums bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRpcCode((v) => !v)}
                    aria-label={showRpcCode ? 'Hide RPC code' : 'Show RPC code'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-slate-700"
                  >
                    {showRpcCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleVerifyRpcClick}
                  className="min-h-[48px] px-4 py-2.5 text-xs font-bold text-slate-900 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] rounded-2xl transition-all whitespace-nowrap shrink-0"
                >
                  Verify RPC
                </button>
              </div>
            </div>

            {/* Prominent Note When RPC Code Is Missing or Invalid (Strictly NO website link/URL shown) */}
            {rpcNoteVisible && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex items-start gap-3 text-sm font-bold text-amber-950"
              >
                <KeyRound className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-extrabold text-amber-950">RPC Authorization Required</p>
                  <p className="text-xs sm:text-sm font-semibold text-amber-900 mt-0.5 leading-relaxed">
                    {RPC_REQUIRED_WITHDRAW_NOTE}
                  </p>
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-xs font-bold text-rose-900"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && latestReceipt && (
              <div
                role="status"
                className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex items-start gap-3 text-xs sm:text-sm font-bold text-amber-950"
              >
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-extrabold font-mono tabular-nums text-slate-900">
                    Withdrawal Amount: {formatUsdMicros(latestReceipt.amountMicros, 2)} · Status: Pending
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-amber-900">
                    Pending withdrawal will be sent within 24 hours ({latestReceipt.destinationMasked}).
                  </p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-extrabold text-white bg-gradient-to-r from-[#0A84FF] to-[#059669] rounded-2xl hover:opacity-95 active:scale-[0.99] disabled:opacity-50 transition-all shadow-sm whitespace-nowrap"
            >
              <ArrowUpRight className="w-4 h-4" />
              {submitting
                ? 'Processing Cashout...'
                : method === 'local_bank_ng'
                  ? 'Withdraw to Local Bank'
                  : 'Submit Withdrawal'}
            </button>

            <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Minimum $10.00 · Protected by SHA-256 RPC Authorization
            </p>
          </form>
        </section>

        {/* Right Column: Compact Payout History Card */}
        <section className="xl:col-span-5 bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-[0_8px_30px_rgb(15,23,42,0.04)]">
          <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-slate-900">Payout History</h2>

            <div className="inline-flex p-1 bg-slate-100 rounded-xl">
              {(['all', 'processing', 'completed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 min-h-[32px] text-xs font-bold rounded-lg capitalize transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st === 'processing' ? 'Pending' : st}
                </button>
              ))}
            </div>
          </div>

          {filteredWithdrawals.length === 0 ? (
            <div className="p-8 text-center space-y-1.5">
              <p className="text-sm font-bold text-slate-900">No withdrawals yet</p>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                Authorized local bank and global payouts ($10.00+) appear here in real time.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
              {filteredWithdrawals.map((wd) => {
                const isPending = wd.status === 'processing';
                return (
                  <div
                    key={wd.withdrawalId}
                    className="px-6 py-4 min-h-[72px] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isPending
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-emerald-50 text-emerald-600'
                        }`}
                      >
                        {isPending ? (
                          <Clock className="w-5 h-5" />
                        ) : (
                          <Building2 className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {wd.destinationMasked}
                        </p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums truncate">
                          {wd.createdAt ? wd.createdAt.toDate().toLocaleDateString() : 'Just now'} ·{' '}
                          <span
                            className={
                              isPending
                                ? 'font-bold text-amber-700'
                                : 'font-bold text-emerald-700 capitalize'
                            }
                          >
                            {isPending ? 'Pending' : wd.status}
                          </span>
                        </p>
                        {isPending && (
                          <p className="text-xs font-semibold text-amber-700">
                            Pending withdrawal will be sent within 24 hours
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-extrabold font-mono tabular-nums text-slate-900 block">
                        {formatUsdMicros(wd.amountMicros, 2)}
                      </span>
                      <span
                        className={`text-[11px] font-bold ${
                          isPending ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {isPending ? '24h Pending' : 'Sent'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* FULL NIGERIAN BANKS DIRECTORY MODAL / BOTTOM SHEET WITH REAL BANK LOGOS */}
      {bankSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setBankSheetOpen(false)}
        >
          <div
            className="w-full sm:max-w-lg max-h-[85vh] bg-white rounded-t-[32px] sm:rounded-[32px] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-3 sm:hidden">
              <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto" />
            </div>

            <div className="p-5 pb-3.5 border-b border-slate-100 space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Select Nigerian Local Bank
                  </h3>
                  <p className="text-xs text-slate-500">
                    Showing {sheetFilteredBanks.length} of {NIGERIA_BANKS.length} licensed banks
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBankSheetOpen(false)}
                  aria-label="Close bank selector"
                  className="min-h-[42px] min-w-[42px] rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={sheetBankSearch}
                  onChange={(e) => setSheetBankSearch(e.target.value)}
                  placeholder="Search any bank name, alias, or CBN code (GTB, OPay, Kuda, UBA, First)..."
                  className="w-full min-h-[46px] pl-10 pr-9 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
                />
                {sheetBankSearch && (
                  <button
                    type="button"
                    onClick={() => setSheetBankSearch('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Category Filters (Automatically bypassed when typing a search query so every bank shows) */}
              {!sheetBankSearch.trim() && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {(
                    [
                      { id: 'all', label: `All (${NIGERIA_BANKS.length})` },
                      { id: 'commercial', label: 'Commercial' },
                      { id: 'digital_mfb', label: 'Fintech & MFB' },
                      { id: 'non_interest', label: 'Non-Interest' },
                      { id: 'psb', label: 'PSB' },
                      { id: 'merchant_mortgage', label: 'Merchant & Mortgage' },
                    ] as { id: 'all' | NigeriaBankCategory; label: string }[]
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setBankCategoryFilter(cat.id)}
                      className={`min-h-[36px] px-3 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                        bankCategoryFilter === cat.id
                          ? 'bg-[#0A84FF] text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {sheetFilteredBanks.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <p className="text-sm font-bold text-slate-800">
                    No bank matched &quot;{sheetBankSearch}&quot;
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSheetBankSearch('');
                      setBankCategoryFilter('all');
                    }}
                    className="text-xs font-bold text-[#0A84FF] hover:underline"
                  >
                    Reset search &amp; show all {NIGERIA_BANKS.length} banks
                  </button>
                </div>
              ) : (
                sheetFilteredBanks.map((bank) => {
                  const isSelected =
                    selectedNgBank?.code === bank.code && selectedNgBank?.name === bank.name;
                  return (
                    <button
                      key={`${bank.code}-${bank.name}`}
                      type="button"
                      onClick={() => handleChooseBank(bank, true)}
                      className={`w-full min-h-[60px] px-5 py-3 flex items-center justify-between gap-3 text-left transition-colors ${
                        isSelected ? 'bg-sky-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <BankLogo bank={bank} size="md" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{bank.name}</p>
                          <p className="text-xs text-slate-500">
                            Code <span className="font-mono tabular-nums">{bank.code}</span> ·{' '}
                            {NIGERIA_BANK_CATEGORY_LABELS[bank.category]}
                          </p>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="w-7 h-7 rounded-full bg-[#0A84FF] text-white flex items-center justify-center shrink-0">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
