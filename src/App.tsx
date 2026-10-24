/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Home,
  LogOut,
  Pause,
  Play,
  ShieldCheck,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import { AuthPortal } from './components/AuthPortal';
import { BoostPage } from './components/BoostPage';
import { DashboardPage } from './components/DashboardPage';
import { EarningsPage } from './components/EarningsPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MobileNodeView } from './components/MobileNodeView';
import { MoneyLinkLoader } from './components/MoneyLinkLoader';
import { MoneyLinkLogo } from './components/MoneyLinkLogo';
import { ProfilePage } from './components/ProfilePage';
import { WithdrawPage } from './components/WithdrawPage';
import { BOOST_APPS, formatBoostMultiplierLabel } from './data/boostApps';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  commitVerifiedUptimeInterval,
  registerOrActivateDevice,
  setDeviceOffline,
} from './services/ledgerService';
import {
  AppPage,
  ConnectedDevice,
  EarningEntry,
  HEARTBEAT_COMMIT_SECONDS,
  MAX_BOOST_MULTIPLIER,
  MICROS_PER_TICK,
  TICK_INTERVAL_MS,
  TICKS_PER_COMMIT,
  UserAccount,
  UserPrivateVault,
  WithdrawalRequest,
} from './types';
import { formatDurationSeconds, formatUsdMicros } from './utils/validation';

function getOrCreateLocalDeviceId(uid: string, revokedIds?: Set<string>): string {
  const storageKey = `moneylink_node_id_${uid}`;
  try {
    const existing = localStorage.getItem(storageKey);
    if (
      existing &&
      /^[a-zA-Z0-9_-]{4,80}$/.test(existing) &&
      (!revokedIds || !revokedIds.has(existing))
    ) {
      return existing;
    }
    const fresh = `node_${uid.slice(0, 12)}_${Date.now().toString(36)}`;
    localStorage.setItem(storageKey, fresh);
    return fresh;
  } catch {
    return `node_${uid.slice(0, 12)}_${Date.now().toString(36)}`;
  }
}

