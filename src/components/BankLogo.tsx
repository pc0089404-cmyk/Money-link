import React, { useState } from 'react';
import { NigeriaBank } from '../data/nigeriaBanks';

interface BankLogoProps {
  bank: NigeriaBank;
  size?: 'sm' | 'md' | 'lg';
}

export const BankLogo: React.FC<BankLogoProps> = ({ bank, size = 'md' }) => {
  const sources: string[] = [];
  if (bank.logoSlug) {
    sources.push(`https://nigerianbanks.xyz/logo/${bank.logoSlug}.png`);
  }
  sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(bank.domain)}&sz=128`);
  sources.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(bank.domain)}.ico`);

  const [sourceIndex, setSourceIndex] = useState(0);

  const dimClass =
    size === 'sm'
      ? 'w-8 h-8 rounded-xl p-1 text-[10px]'
      : size === 'lg'
        ? 'w-12 h-12 rounded-2xl p-1.5 text-xs'
        : 'w-10 h-10 rounded-xl p-1.5 text-[11px]';

  if (sourceIndex >= sources.length) {
    return (
      <div
        className={`${dimClass} flex items-center justify-center font-extrabold shrink-0 ${bank.tint}`}
      >
        {bank.shortTag}
      </div>
    );
  }

  return (
    <div
      className={`${dimClass} bg-white border border-slate-200/80 shadow-2xs flex items-center justify-center overflow-hidden shrink-0`}
    >
      <img
        src={sources[sourceIndex]}
        alt={`${bank.name} official logo`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setSourceIndex((prev) => prev + 1)}
        className="w-full h-full object-contain"
      />
    </div>
  );
};
