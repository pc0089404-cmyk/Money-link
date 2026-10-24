import React, { useEffect, useRef, useState } from 'react';
import { signInWithPopup, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { CheckCircle2, Lock, Pause, Play, Smartphone, Wifi, WifiOff, Zap } from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  commitVerifiedUptimeInterval,
  registerOrActivateDevice,
  setDeviceOffline,
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
  firebaseUser: User | null;
  onExitToDashboard: () => void;
}

export const MobileNodeView: React.FC<MobileNodeViewProps> = ({
  pairCode,
  deviceId,
  firebaseUser,
  onExitToDashboard,
}) => {
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [device, setDevice] = useState<ConnectedDevice | null>(null);
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

  const [accountConfirmed, setAccountConfirmed] = useState(false);

  useEffect(() => {
    if (!firebaseUser) {
      setAccount(null);
      setAccountConfirmed(false);
      return;
    }
    const unsubUser = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists()) {
          setAccount(snap.data() as UserAccount);
          setAccountConfirmed(!snap.metadata.hasPendingWrites);
        } else {
          setAccount(null);
          setAccountConfirmed(false);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`)
    );

    return () => {
      unsubUser();
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !account?.identityVerified || !accountConfirmed) return;

    const unsubDev = onSnapshot(
      doc(db, 'users', firebaseUser.uid, 'devices', deviceId),
      (snap) => {
        if (snap.exists()) setDevice(snap.data() as ConnectedDevice);
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.GET,
          `users/${firebaseUser.uid}/devices/${deviceId}`
        )
    );

    return () => {
      unsubDev();
    };
  }, [firebaseUser, deviceId, account?.identityVerified, accountConfirmed]);

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
    if (!firebaseUser) return;
    setErrorMsg('');
    setConnecting(true);
    try {
      await registerOrActivateDevice(
        firebaseUser.uid,
        deviceId,
        'qr_paired_phone',
        pairCode
      );
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
    if (!firebaseUser) return;
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
        await commitVerifiedUptimeInterval(
          firebaseUser.uid,
          deviceId,
          safeSecs,
          leftoverTicks * MICROS_PER_TICK
        );
      } finally {
        committingRef.current = false;
      }
    }
    await setDeviceOffline(firebaseUser.uid, deviceId);
  };

  useEffect(() => {
    if (!isActive || !firebaseUser) return;

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

        void commitVerifiedUptimeInterval(
          firebaseUser.uid,
          deviceId,
          secsToCommit,
          ticksToCommit * MICROS_PER_TICK
        )
          .then((res) => {
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
  }, [isActive, firebaseUser, deviceId]);

  const handleAuthOnPhone = async (): Promise<void> => {
    setErrorMsg('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      if (msg.includes('popup-closed-by-user') || msg.includes('cancelled-popup-request')) {
        setErrorMsg('Verification window closed. Tap "Verify & Pair Phone" again to connect.');
      } else if (msg.includes('popup-blocked')) {
        setErrorMsg('Popup blocked by browser. Allow popups and tap "Verify & Pair Phone" again.');
      } else {
        setErrorMsg(msg);
      }
    }
  };

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

          {!firebaseUser ? (
            <div className="space-y-4 pt-1">
              <h1 className="text-xl font-extrabold text-white">
                Link this smartphone to your Money Link wallet
              </h1>
              <p className="text-xs text-sky-100/90 leading-relaxed">
                Confirm your Google account bound to your USA ID so this phone streams +$0.10 every
                1.8 seconds ($10.00 in 3 minutes).
              </p>
              {errorMsg && <p className="text-xs text-amber-200 font-semibold">{errorMsg}</p>}
              <button
                type="button"
                onClick={() => void handleAuthOnPhone()}
                className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-extrabold bg-white text-slate-950 rounded-2xl hover:bg-sky-50 active:scale-[0.98] transition-all"
              >
                <Lock className="w-4 h-4" />
                Verify &amp; Pair Phone
              </button>
            </div>
          ) : !account ? (
            <div className="space-y-3 pt-1">
              <h1 className="text-lg font-extrabold text-white">Complete USA ID Sign-Up First</h1>
              <p className="text-xs text-sky-100/90">
                Finish creating your wallet with a verified USA ID code before pairing a phone.
              </p>
              <button
                type="button"
                onClick={onExitToDashboard}
                className="w-full min-h-[48px] px-4 py-3 text-xs font-extrabold bg-white text-slate-950 rounded-2xl"
              >
                Go to USA ID Sign Up
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-sky-200 font-semibold">Live Wallet Balance</p>
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