function loadSavedBoostAppIds(uid: string): string[] {
  try {
    const raw = localStorage.getItem(`moneylink_boost_apps_${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const validSet = new Set(BOOST_APPS.map((a) => a.id));
    return parsed.filter((id): id is string => typeof id === 'string' && validSet.has(id));
  } catch {
    return [];
  }
}

function MoneyLinkWorkspace() {
  const [authReady, setAuthReady] = useState(false);
  const [initialBootDone, setInitialBootDone] = useState(false);
  const [bootSplashMinDone, setBootSplashMinDone] = useState(false);
  const [postSignUpLoading, setPostSignUpLoading] = useState(false);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [accountConfirmedOnServer, setAccountConfirmedOnServer] = useState(false);
  const [vault, setVault] = useState<UserPrivateVault | null>(null);
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [earnings, setEarnings] = useState<EarningEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);

  const [activePage, setActivePage] = useState<AppPage>(AppPage.DASHBOARD);
  const [workspaceError, setWorkspaceError] = useState('');

  // Connected Social & Data Boost Apps (persisted per user in localStorage)
  const [connectedAppIds, setConnectedAppIds] = useState<string[]>([]);

  // Check if opened via Mobile QR Pairing URL (?pair=...&dev=...)
  const initialPairParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const pair = params.get('pair');
    const dev = params.get('dev');
    if (pair && dev && /^[A-Z0-9-]{6,12}$/.test(pair) && /^[a-zA-Z0-9_-]{1,128}$/.test(dev)) {
      return { pairCode: pair, deviceId: dev };
    }
    return null;
  }, []);
  const [mobilePairMode, setMobilePairMode] = useState<boolean>(Boolean(initialPairParams));

  // Real local device online connectivity + fast +$0.10 * multiplier stream state
  const [localConnected, setLocalConnected] = useState(false);
  const [localConnecting, setLocalConnecting] = useState(false);
  const [browserOnline, setBrowserOnline] = useState<boolean>(navigator.onLine);
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [pendingTicks, setPendingTicks] = useState(0);
  const [pendingMicros, setPendingMicros] = useState(0);
  const [lastLatencyMs, setLastLatencyMs] = useState(0);
  const [wakeLockHeld, setWakeLockHeld] = useState(false);

  const pendingSecRef = useRef(0);
  const pendingTicksRef = useRef(0);
  const pendingMicrosRef = useRef(0);
  const committingRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const activeBoostMultiplier = useMemo(() => {
    const connectedSet = new Set(connectedAppIds);
    let extra = 0;
    for (const app of BOOST_APPS) {
      if (connectedSet.has(app.id)) {
        extra += app.multiplier;
      }
    }
    const raw = Math.round((1 + extra) * 10) / 10;
    return Math.min(MAX_BOOST_MULTIPLIER, Math.max(1, raw));
  }, [connectedAppIds]);

  const boostMultiplierRef = useRef(activeBoostMultiplier);
  useEffect(() => {
    boostMultiplierRef.current = activeBoostMultiplier;
  }, [activeBoostMultiplier]);

  const revokedDeviceIds = useMemo(
    () => new Set(devices.filter((d) => d.status === 'revoked').map((d) => d.deviceId)),
    [devices]
  );

  // Brief launch splash screen on app open / refresh
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBootSplashMinDone(true);
    }, 650);
    return () => window.clearTimeout(timer);
  }, []);

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

  // Keep existing signed-in users logged in automatically across refreshes & updates
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        setConnectedAppIds(loadSavedBoostAppIds(user.uid));
      } else {
        setAccount(null);
        setAccountConfirmedOnServer(false);
        setVault(null);
        setDevices([]);
        setEarnings([]);
        setWithdrawals([]);
        setConnectedAppIds([]);
        setInitialBootDone(true);
        setLocalConnected(false);
      }
    });
    return () => unsub();
  }, []);

  const persistBoostApps = useCallback(
    (nextIds: string[]) => {
      setConnectedAppIds(nextIds);
      if (firebaseUser) {
        try {
          localStorage.setItem(
            `moneylink_boost_apps_${firebaseUser.uid}`,
            JSON.stringify(nextIds)
          );
        } catch {
          // Ignore storage quota errors
        }
      }
    },
    [firebaseUser]
  );

  const handleToggleBoostApp = useCallback(
    (appId: string) => {
      setConnectedAppIds((prev) => {
        const exists = prev.includes(appId);
        const next = exists ? prev.filter((id) => id !== appId) : [...prev, appId];
        if (firebaseUser) {
          try {
            localStorage.setItem(`moneylink_boost_apps_${firebaseUser.uid}`, JSON.stringify(next));
          } catch {
            // Ignore storage errors
          }
        }
        return next;
      });
    },
    [firebaseUser]
  );

  const handleConnectMultipleApps = useCallback(
    (appIds: string[]) => {
      setConnectedAppIds((prev) => {
        const merged = Array.from(new Set([...prev, ...appIds]));
        if (firebaseUser) {
          try {
            localStorage.setItem(
              `moneylink_boost_apps_${firebaseUser.uid}`,
              JSON.stringify(merged)
            );
          } catch {
            // Ignore storage errors
          }
        }
        return merged;
      });
    },
    [firebaseUser]
  );

  const handleDisconnectAllApps = useCallback(() => {
    persistBoostApps([]);
  }, [persistBoostApps]);

  // Attach Firestore account listener when auth is ready and user is authenticated.
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const uid = firebaseUser.uid;
    const userPath = `users/${uid}`;

    const unsubAccount = onSnapshot(
      doc(db, 'users', uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserAccount;
          setAccount(data);
          if (!snap.metadata.hasPendingWrites) {
            setAccountConfirmedOnServer(true);
          }
        } else {
          setAccount(null);
          setAccountConfirmedOnServer(false);
        }
        setInitialBootDone(true);
      },
      (err) => {
        setInitialBootDone(true);
        handleFirestoreError(err, OperationType.GET, userPath);
      }
    );

    return () => {
      unsubAccount();
    };
  }, [authReady, firebaseUser]);

  // Attach subcollection listeners once parent /users/{uid} is confirmed on server
  useEffect(() => {
    if (!authReady || !firebaseUser || !account?.identityVerified || !accountConfirmedOnServer) {
      return;
    }

    const uid = firebaseUser.uid;

    const unsubVault = onSnapshot(
      doc(db, 'users', uid, 'private', 'vault'),
      (snap) => {
        if (snap.exists()) {
          setVault(snap.data() as UserPrivateVault);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}/private/vault`)
    );

    const devicesQuery = query(
      collection(db, 'users', uid, 'devices'),
      where('uid', '==', uid)
    );
    const unsubDevices = onSnapshot(
      devicesQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ConnectedDevice);
        list.sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
        setDevices(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/devices`)
    );

    const earningsQuery = query(
      collection(db, 'users', uid, 'earnings'),
      where('uid', '==', uid)
    );
    const unsubEarnings = onSnapshot(
      earningsQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as EarningEntry);
        list.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        setEarnings(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/earnings`)
    );

    const withdrawalsQuery = query(
      collection(db, 'users', uid, 'withdrawals'),
      where('uid', '==', uid)
    );
    const unsubWithdrawals = onSnapshot(
      withdrawalsQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as WithdrawalRequest);
        list.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        setWithdrawals(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/withdrawals`)
    );

    return () => {
      unsubVault();
      unsubDevices();
      unsubEarnings();
      unsubWithdrawals();
    };
  }, [authReady, firebaseUser, account?.identityVerified, accountConfirmedOnServer]);

  const handleAuthenticated = useCallback(
    (authedUser?: User, verifiedAccount?: UserAccount, isNewSignUp?: boolean) => {
      if (authedUser) {
        setFirebaseUser(authedUser);
        setConnectedAppIds(loadSavedBoostAppIds(authedUser.uid));
      }
      if (verifiedAccount) {
        setAccount(verifiedAccount);
        setAccountConfirmedOnServer(true);
      }
      setInitialBootDone(true);

      if (isNewSignUp) {
        setPostSignUpLoading(true);
        window.setTimeout(() => {
          setPostSignUpLoading(false);
        }, 1150);
      }
    },
    []
  );

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore release errors
      }
      wakeLockRef.current = null;
    }
    setWakeLockHeld(false);
  }, []);

  const handleStartLocalNode = useCallback(async () => {
    if (!firebaseUser || !account) return;
    setWorkspaceError('');
    setLocalConnecting(true);
    try {
      const localDevId = getOrCreateLocalDeviceId(firebaseUser.uid, revokedDeviceIds);
      const dev = await registerOrActivateDevice(
        firebaseUser.uid,
        localDevId,
        'direct_device'
      );
      if (dev.deviceId !== localDevId) {
        try {
          localStorage.setItem(`moneylink_node_id_${firebaseUser.uid}`, dev.deviceId);
        } catch {
          // Ignore storage error
        }
      }
      setLastLatencyMs(dev.latencyMs);

      if ('wakeLock' in navigator && navigator.wakeLock) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          setWakeLockHeld(true);
        } catch {
          setWakeLockHeld(false);
        }
      }

      pendingSecRef.current = 0;
      pendingTicksRef.current = 0;
      pendingMicrosRef.current = 0;
      setPendingSeconds(0);
      setPendingTicks(0);
      setPendingMicros(0);
      setLocalConnected(true);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Unable to start phone node connection.'
      );
    } finally {
      setLocalConnecting(false);
    }
  }, [firebaseUser, account, revokedDeviceIds]);

  const handleStopLocalNode = useCallback(async () => {
    if (!firebaseUser) return;
    setWorkspaceError('');
    setLocalConnected(false);
    await releaseWakeLock();

    try {
      const localDevId = getOrCreateLocalDeviceId(firebaseUser.uid, revokedDeviceIds);
      const leftoverTicks = pendingTicksRef.current;
      const leftoverSecs = pendingSecRef.current;
      const leftoverMicros = pendingMicrosRef.current;
      pendingSecRef.current = 0;
      pendingTicksRef.current = 0;
      pendingMicrosRef.current = 0;
      setPendingSeconds(0);
      setPendingTicks(0);
      setPendingMicros(0);

      if (leftoverTicks >= 1 && leftoverMicros > 0 && !committingRef.current) {
        committingRef.current = true;
        try {
          const safeSecs = Math.max(leftoverTicks, leftoverSecs, 1);
          const res = await commitVerifiedUptimeInterval(
            firebaseUser.uid,
            localDevId,
            safeSecs,
            leftoverMicros
          );
          if (res.latencyMs > 0) setLastLatencyMs(res.latencyMs);
        } finally {
          committingRef.current = false;
        }
      }
      await setDeviceOffline(firebaseUser.uid, localDevId);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Error while pausing phone node.'
      );
    }
  }, [firebaseUser, releaseWakeLock, revokedDeviceIds]);

  // Real-time fast +$0.10 * boostMultiplier every 1.8s stream loop
  useEffect(() => {
    if (!localConnected || !firebaseUser) return;
    const uid = firebaseUser.uid;
    const localDevId = getOrCreateLocalDeviceId(uid, revokedDeviceIds);

    const secTimer = window.setInterval(() => {
      if (!navigator.onLine) return;
      pendingSecRef.current += 1;
      setPendingSeconds(pendingSecRef.current);
    }, 1000);

    const fastTickTimer = window.setInterval(() => {
      if (!navigator.onLine) return;
      const tickIncrement = Math.round(MICROS_PER_TICK * boostMultiplierRef.current);
      pendingTicksRef.current += 1;
      pendingMicrosRef.current += tickIncrement;
      setPendingTicks(pendingTicksRef.current);
      setPendingMicros(pendingMicrosRef.current);

      if (pendingTicksRef.current >= TICKS_PER_COMMIT && !committingRef.current) {
        const ticksToCommit = pendingTicksRef.current;
        const secsToCommit = Math.max(
          ticksToCommit,
          pendingSecRef.current || HEARTBEAT_COMMIT_SECONDS
        );
        const microsToCommit = pendingMicrosRef.current;

        pendingTicksRef.current = 0;
        pendingSecRef.current = 0;
        pendingMicrosRef.current = 0;
        setPendingTicks(0);
        setPendingSeconds(0);
        setPendingMicros(0);
        committingRef.current = true;

        void commitVerifiedUptimeInterval(uid, localDevId, secsToCommit, microsToCommit)
          .then((res) => {
            if (res.latencyMs > 0) {
              setLastLatencyMs(res.latencyMs);
            }
            if (!res.committed) {
              setLocalConnected(false);
            }
          })
          .catch((err) => {
            setLocalConnected(false);
            setWorkspaceError(
              err instanceof Error ? err.message : 'Live uptime sync interrupted.'
            );
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
  }, [localConnected, firebaseUser, revokedDeviceIds]);

  const handleSignOut = async (): Promise<void> => {
    try {
      if (localConnected) {
        await handleStopLocalNode();
      }
      await signOut(auth);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Unable to sign out cleanly.');
    }
  };

  // 1. Launch / Refresh Loading Screen
  if (!initialBootDone || !bootSplashMinDone) {
    return (
      <MoneyLinkLoader
        title="Money Link"
        subtitle="Stay connected online and watch real cash rewards stream into your wallet."
        badgeText="Live Cash Stream · Instant Bank Cashout"
        variant="fullscreen"
      />
    );
  }

  // 2. Celebratory New Sign-Up Loading Screen
  if (postSignUpLoading) {
    return (
      <MoneyLinkLoader
        title="Welcome to Money Link"
        subtitle="Your wallet is active — tap Connect and boost your rate with your favorite apps."
        badgeText="Fast Rewards · All Local Banks Ready"
        variant="fullscreen"
      />
    );
  }

  // Dedicated Mobile Phone QR Pairing View
  if (mobilePairMode && initialPairParams) {
    return (
      <MobileNodeView
        pairCode={initialPairParams.pairCode}
        deviceId={initialPairParams.deviceId}
        firebaseUser={firebaseUser}
        onExitToDashboard={() => {
          setMobilePairMode(false);
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  // Only show AuthPortal if user is not signed in or has not completed USA ID verification yet
  if (!firebaseUser || !account || !account.identityVerified) {
    return (
      <AuthPortal
        firebaseUser={firebaseUser}
        existingAccount={account?.identityVerified ? account : null}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const liveBalanceMicros = account.availableBalanceMicros + pendingMicros;
  const liveUptimeSeconds = account.totalOnlineSeconds + pendingSeconds;
  const boostedTickMicros = Math.round(MICROS_PER_TICK * activeBoostMultiplier);

  const navItems: {
    id: AppPage;
    label: string;
    mobileLabel: string;
    icon: React.ReactNode;
    badgeBg: string;
  }[] = [
    {
      id: AppPage.DASHBOARD,
      label: 'Dashboard',
      mobileLabel: 'Home',
      icon: <Home className="w-5 h-5" />,
      badgeBg: 'bg-sky-50 text-[#0A84FF]',
    },
    {
      id: AppPage.BOOST,
      label: 'Boost',
      mobileLabel: 'Boost',
      icon: <Zap className="w-5 h-5" />,
      badgeBg: 'bg-amber-50 text-amber-600',
    },
    {
      id: AppPage.EARNINGS,
      label: 'Earnings',
      mobileLabel: 'Earnings',
      icon: <BarChart3 className="w-5 h-5" />,
      badgeBg: 'bg-emerald-50 text-emerald-600',
    },
    {
      id: AppPage.WITHDRAW,
      label: 'Withdraw',
      mobileLabel: 'Withdraw',
      icon: <ArrowUpRight className="w-5 h-5" />,
      badgeBg: 'bg-indigo-50 text-indigo-600',
    },
    {
      id: AppPage.PROFILE,
      label: 'Profile',
      mobileLabel: 'Profile',
      icon: <UserCheck className="w-5 h-5" />,
      badgeBg: 'bg-slate-100 text-slate-700',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900 flex flex-col relative overflow-x-clip">
      {/* Soft Cool Ambient Wash */}
      <div className="pointer-events-none fixed top-0 inset-x-0 h-80 bg-gradient-to-b from-sky-100/60 via-indigo-50/20 to-transparent z-0" />

      {/* Clean 3-Zone Top Bar (Single-line Brand, 5 Single-line Nav Links, 1 Primary Action) */}
      <header className="sticky top-0 z-30 h-14 sm:h-16 bg-white/85 backdrop-blur-xl border-b border-slate-200/80 px-4 sm:px-7 lg:px-8 flex items-center">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActivePage(AppPage.DASHBOARD)}
            className="inline-flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <MoneyLinkLogo size="sm" />
            <span>Money Link</span>
          </button>

          {/* Zone 2: 5 Clean Single-Line Text Nav Links */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold text-slate-600">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activePage === item.id
                    ? 'text-[#0A84FF] border-[#0A84FF]'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            {!localConnected ? (
              <button
                type="button"
                disabled={localConnecting || !browserOnline}
                onClick={() => void handleStartLocalNode()}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-extrabold text-white bg-gradient-to-r from-[#0A84FF] to-[#059669] rounded-xl hover:opacity-95 active:scale-[0.98] disabled:opacity-40 transition-all whitespace-nowrap shrink-0 shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {localConnecting
                  ? 'Linking...'
                  : `Connect +${formatUsdMicros(boostedTickMicros, 2)}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleStopLocalNode()}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-extrabold text-white bg-gradient-to-r from-rose-500 to-orange-500 rounded-xl hover:opacity-95 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 shadow-xs"
              >
                <Pause className="w-3.5 h-3.5" />
                Earning ({formatBoostMultiplierLabel(activeBoostMultiplier)}) · Pause
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Spacious Responsive Shell (max-w-7xl with generous breathing room) */}
      <div className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-7 lg:px-8 pt-6 pb-24 lg:py-9 flex gap-8 items-start">
        {/* Desktop Companion Sidebar */}
        <aside className="hidden lg:flex w-72 shrink-0 flex-col gap-6 sticky top-24">
          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0F172A] via-[#1E40AF] to-[#059669] text-white p-6 shadow-lg shadow-slate-900/12 space-y-4">
            <div className="pointer-events-none absolute -top-12 -right-12 w-36 h-36 rounded-full bg-sky-400/25 blur-2xl" />

            <div className="relative flex items-center justify-between text-xs text-sky-100">
              <span className="font-semibold">Money Link Wallet</span>
              <span className="font-mono tabular-nums">{account.usaIdMasked}</span>
            </div>
            <div className="relative">
              <p className="text-3xl font-extrabold font-mono tabular-nums tracking-tight">
                {formatUsdMicros(liveBalanceMicros, 2)}
              </p>
              <p className="text-xs text-emerald-200 mt-1.5 font-mono tabular-nums">
                {formatDurationSeconds(liveUptimeSeconds)} ·{' '}
                {formatBoostMultiplierLabel(activeBoostMultiplier)} rate
              </p>
            </div>
            <div className="relative pt-3.5 border-t border-white/15 flex items-center justify-between text-xs text-sky-100">
              <span className="truncate max-w-[140px] font-semibold">{account.displayName}</span>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                US {account.issuingState}
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-[28px] p-3.5 space-y-1.5 shadow-[0_8px_30px_rgb(15,23,42,0.04)]">
            {navItems.map((item) => {
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivePage(item.id)}
                  className={`w-full min-h-[50px] flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm font-bold rounded-2xl transition-all whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-sky-50/90 text-[#0A84FF]'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <span className="flex items-center gap-3.5">
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.badgeBg}`}
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </span>
                  {item.id === AppPage.BOOST && (
                    <span className="text-xs font-mono tabular-nums font-extrabold text-amber-600">
                      {formatBoostMultiplierLabel(activeBoostMultiplier)}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="pt-2.5 mt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full min-h-[48px] flex items-center gap-3.5 px-3.5 py-2 text-xs font-extrabold text-rose-600 hover:bg-rose-50 rounded-2xl transition-colors whitespace-nowrap shrink-0"
              >
                <span className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <LogOut className="w-4 h-4" />
                </span>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Workspace Content */}
        <main className="flex-1 min-w-0 w-full space-y-6">
          {workspaceError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start justify-between gap-3 text-xs font-semibold text-rose-900">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{workspaceError}</span>
              </div>
              <button
                type="button"
                onClick={() => setWorkspaceError('')}
                aria-label="Dismiss error"
                className="text-rose-600 hover:text-rose-800 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {activePage === AppPage.DASHBOARD && (
            <DashboardPage
              account={account}
              devices={devices}
              earnings={earnings}
              localConnected={localConnected}
              localConnecting={localConnecting}
              browserOnline={browserOnline}
              pendingSeconds={pendingSeconds}
              pendingTicks={pendingTicks}
              pendingMicros={pendingMicros}
              lastLatencyMs={lastLatencyMs}
              wakeLockHeld={wakeLockHeld}
              activeBoostMultiplier={activeBoostMultiplier}
              connectedBoostCount={connectedAppIds.length}
              onStartLocalNode={handleStartLocalNode}
              onStopLocalNode={handleStopLocalNode}
              onNavigate={setActivePage}
            />
          )}

          {activePage === AppPage.BOOST && (
            <BoostPage
              connectedAppIds={connectedAppIds}
              onToggleApp={handleToggleBoostApp}
              onConnectMultipleApps={handleConnectMultipleApps}
              onDisconnectAllApps={handleDisconnectAllApps}
              localConnected={localConnected}
              localConnecting={localConnecting}
              browserOnline={browserOnline}
              onStartLocalNode={handleStartLocalNode}
              activeBoostMultiplier={activeBoostMultiplier}
            />
          )}

          {activePage === AppPage.EARNINGS && (
            <EarningsPage
              earnings={earnings}
              pendingSeconds={pendingSeconds}
              pendingMicros={pendingMicros}
            />
          )}

          {activePage === AppPage.WITHDRAW && (
            <WithdrawPage
              account={account}
              vault={vault}
              withdrawals={withdrawals}
              pendingMicros={pendingMicros}
            />
          )}

          {activePage === AppPage.PROFILE && (
            <ProfilePage
              account={account}
              vault={vault}
              devices={devices}
              onSignOut={handleSignOut}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (5 Destinations, 56px height -> Aggregate sticky height < 14% of mobile viewport) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/90 backdrop-blur-xl border-t border-slate-200/80 px-1.5"
      >
        <div className="max-w-lg mx-auto h-full grid grid-cols-5 items-center">
          {navItems.map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center rounded-xl transition-colors ${
                  active ? 'text-[#0A84FF]' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {item.icon}
                <span
                  className={`text-[10px] tracking-tight mt-0.5 whitespace-nowrap ${
                    active ? 'font-extrabold text-[#0A84FF]' : 'font-semibold text-slate-500'
                  }`}
                >
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MoneyLinkWorkspace />
    </ErrorBoundary>
  );
}
