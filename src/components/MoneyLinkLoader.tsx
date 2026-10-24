import React from 'react';
import { Zap } from 'lucide-react';
import { MoneyLinkLogo } from './MoneyLinkLogo';

interface MoneyLinkLoaderProps {
  title?: string;
  subtitle?: string;
  badgeText?: string;
  variant?: 'fullscreen' | 'card' | 'overlay';
}

export const MoneyLinkLoader: React.FC<MoneyLinkLoaderProps> = ({
  title = 'Money Link',
  subtitle = 'Turn your online time into fast, nonstop cash rewards.',
  badgeText = 'Fast +$0.10 Stream · Direct Bank Cashout',
  variant = 'fullscreen',
}) => {
  const innerCard = (
    <div className="w-full max-w-sm rounded-[32px] bg-white/90 backdrop-blur-2xl border border-white/80 shadow-2xl shadow-indigo-950/10 p-7 sm:p-8 flex flex-col items-center text-center space-y-5">
      <div className="relative flex items-center justify-center">
        <div className="absolute -inset-3 rounded-[28px] bg-gradient-to-tr from-emerald-400/35 via-sky-400/35 to-indigo-500/35 blur-xl animate-pulse" />
        <MoneyLinkLogo size={variant === 'card' ? 'lg' : 'xl'} animated />
      </div>

      <div className="space-y-1.5">
        <h2 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-emerald-900 bg-clip-text text-transparent">
          {title}
        </h2>
        <p className="text-xs sm:text-sm font-medium text-slate-600 leading-relaxed max-w-[270px] mx-auto">
          {subtitle}
        </p>
      </div>

      {/* Smooth Gradient Progress Track + Cool Feature Highlight */}
      <div className="w-full space-y-3.5 pt-1">
        <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden p-0.5">
          <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-[#00D084] via-[#0A84FF] to-[#5E5CE6] animate-pulse" />
        </div>

        <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-700">
          <svg
            className="w-4 h-4 animate-spin text-[#0A84FF] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeOpacity="0.2"
              strokeWidth="3"
            />
            <path
              d="M21 12a9 9 0 00-9-9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <span className="inline-flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-500 fill-current shrink-0" />
            {badgeText}
          </span>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-400">
          <span>Connect Phone</span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-600 font-bold">$10 in 3 Mins</span>
          <span aria-hidden="true">·</span>
          <span>118+ Banks</span>
        </div>
      </div>
    </div>
  );

  if (variant === 'overlay') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-md flex items-center justify-center p-5"
      >
        {innerCard}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-[420px] w-full rounded-[32px] bg-gradient-to-br from-sky-50/90 via-indigo-50/70 to-emerald-50/90 border border-indigo-100/80 flex items-center justify-center p-6"
      >
        {innerCard}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen w-full bg-[#F2F4F9] relative overflow-hidden flex flex-col items-center justify-center p-6"
    >
      <div className="pointer-events-none absolute -top-24 -left-20 w-80 h-80 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-24 w-80 h-80 rounded-full bg-indigo-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 w-80 h-80 rounded-full bg-emerald-400/20 blur-3xl" />

      <div className="relative z-10 w-full flex flex-col items-center">{innerCard}</div>
    </div>
  );
};
