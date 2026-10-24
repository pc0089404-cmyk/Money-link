import React, { useState } from 'react';
import { BoostAppItem } from '../data/boostApps';

interface AppBrandLogoProps {
  app: BoostAppItem;
  size?: 'sm' | 'md' | 'lg';
}

export const AppBrandLogo: React.FC<AppBrandLogoProps> = ({ app, size = 'md' }) => {
  const sources: string[] = [];
  if (app.simpleIconSlug) {
    sources.push(`https://cdn.simpleicons.org/${app.simpleIconSlug}/${app.brandHex}`);
  }
  sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(app.domain)}&sz=128`);
  sources.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(app.domain)}.ico`);

  const [sourceIndex, setSourceIndex] = useState(0);

  const dimClass =
    size === 'sm'
      ? 'w-9 h-9 rounded-xl p-1.5 text-[10px]'
      : size === 'lg'
        ? 'w-13 h-13 rounded-2xl p-2.5 text-xs'
        : 'w-11 h-11 rounded-2xl p-2 text-xs';

  if (sourceIndex >= sources.length) {
    return (
      <div
        className={`${dimClass} flex items-center justify-center font-extrabold text-white shrink-0 shadow-2xs`}
        style={{ backgroundColor: `#${app.brandHex}` }}
      >
        {app.shortTag}
      </div>
    );
  }

  return (
    <div
      className={`${dimClass} bg-white border border-slate-200/80 shadow-2xs flex items-center justify-center overflow-hidden shrink-0`}
    >
      <img
        src={sources[sourceIndex]}
        alt={`${app.name} official logo`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setSourceIndex((prev) => prev + 1)}
        className="w-full h-full object-contain"
      />
    </div>
  );
};
