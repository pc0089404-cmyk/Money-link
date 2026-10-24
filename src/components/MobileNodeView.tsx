import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Pause, Play, Smartphone, Wifi, WifiOff, Zap } from 'lucide-react';
import {
  activatePairedPhone,
  commitPairedPhoneInterval,
  fetchPairSlotInfo,
  setPairedPhoneOffline,
} from '../services/ledgerService';
import {
  ConnectedDevice,
  HEARTBEAT_COMMIT_SECONDS,
  MICROS_PER_TICK,
  TICK_INTERVAL_MS,
  TICKS_PER_COMMIT,
  UserAccount,
} from '../types';
import { formatDurationSeconds, formatUsdMicros } from '../utils/validation';
import { MoneyLinkLogo } from './MoneyLinkLogo';

interface MobileNodeViewProps {
  pairCode: string;
  deviceId: string;
  onExitToDashboard: () => void;
}

export const MobileNodeView: React.FC<MobileNodeViewProps> = ({
  pairCode,
  deviceId,
  onExitToDashboard,
}) => {
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [device, setDevice] = useState<ConnectedDevice | null>(null);
  const [loadingSlot, setLoadingSlot] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [browserOnline, setBrowserOnline] = useState<boolean>(navigator.onLine);
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [pendingTicks, setPendingTicks] = useState(0);
  const [wakeLockHeld, setWakeLockHeld] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [connecting, setConnecting] = useState(false);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const pendingSecRef = useRef(0);
  const pendingTicksRef = useRef(0);
  const committingRef = useRef(false);

  useEffect(() => {
    const onOnline = (): void => setBrowserOnline(true);
    const onOffline = (): void => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSlot = async (isInitial: boolean) => {
      try {
        const info = await fetchPairSlotInfo(pairCode, deviceId);
        if (!cancelled) {
          setAccount(info.account);
          setDevice(info.device);
          setErrorMsg('');
        }
      } catch (err) {
        if (!cancelled && isInitial) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'QR pairing code not found. Generate a fresh QR link on your Dashboard.'
          );
        }
      } finally {
        if (!cancelled && isInitial) {
          setLoadingSlot(false);
        }
      }
    };

    void loadSlot(true);
    const poll = window.setInterval(() => {
      if (!isActive) {
        void loadSlot(false);
      }
    }, 4500);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [pairCode, deviceId, isActive]);

  const acquireWakeLock = async (): Promise<void> => {
    if ('wakeLock' in navigator && navigator.wakeLock) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        setWakeLockHeld(true);
      } catch {
        setWakeLockHeld(false);
      }
    }
  };

  const releaseWakeLock = async (): Promise<void> => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore release error
      }
      wakeLockRef.current = null;
    }
    setWakeLockHeld(false);
  };

  const startMobileConnection = async (): Promise<void> => {
    setErrorMsg('');
    setConnecting(true);
    try {
      const activated = await activatePairedPhone(pairCode, deviceId);
      setAccount(activated.account);
      setDevice(activated.device);
      await acquireWakeLock();
      pendingSecRef.current = 0;
      pendingTicksRef.current = 0;
      setPendingSeconds(0);
      setPendingTicks(0);
      setIsActive(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to link mobile phone.');
    } finally {
      setConnecting(false);
    }
  };

  const pauseMobileConnection = async (): Promise<void> => {
    setIsActive(false);
    await releaseWakeLock();
    const leftoverTicks = pendingTicksRef.current;
    const leftoverSecs = pendingSecRef.current;
    pendingSecRef.current = 0;
    pendingTicksRef.current = 0;
    setPendingSeconds(0);
    setPendingTicks(0);
    if (leftoverTicks >= 1 && !committingRef.current) {
      committingRef.current = true;
      try {
        const safeSecs = Math.max(leftoverTicks, leftoverSecs, 1);
        const res = await commitPairedPhoneInterval(
          pairCode,
          deviceId,
          safeSecs,
          leftoverTicks * MICROS_PER_TICK
        );
        if (res.account) setAccount(res.account);
        if (res.device) setDevice(res.device);
      } finally {
        committingRef.current = false;
      }
    }
    await setPairedPhoneOffline(pairCode, deviceId);
  };

  useEffect(() => {
    if (!isActive) return;

    const secTimer = window.setInterval(() => {
      if (!navigator.onLine) return;
      pendingSecRef.current += 1;
      setPendingSeconds(pendingSecRef.current);
    }, 1000);

    const fastTickTimer = window.setInterval(() => {
      if (!navigator.onLine) return;
      pendingTicksRef.current += 1;
      setPendingTicks(pendingTicksRef.current);

      if (pendingTicksRef.current >= TICKS_PER_COMMIT && !committingRef.current) {
        const ticksToCommit = pendingTicksRef.current;
        const secsToCommit = Math.max(
          ticksToCommit,
          pendingSecRef.current || HEARTBEAT_COMMIT_SECONDS
        );
        pendingTicksRef.current = 0;
        pendingSecRef.current = 0;
        setPendingTicks(0);
        setPendingSeconds(0);
        committingRef.current = true;

        void commitPairedPhoneInterval(
          pairCode,
          deviceId,
          secsToCommit,
          ticksToCommit * MICROS_PER_TICK
        )
          .then((res) => {
            if (res.account) setAccount(res.account);
            if (res.device) setDevice(res.device);
            if (!res.committed) {
              setIsActive(false);
            }
          })
          .finally(() => {
            committingRef.current = false;
          });
      }
    }, TICK_INTERVAL_MS);

    return () => {
      window.clearInterval(secTimer);
      window.clearInterval(fastTickTimer);
    };
  }, [isActive, pairCode, deviceId]);

  const pendingMicros = pendingTicks * MICROS_PER_TICK;
  const liveBalanceMicros = (account?.availableBalanceMicros || 0) + pendingMicros;
  const liveSessionSeconds = (device?.sessionSeconds || 0) + pendingSeconds;

  return (
    <div className="min-h-screen bg-[#F2F4F9] text-slate-900 flex flex-col justify-between p-5">
      <div className="max-w-md w-full mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            <MoneyLinkLogo size="sm" />
            <span>Money Link</span>
          </span>
          <button
            type="button"
            onClick={onExitToDashboard}
            className="min-h-[40px] px-3.5 py-2 text-xs font-extrabold text-[#0A84FF] bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            Open Wallet App
          </button>
        </div>

        <div className="rounded-[32px] bg-gradient-to-br from-[#0B132B] via-[#1D4ED8] to-[#059669] text-white p-6 shadow-xl shadow-indigo-950/15 space-y-5">
          <div className="flex items-center justify-between text-xs text-sky-100">
            <span className="font-mono tabular-nums">Money Link Live · {pairCode}</span>
            <span className="inline-flex items-center gap-1.5 font-bold text-white">
              {browserOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-300" />
                  {isActive ? 'Online · +$0.10 Live' : 'Ready'}
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-300" />
                  Offline
                </>
              )}
            </span>
          </div>

          {loadingSlot ? (
            <div className="space-y-2 py-4">
              <p className="text-base font-extrabold text-white">Connecting Smartphone Link...</p>
              <p className="text-xs text-sky-100/90">
                Verifying pairing code {pairCode} with your Money Link wallet...
              </p>
            </div>
          ) : !account ? (
            <div className="space-y-3 pt-1">
              <h1 className="text-lg font-extrabold text-white">QR Pairing Link Ready</h1>
              <p className="text-xs text-sky-100/90">
                {errorMsg ||
                  'Generate a fresh QR code from your Money Link Dashboard or open your wallet directly.'}
              </p>
              <button
                type="button"
                onClick={onExitToDashboard}
                className="w-full min-h-[48px] px-4 py-3 text-xs font-extrabold bg-white text-slate-950 rounded-2xl"
              >
                Open Money Link Wallet
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-sky-200 font-semibold">
                  {account.displayName} · Live Wallet Balance
                </p>
                <p className="text-4xl font-extrabold font-mono tabular-nums text-white mt-1">
                  {formatUsdMicros(liveBalanceMicros, 2)}
                </p>
                <p className="text-xs text-amber-300 font-bold mt-1 inline-flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  +$0.10 every 1.8s · $10.00 in 3 mins
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-white/15 backdrop-blur-md">
                <div>
                  <p className="text-[11px] text-sky-100">Phone Uptime</p>
                  <p className="text-base font-mono tabular-nums font-extrabold text-white mt-0.5">
                    {formatDurationSeconds(liveSessionSeconds)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-sky-100">Network Ping</p>
                  <p className="text-base font-mono tabular-nums font-extrabold text-white mt-0.5">
                    {device?.latencyMs ? `${device.latencyMs} ms` : '—'}
                  </p>
                </div>
              </div>

              {errorMsg && <p className="text-xs text-amber-200 font-semibold">{errorMsg}</p>}

              {!isActive ? (
                <button
                  type="button"
                  disabled={connecting || !browserOnline}
                  onClick={() => void startMobileConnection()}
                  className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-extrabold bg-amber-300 text-slate-950 rounded-2xl hover:bg-amber-200 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {connecting ? 'Connecting Phone...' : 'Start Fast +$0.10 Stream'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void pauseMobileConnection()}
                  className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-extrabold bg-gradient-to-r from-rose-500 to-orange-500 text-white rounded-2xl hover:opacity-95 active:scale-[0.98] transition-all"
                >
                  <Pause className="w-4 h-4" />
                  Pause Phone Stream
                </button>
              )}

              <div className="flex items-center justify-between text-xs text-sky-100 pt-1">
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{device?.deviceName || 'Mobile Phone'}</span>
                </span>
                <span>
                  {wakeLockHeld ? (
                    <span className="inline-flex items-center gap-1 text-white font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Screen Awake
                    </span>
                  ) : (
                    'Keep app open'
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 pt-6">
        Money Link · Stream +$0.10 Fast · $10.00 Instant Bank Cashout
      </p>
    </div>
  );
};
