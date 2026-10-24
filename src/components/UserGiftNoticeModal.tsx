import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Gift, KeyRound } from 'lucide-react';
import { claimUserGift150 } from '../services/ledgerService';
import { UserAccount } from '../types';
import { formatUsdMicros } from '../utils/validation';
import { MoneyLinkLogo } from './MoneyLinkLogo';

interface UserGiftNoticeModalProps {
  account: UserAccount;
}

const GIFT_DURATION_MS = 10_000; // Exact 10 seconds loading line

function getRpcUpdateAckKey(uid: string): string {
  return `moneylink_rpc_11k_notice_ack_v1_${uid}`;
}

function hasAcknowledgedRpcUpdate(uid: string): boolean {
  try {
    return localStorage.getItem(getRpcUpdateAckKey(uid)) === '1';
  } catch {
    return false;
  }
}

function markRpcUpdateAcknowledged(uid: string): void {
  try {
    localStorage.setItem(getRpcUpdateAckKey(uid), '1');
  } catch {
    // Ignore storage quota errors
  }
}

export const UserGiftNoticeModal: React.FC<UserGiftNoticeModalProps> = ({ account }) => {
  const [phase, setPhase] = useState<'hidden' | 'loading_gift' | 'rpc_update_note'>(() => {
    if (!account.gift150Claimed) {
      return 'loading_gift';
    }
    if (!hasAcknowledgedRpcUpdate(account.uid)) {
      return 'rpc_update_note';
    }
    return 'hidden';
  });

  const [progress, setProgress] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [crediting, setCrediting] = useState(false);

  const triggeredUidRef = useRef<string | null>(null);

  // Sync phase if user switches accounts in the same browser session
  useEffect(() => {
    if (!account.gift150Claimed) {
      setPhase('loading_gift');
    } else if (!hasAcknowledgedRpcUpdate(account.uid)) {
      setPhase('rpc_update_note');
    } else {
      setPhase('hidden');
    }
  }, [account.uid, account.gift150Claimed]);

  // 10-second smooth line loading animation -> credits +$150.00 -> transitions to RPC 11k update note
  useEffect(() => {
    if (phase !== 'loading_gift') return;
    if (account.gift150Claimed) {
      setPhase('rpc_update_note');
      return;
    }

    let rafId = 0;
    let cancelled = false;
    const startTime = performance.now();
    setProgress(0);
    setSecondsLeft(10);

    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = Math.max(0, now - startTime);
      const ratio = Math.min(1, elapsed / GIFT_DURATION_MS);
      const remaining = Math.max(0, Math.ceil((GIFT_DURATION_MS - elapsed) / 1000));

      setProgress(ratio);
      setSecondsLeft(remaining);

      if (ratio < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else if (triggeredUidRef.current !== account.uid) {
        triggeredUidRef.current = account.uid;
        setCrediting(true);
        void claimUserGift150(account.uid).finally(() => {
          if (!cancelled) {
            setCrediting(false);
            setPhase('rpc_update_note');
          }
        });
      }
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [phase, account.uid, account.gift150Claimed]);

  if (phase === 'hidden') {
    return null;
  }

  const userName = account.displayName.trim() || 'Active User';
  const percentLabel = Math.min(100, Math.round(progress * 100));

  const handleAcknowledgeRpcNote = (): void => {
    markRpcUpdateAcknowledged(account.uid);
    setPhase('hidden');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-md"
    >
      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-[30px] shadow-2xl overflow-hidden">
        {phase === 'loading_gift' ? (
          <div className="p-6 sm:p-8 space-y-6">
            {/* Top Brand & Gift Header */}
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2.5">
                <MoneyLinkLogo size="sm" />
                <span className="text-sm font-extrabold tracking-tight text-slate-900">
                  Money Link Official Note
                </span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5" />
              </div>
            </div>

            {/* Personalized Congratulatory Note with Active User's Name */}
            <div className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-950 leading-snug">
                Dear <span className="text-[#0A84FF]">{userName}</span>, congratulations on earning
                with us!
              </h2>
              <p className="text-sm sm:text-base font-semibold text-slate-700 leading-relaxed">
                Here is your gift of{' '}
                <span className="font-extrabold font-mono tabular-nums text-emerald-600">
                  $150.00
                </span>
                . Please wait while we add it directly to your wallet balance.
              </p>
            </div>

            {/* Gift Amount Card */}
            <div className="rounded-2xl bg-gradient-to-br from-[#0F172A] via-[#1E40AF] to-[#059669] p-5 text-white flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-sky-200">Active User Reward Gift</p>
                <p className="text-3xl font-extrabold font-mono tabular-nums tracking-tight mt-0.5">
                  +$150.00
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-sky-200">Recipient</p>
                <p className="text-sm font-bold text-white truncate max-w-[150px] mt-0.5">
                  {userName}
                </p>
              </div>
            </div>

            {/* 10-Second Horizontal Line Loading Animation */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>
                  {crediting
                    ? 'Crediting $150.00 to your balance...'
                    : `Adding $150.00 to balance (${secondsLeft}s)...`}
                </span>
                <span className="font-mono tabular-nums text-[#0A84FF]">{percentLabel}%</span>
              </div>

              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200/70">
                <div
                  className="h-full w-full bg-gradient-to-r from-[#0A84FF] via-indigo-500 to-emerald-500 origin-left will-change-transform"
                  style={{ transform: `scaleX(${progress})` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 sm:p-8 space-y-6">
            {/* Credited Confirmation Header */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-700">$150.00 Gift Added to Wallet</p>
                <p className="text-lg font-extrabold text-slate-950 font-mono tabular-nums">
                  New Balance: {formatUsdMicros(account.availableBalanceMicros, 2)}
                </p>
              </div>
            </div>

            {/* Second Official Note: RPC Payment Update (Not 8k anymore -> Now 11k for payment) */}
            <div className="p-5 rounded-2xl bg-amber-50 border border-amber-300 space-y-2.5">
              <div className="flex items-center gap-2 text-amber-950">
                <KeyRound className="w-5 h-5 text-amber-600 shrink-0" />
                <h3 className="text-base font-extrabold tracking-tight">
                  Important RPC Code Update
                </h3>
              </div>
              <p className="text-sm sm:text-base font-bold text-amber-950 leading-relaxed">
                Dear {userName}, the RPC code has been updated — it is not{' '}
                <span className="line-through text-rose-700 font-mono">8k</span> anymore, the RPC
                is now <span className="font-extrabold text-emerald-800 font-mono">11k</span> for
                payment.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAcknowledgeRpcNote}
              className="w-full min-h-[50px] px-5 py-3 text-sm font-extrabold text-white bg-gradient-to-r from-[#0A84FF] to-[#059669] rounded-2xl hover:opacity-95 active:scale-[0.99] transition-all shadow-sm"
            >
              Continue to Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
