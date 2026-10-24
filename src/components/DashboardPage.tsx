import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Pause,
  Play,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { formatBoostMultiplierLabel } from '../data/boostApps';
import { createQrPairingSlot, revokeConnectedDevice } from '../services/ledgerService';
import {
  AppPage,
  ConnectedDevice,
  EarningEntry,
  MICROS_PER_TICK,
  MIN_WITHDRAWAL_MICROS,
  TICKS_PER_COMMIT,
  UserAccount,
  WithdrawalRequest,
} from '../types';
import {
  formatDurationSeconds,
  formatUsdMicros,
  getDateBuckets,
} from '../utils/validation';
import { MoneyLinkLogo } from './MoneyLinkLogo';

interface DashboardPageProps {
  account: UserAccount;
  devices: ConnectedDevice[];
  earnings: EarningEntry[];
  withdrawals?: WithdrawalRequest[];
  localConnected: boolean;
  localConnecting: boolean;
  browserOnline: boolean;
  pendingSeconds: number;
  pendingTicks: number;
  pendingMicros: number;
  lastLatencyMs: number;
  wakeLockHeld: boolean;
  activeBoostMultiplier: number;
  connectedBoostCount: number;
  onStartLocalNode: () => Promise<void>;
  onStopLocalNode: () => Promise<void>;
  onNavigate: (page: AppPage) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  account,
  devices,
  earnings,
  withdrawals = [],
  localConnected,
  localConnecting,
  browserOnline,
  pendingSeconds,
  pendingTicks,
  pendingMicros,
  lastLatencyMs,
  wakeLockHeld,
  activeBoostMultiplier,
  connectedBoostCount,
  onStartLocalNode,
  onStopLocalNode,
  onNavigate,
}) => {
  const [qrDrawerOpen, setQrDrawerOpen] = useState(false);
  const [qrSlot, setQrSlot] = useState<{ deviceId: string; pairingCode: string } | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [actionError, setActionError] = useState('');

  const todayKey = getDateBuckets(new Date()).dayKey;

  const todayCommittedMicros = earnings
    .filter((e) => e.dayKey === todayKey)
    .reduce((sum, e) => sum + e.amountMicros, 0);

  const liveAvailableMicros = account.availableBalanceMicros + pendingMicros;
  const liveTodayMicros = todayCommittedMicros + pendingMicros;
  const liveTotalSeconds = account.totalOnlineSeconds + pendingSeconds;

  const activeDevices = devices.filter((d) => d.status !== 'revoked');
  const onlineCount = activeDevices.filter((d) => d.status === 'online').length;
  const pendingWithdrawals = withdrawals.filter((w) => w.status === 'processing');
  const totalPendingWithdrawalMicros = pendingWithdrawals.reduce(
    (sum, w) => sum + w.amountMicros,
    0
  );

  const firstName = account.displayName.split(' ')[0] || account.displayName;
  const currentTickMicros = Math.round(MICROS_PER_TICK * activeBoostMultiplier);
  const threeMinMicros = currentTickMicros * 100;

  // Dual Concentric Activity Rings (Outer: 5-tick sync cycle, Inner: $10.00 Cashout Goal)
  const syncProgress = Math.min(1, pendingTicks / TICKS_PER_COMMIT);
  const cashoutGoalProgress = Math.min(1, liveAvailableMicros / MIN_WITHDRAWAL_MICROS);
  const shortfallMicros = Math.max(0, MIN_WITHDRAWAL_MICROS - liveAvailableMicros);
  const cashoutUnlocked = liveAvailableMicros >= MIN_WITHDRAWAL_MICROS;

  const outerRadius = 30;
  const outerCirc = 2 * Math.PI * outerRadius;
  const outerOffset = outerCirc * (1 - (localConnected ? Math.max(0.08, syncProgress) : 0));

  const innerRadius = 21;
  const innerCirc = 2 * Math.PI * innerRadius;
  const innerOffset = innerCirc * (1 - cashoutGoalProgress);

  const handleOpenQrSheet = async (): Promise<void> => {
    setQrDrawerOpen(true);
    if (!qrSlot) {
      await handleGenerateQr();
    }
  };

  const handleGenerateQr = async (): Promise<void> => {
    setActionError('');
    setGeneratingQr(true);
    try {
      const slot = await createQrPairingSlot(account.uid);
      setQrSlot(slot);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not create QR pairing link.');
    } finally {
      setGeneratingQr(false);
    }
  };

  const pairingUrl = qrSlot
    ? `${window.location.origin}/?pair=${encodeURIComponent(
        qrSlot.pairingCode
      )}&dev=${encodeURIComponent(qrSlot.deviceId)}`
    : '';

  const handleCopyLink = async (): Promise<void> => {
    if (!pairingUrl) return;
    try {
      await navigator.clipboard.writeText(pairingUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Clipboard blocked fallback
    }
  };

  const handleRevoke = async (devId: string): Promise<void> => {
    setActionError('');
    try {
      await revokeConnectedDevice(account.uid, devId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to revoke device.');
    }
  };

  return (
    <div className="space-y-7">
      {actionError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
          {actionError}
        </div>
      )}

      {/* Spacious Wallet Hero Card */}
      <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0F172A] via-[#1E40AF] to-[#059669] text-white p-6 sm:p-8 shadow-xl shadow-slate-900/12 space-y-7">
        <div className="pointer-events-none absolute -top-24 -right-12 w-72 h-72 rounded-full bg-sky-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 w-72 h-72 rounded-full bg-emerald-400/20 blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-3 text-xs text-sky-100">
          <span className="font-semibold tracking-tight text-white/95">
            Welcome back, {firstName} · ID {account.usaIdMasked}
          </span>
          <span className="inline-flex items-center gap-1.5 font-bold text-white">
            {localConnected && browserOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-300" />
                <span>
                  Live Stream · +{formatUsdMicros(currentTickMicros, 2)} (
                  {formatBoostMultiplierLabel(activeBoostMultiplier)})
                </span>
              </>
            ) : !browserOnline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-300" />
                <span>Network Offline</span>
              </>
            ) : (
              <span>Ready to Stream · {formatBoostMultiplierLabel(activeBoostMultiplier)} Rate</span>
            )}
          </span>
        </div>

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-sky-200">Available Cash Balance</p>
            <p className="text-4xl sm:text-5xl font-extrabold font-mono tabular-nums tracking-tight mt-1.5 text-white">
              {formatUsdMicros(liveAvailableMicros, 2)}
            </p>
            <p className="text-xs sm:text-sm text-emerald-200 mt-2 font-mono tabular-nums font-medium">
              Today +{formatUsdMicros(liveTodayMicros, 2)} · Active{' '}
              {formatDurationSeconds(liveTotalSeconds)}
            </p>
          </div>

          <div className="text-left sm:text-right text-xs space-y-1.5">
            <p className="font-extrabold text-amber-300 inline-flex items-center gap-1.5 text-sm">
              <Zap className="w-4 h-4 fill-current" />
              +{formatUsdMicros(currentTickMicros, 2)} every 1.8s (
              {formatUsdMicros(threeMinMicros, 2)} in 3m)
            </p>
            <p className="text-sky-100/90">
              {connectedBoostCount > 0
                ? `${connectedBoostCount} Data Boost ${connectedBoostCount === 1 ? 'app' : 'apps'} active · Cashout from $10.00`
                : 'Connect social apps on Boost to multiply your rate · Cashout from $10.00'}
            </p>
          </div>
        </div>

        {/* 5 Breathable Quick Action Tiles */}
        <div className="relative grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 pt-1">
          <button
            type="button"
            disabled={localConnecting || (!localConnected && !browserOnline)}
            onClick={() => void (localConnected ? onStopLocalNode() : onStartLocalNode())}
            className={`col-span-2 sm:col-span-1 min-h-[64px] rounded-2xl active:scale-[0.98] disabled:opacity-50 transition-all flex sm:flex-col items-center justify-center gap-2 p-3 shadow-sm ${
              localConnected
                ? 'bg-gradient-to-b from-rose-500 to-orange-500 text-white'
                : 'bg-white text-slate-950 hover:bg-emerald-50'
            }`}
          >
            {localConnected ? (
              <Pause className="w-5 h-5 text-white" />
            ) : (
              <Play className="w-5 h-5 text-[#10B981] fill-current" />
            )}
            <span className="text-xs font-extrabold whitespace-nowrap">
              {localConnected ? 'Pause Stream' : 'Connect'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate(AppPage.BOOST)}
            className="min-h-[64px] rounded-2xl bg-white/14 hover:bg-white/22 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 p-3 text-white border border-white/15"
          >
            <Zap className="w-5 h-5 text-amber-300" />
            <span className="text-xs font-bold whitespace-nowrap">
              Boost ({formatBoostMultiplierLabel(activeBoostMultiplier)})
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenQrSheet()}
            className="min-h-[64px] rounded-2xl bg-white/14 hover:bg-white/22 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 p-3 text-white border border-white/15"
          >
            <QrCode className="w-5 h-5" />
            <span className="text-xs font-bold whitespace-nowrap">Pair Phone</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate(AppPage.WITHDRAW)}
            className="min-h-[64px] rounded-2xl bg-amber-300 hover:bg-amber-200 text-slate-950 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 p-3 shadow-sm"
          >
            <ArrowUpRight className="w-5 h-5" />
            <span className="text-xs font-extrabold whitespace-nowrap">Withdraw</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate(AppPage.EARNINGS)}
            className="min-h-[64px] rounded-2xl bg-white/14 hover:bg-white/22 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-1.5 p-3 text-white border border-white/15"
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-xs font-bold whitespace-nowrap">Earnings</span>
          </button>
        </div>
      </section>

      {/* Active Pending Withdrawal Banner (Displays Amount + 24-Hour Delivery Notice) */}
      {pendingWithdrawals.length > 0 && (
        <section className="rounded-[28px] bg-amber-50/90 border border-amber-300 p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-extrabold uppercase tracking-wider text-amber-800">
                Pending Withdrawal ({pendingWithdrawals.length})
              </p>
              <p className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-slate-900">
                {formatUsdMicros(totalPendingWithdrawalMicros, 2)}
              </p>
              <p className="text-xs sm:text-sm font-bold text-amber-900">
                Pending withdrawal will be sent within 24 hours ·{' '}
                <span className="font-medium text-slate-700">
                  {pendingWithdrawals[0].destinationMasked}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate(AppPage.WITHDRAW)}
            className="min-h-[40px] px-4 py-2 text-xs font-bold text-amber-950 bg-amber-200/70 hover:bg-amber-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            View Payout Status
          </button>
        </section>
      )}

      {/* 2 Spacious Bento Cards: Live Stream Ring + $10.00 Cashout Milestone */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <div className="rounded-[28px] bg-white border border-slate-200/80 p-6 sm:p-7 flex items-center justify-between gap-5 shadow-[0_8px_30px_rgb(15,23,42,0.04)]">
          <div className="space-y-2 min-w-0">
            <p className="text-xs font-bold text-[#0A84FF]">
              Live Online Stream · {formatBoostMultiplierLabel(activeBoostMultiplier)} Multiplier
            </p>
            <h2 className="text-lg font-extrabold text-slate-900">
              {localConnected
                ? `Streaming +${formatUsdMicros(currentTickMicros, 2)} Live`
                : 'Ready to Connect'}
            </h2>
            <p className="text-xs text-slate-600 font-mono tabular-nums font-medium">
              {localConnected
                ? `Buffer: +${formatUsdMicros(pendingMicros, 2)} (${pendingTicks}/${TICKS_PER_COMMIT} ticks)`
                : `3 mins online = ${formatUsdMicros(threeMinMicros, 2)}`}
            </p>
            <p className="text-xs text-slate-400">
              Ping {lastLatencyMs > 0 ? `${lastLatencyMs} ms` : '—'} ·{' '}
              {localConnected ? (wakeLockHeld ? 'Screen Awake' : 'Active') : 'Standby'}
            </p>
          </div>

          <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72" aria-hidden="true">
              <circle
                cx="36"
                cy="36"
                r={outerRadius}
                fill="none"
                stroke="#F1F5F9"
                strokeWidth="6"
              />
              <circle
                cx="36"
                cy="36"
                r={outerRadius}
                fill="none"
                stroke="#0A84FF"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={outerCirc}
                strokeDashoffset={outerOffset}
              />
              <circle
                cx="36"
                cy="36"
                r={innerRadius}
                fill="none"
                stroke="#ECFDF5"
                strokeWidth="6"
              />
              <circle
                cx="36"
                cy="36"
                r={innerRadius}
                fill="none"
                stroke="#10B981"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={innerCirc}
                strokeDashoffset={innerOffset}
              />
            </svg>
            <span className="absolute text-[11px] font-extrabold font-mono tabular-nums text-slate-900">
              {formatBoostMultiplierLabel(activeBoostMultiplier)}
            </span>
          </div>
        </div>

        <div className="rounded-[28px] bg-white border border-slate-200/80 p-6 sm:p-7 flex flex-col justify-between gap-5 shadow-[0_8px_30px_rgb(15,23,42,0.04)]">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-bold text-emerald-700">$10.00 Cashout Milestone</p>
              <h2 className="text-lg font-extrabold text-slate-900">
                {cashoutUnlocked
                  ? 'Ready for Direct Bank Payout'
                  : `${formatUsdMicros(shortfallMicros, 2)} away from $10.00`}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(AppPage.BOOST)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
            >
              + Boost Rate
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#0A84FF] to-[#10B981] origin-left transition-transform duration-200"
                style={{ transform: `scaleX(${cashoutGoalProgress})` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-0.5">
              <span className="font-mono tabular-nums font-semibold text-slate-600">
                {formatUsdMicros(liveAvailableMicros, 2)} / $10.00 (
                {Math.round(cashoutGoalProgress * 100)}%)
              </span>
              <button
                type="button"
                onClick={() => onNavigate(AppPage.WITHDRAW)}
                className="min-h-[34px] inline-flex items-center gap-0.5 font-bold text-[#0A84FF] hover:underline whitespace-nowrap"
              >
                Withdraw to Bank
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Connected Smartphones Card */}
      <section className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-[0_8px_30px_rgb(15,23,42,0.04)]">
        <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Connected Phones ({onlineCount} Online)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Keep your phone connected online to stream real verified rewards
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleOpenQrSheet()}
            className="min-h-[42px] px-4 py-2 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 active:scale-[0.98] rounded-xl transition-all whitespace-nowrap shrink-0"
          >
            + Pair Phone QR
          </button>
        </div>

        {activeDevices.length === 0 ? (
          <div className="p-9 text-center space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 text-[#0A84FF] flex items-center justify-center mx-auto">
              <Smartphone className="w-6 h-6" />
            </div>
            <p className="text-sm font-extrabold text-slate-900">No smartphone linked yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Tap Connect above on this device to start earning immediately, or scan a QR code from
              your mobile phone.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeDevices.map((dev) => {
              const isOnline = dev.status === 'online';
              return (
                <div
                  key={dev.deviceId}
                  className="px-6 py-4 min-h-[68px] flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                        isOnline
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{dev.deviceName}</p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {isOnline ? 'Online · Earning' : 'Standby'} · {dev.pairingCode} ·{' '}
                        {formatDurationSeconds(dev.sessionSeconds)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3.5 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-extrabold font-mono tabular-nums text-emerald-700">
                        {formatUsdMicros(dev.sessionEarnedMicros, 2)}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-slate-400">
                        {dev.latencyMs > 0 ? `${dev.latencyMs} ms` : 'Idle'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRevoke(dev.deviceId)}
                      className="min-h-[38px] px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Live Cash Rewards Feed Card */}
      <section className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-[0_8px_30px_rgb(15,23,42,0.04)]">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Recent Verified Rewards</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Settled every 9 seconds directly into your Money Link wallet
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate(AppPage.EARNINGS)}
            className="min-h-[40px] px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            View All
          </button>
        </div>

        {earnings.length === 0 ? (
          <div className="p-9 text-center space-y-1.5">
            <p className="text-sm font-bold text-slate-900">Ready for your first cash drop</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Tap Connect above to start streaming +{formatUsdMicros(currentTickMicros, 2)} every
              1.8 seconds.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {earnings.slice(0, 6).map((entry) => (
              <div
                key={entry.entryId}
                className="px-6 py-4 min-h-[64px] flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{entry.deviceName}</p>
                    <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                      {entry.createdAt
                        ? entry.createdAt.toDate().toLocaleTimeString()
                        : entry.hourKey}{' '}
                      · +{entry.secondsOnline}s verified
                    </p>
                  </div>
                </div>
                <span className="text-sm font-extrabold font-mono tabular-nums text-emerald-600 shrink-0">
                  +{formatUsdMicros(entry.amountMicros, 2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* QR Pairing Modal / Bottom Sheet */}
      {qrDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setQrDrawerOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] p-6 sm:p-7 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto sm:hidden" />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <MoneyLinkLogo size="sm" />
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Pair Your Smartphone</h3>
                  <p className="text-xs text-slate-500">
                    Scan with your phone camera to connect instantly
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQrDrawerOpen(false)}
                aria-label="Close QR sheet"
                className="min-h-[42px] min-w-[42px] rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {generatingQr || !qrSlot ? (
              <div className="py-12 text-center text-xs font-bold text-slate-500">
                Generating your instant phone pairing code...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200/80 flex flex-col items-center text-center space-y-3">
                  <div className="bg-white p-3.5 rounded-2xl shadow-2xs border border-slate-100">
                    <QRCodeSVG value={pairingUrl} size={168} level="M" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Pairing Code</p>
                    <p className="text-xl font-extrabold font-mono tabular-nums text-slate-900 mt-0.5">
                      {qrSlot.pairingCode}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleCopyLink()}
                    className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-extrabold text-white bg-[#0A84FF] hover:bg-blue-600 active:scale-[0.98] rounded-2xl transition-all"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="w-4 h-4" />
                        Link Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Phone Link
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={generatingQr}
                    onClick={() => void handleGenerateQr()}
                    className="min-h-[48px] px-4 py-3 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors whitespace-nowrap"
                  >
                    New QR
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
