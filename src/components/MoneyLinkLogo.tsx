import React, { useId } from 'react';

interface MoneyLinkLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<MoneyLinkLogoProps['size']>, string> = {
  sm: 'w-8 h-8 rounded-[9px]',
  md: 'w-11 h-11 rounded-[12px]',
  lg: 'w-16 h-16 rounded-[18px]',
  xl: 'w-20 h-20 rounded-[22px]',
};

export const MoneyLinkLogo: React.FC<MoneyLinkLogoProps> = ({
  size = 'md',
  animated = false,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const bgGradId = `ml-bg-${uid}`;
  const sheenGradId = `ml-sheen-${uid}`;
  const ringGradId = `ml-ring-${uid}`;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none shadow-md shadow-indigo-950/15 ${SIZE_CLASSES[size]} ${
        animated ? 'transition-transform duration-300' : ''
      } ${className}`}
    >
      <svg
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full overflow-hidden rounded-[inherit]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={bgGradId} x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00D084" />
            <stop offset="48%" stopColor="#0A84FF" />
            <stop offset="100%" stopColor="#5E5CE6" />
          </linearGradient>
          <linearGradient id={sheenGradId} x1="40" y1="0" x2="40" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={ringGradId} x1="16" y1="16" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#E0F2FE" stopOpacity="0.92" />
          </linearGradient>
        </defs>

        {/* iOS App Icon Squircle Canvas */}
        <rect width="80" height="80" rx="18" fill={`url(#${bgGradId})`} />

        {/* Subtle Ambient Coral/Gold Glow Corner for Apple Wallet Warmth */}
        <circle cx="66" cy="14" r="22" fill="#38BDF8" fillOpacity="0.35" />
        <circle cx="14" cy="68" r="22" fill="#34D399" fillOpacity="0.32" />

        {/* Top iOS Glass Specular Highlight */}
        <path d="M0 0H80V32C58 40 22 40 0 32V0Z" fill={`url(#${sheenGradId})`} />

        {/* Interlocking Chain Link + Currency Pulse Mark */}
        <path
          d="M32.5 47.5L27.2 52.8C22.9 57.1 15.9 57.1 11.6 52.8C7.3 48.5 7.3 41.5 11.6 37.2L21.2 27.6C25.5 23.3 32.5 23.3 36.8 27.6"
          transform="translate(8 -1) scale(0.84)"
          stroke={`url(#${ringGradId})`}
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        <path
          d="M47.5 32.5L52.8 27.2C57.1 22.9 64.1 22.9 68.4 27.2C72.7 31.5 72.7 38.5 68.4 42.8L58.8 52.4C54.5 56.7 47.5 56.7 43.2 52.4"
          transform="translate(5 12) scale(0.84)"
          stroke={`url(#${ringGradId})`}
          strokeWidth="6.5"
          strokeLinecap="round"
        />

        {/* Center Fast-Connect Bridge + Spark */}
        <path
          d="M30 50L50 30"
          stroke="#FFFFFF"
          strokeWidth="5.8"
          strokeLinecap="round"
        />
        <circle cx="54" cy="26" r="4" fill="#FDE047" />

        {/* Subtle Inner Squircle Rim */}
        <rect
          x="1"
          y="1"
          width="78"
          height="78"
          rx="17"
          stroke="#FFFFFF"
          strokeOpacity="0.28"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
};
