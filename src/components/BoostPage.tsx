import React, { useEffect, useMemo, useState } from 'react';
import { Check, Play, Search, Wifi, Zap } from 'lucide-react';
import {
  BOOST_APPS,
  BOOST_CATEGORY_LABELS,
  BoostAppCategory,
  formatBoostMultiplierLabel,
} from '../data/boostApps';
import { MAX_BOOST_MULTIPLIER, MICROS_PER_TICK } from '../types';
import { formatUsdMicros } from '../utils/validation';
import { AppBrandLogo } from './AppBrandLogo';

interface BoostPageProps {
  connectedAppIds: string[];
  onToggleApp: (appId: string) => void;
  onConnectMultipleApps: (appIds: string[]) => void;
  onDisconnectAllApps: () => void;
  localConnected: boolean;
  localConnecting: boolean;
  browserOnline: boolean;
  onStartLocalNode: () => Promise<void>;
  activeBoostMultiplier: number;
}

export const BoostPage: React.FC<BoostPageProps> = ({
  connectedAppIds,
  onToggleApp,
  onConnectMultipleApps,
  onDisconnectAllApps,
  localConnected,
  localConnecting,
  browserOnline,
  onStartLocalNode,
  activeBoostMultiplier,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | BoostAppCategory>('all');
  const [tierFilter, setTierFilter] = useState<'all' | '2' | '1' | '0.5' | '0.1'>('all');
  const [liveDataKb, setLiveDataKb] = useState<number>(0);
  const [networkDownlink, setNetworkDownlink] = useState<string>('Online Data');

  const connectedSet = useMemo(() => new Set(connectedAppIds), [connectedAppIds]);

  // Measure real browser network transfer bytes & connection profile
  useEffect(() => {
    const readNetworkStats = () => {
      try {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const totalBytes = entries.reduce(
          (sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 1200),
          0
        );
        setLiveDataKb(Math.max(12, Math.round(totalBytes / 1024)));
      } catch {
        setLiveDataKb(24);
      }

      const nav = navigator as Navigator & {
        connection?: { effectiveType?: string; downlink?: number };
      };
      if (nav.connection) {
        const eff = nav.connection.effectiveType?.toUpperCase() || '4G/LTE';
        const dl = nav.connection.downlink ? `${nav.connection.downlink} Mbps` : '';
        setNetworkDownlink(dl ? `${eff} · ${dl}` : eff);
      }
    };

    readNetworkStats();
    const timer = window.setInterval(readNetworkStats, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredApps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return BOOST_APPS.filter((app) => {
      if (!q && selectedCategory !== 'all' && app.category !== selectedCategory) {
        return false;
      }
      if (tierFilter !== 'all' && String(app.multiplier) !== tierFilter) {
        return false;
      }
      if (!q) return true;
      return (
        app.name.toLowerCase().includes(q) ||
        app.domain.toLowerCase().includes(q) ||
        app.dataProfile.toLowerCase().includes(q) ||
        BOOST_CATEGORY_LABELS[app.category].toLowerCase().includes(q)
      );
    });
  }, [searchQuery, selectedCategory, tierFilter]);

  const boostedTickMicros = Math.round(MICROS_PER_TICK * activeBoostMultiplier);
  const threeMinProjectedMicros = boostedTickMicros * 100; // 100 ticks in 3 minutes

  const handleConnectTopSocial = () => {
    const topIds = [
      'whatsapp',
      'tiktok',
      'instagram',
      'facebook',
      'x_twitter',
      'youtube',
      'telegram',
      'snapchat',
    ];
    onConnectMultipleApps(topIds);
  };

  return (
    <div className="space-y-7">
      {/* Spacious Boost Hero Card */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0F172A] via-[#1E40AF] to-[#059669] text-white p-6 sm:p-8 shadow-lg shadow-slate-900/10 space-y-6">
        <div className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-sky-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-emerald-400/20 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <p className="text-xs font-semibold text-sky-200 tracking-wide">
              App &amp; Social Data Multiplier · {BOOST_APPS.length} Live Apps Available
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-snug">
              Connect your favorite apps &amp; multiply your cash stream as you use data
            </h1>
            <p className="text-sm text-sky-100/90 leading-relaxed">
              Every connected social, video, chat, or browser app adds +0.1x, +0.5x, +1x, or +2x
              to your live earning rate whenever your mobile data or Wi-Fi is active.
            </p>
          </div>

          <div className="bg-white/14 backdrop-blur-md border border-white/15 rounded-2xl p-5 min-w-[230px] space-y-1.5">
            <p className="text-xs text-sky-100 font-medium">Current Active Multiplier</p>
            <p className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums text-amber-300">
              {formatBoostMultiplierLabel(activeBoostMultiplier)}
            </p>
            <p className="text-xs font-mono tabular-nums text-emerald-200 font-semibold">
              +{formatUsdMicros(boostedTickMicros, 2)} / 1.8s ·{' '}
              {formatUsdMicros(threeMinProjectedMicros, 2)} in 3m
            </p>
          </div>
        </div>

        <div className="relative pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-sky-100 font-medium">
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              <Wifi className="w-4 h-4 text-emerald-300" />
              {browserOnline ? networkDownlink : 'Offline'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{liveDataKb.toLocaleString()} KB session data</span>
            <span aria-hidden="true">·</span>
            <span>
              {connectedAppIds.length} {connectedAppIds.length === 1 ? 'app' : 'apps'} connected (max{' '}
              {MAX_BOOST_MULTIPLIER}x)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!localConnected && (
              <button
                type="button"
                disabled={localConnecting || !browserOnline}
                onClick={() => void onStartLocalNode()}
                className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-xs font-extrabold bg-amber-300 text-slate-950 rounded-xl hover:bg-amber-200 active:scale-[0.98] disabled:opacity-50 transition-all whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {localConnecting ? 'Starting...' : 'Start Live Stream'}
              </button>
            )}
            <button
              type="button"
              onClick={handleConnectTopSocial}
              className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold bg-white text-slate-950 rounded-xl hover:bg-sky-50 active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-current" />
              Connect Popular Apps
            </button>
            {connectedAppIds.length > 0 && (
              <button
                type="button"
                onClick={onDisconnectAllApps}
                className="min-h-[42px] px-3.5 py-2 text-xs font-bold text-white/90 bg-white/12 hover:bg-white/20 rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Search & Filter Controls Card */}
      <section className="bg-white border border-slate-200/75 rounded-[28px] p-6 sm:p-8 shadow-[0_8px_30px_rgb(15,23,42,0.04)] space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search any social media or mobile app (WhatsApp, TikTok, Instagram, YouTube, X, Spotify...)"
              className="w-full min-h-[48px] pl-11 pr-4 py-3 text-sm bg-slate-50/80 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]"
            />
          </div>

          {/* Multiplier Tier Filter */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-2xl overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All Tiers' },
                { id: '2', label: '+2x' },
                { id: '1', label: '+1x' },
                { id: '0.5', label: '+0.5x' },
                { id: '0.1', label: '+0.1x' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTierFilter(t.id)}
                className={`min-h-[38px] px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                  tierFilter === t.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(
            [
              { id: 'all', label: `All Apps (${BOOST_APPS.length})` },
              { id: 'social', label: 'Social Media' },
              { id: 'messaging', label: 'Messaging & Calls' },
              { id: 'video', label: 'Video & Streaming' },
              { id: 'music', label: 'Music & Audio' },
              { id: 'browser_shopping', label: 'Browsers & Daily Apps' },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`min-h-[40px] px-4 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === cat.id
                  ? 'bg-[#0A84FF] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Spacious Responsive Grid of All Social Media & Mobile Apps */}
        {filteredApps.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="text-sm font-bold text-slate-900">No app matched &quot;{searchQuery}&quot;</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setTierFilter('all');
              }}
              className="text-xs font-bold text-[#0A84FF] hover:underline"
            >
              Show all {BOOST_APPS.length} apps
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredApps.map((app) => {
              const isConnected = connectedSet.has(app.id);
              return (
                <div
                  key={app.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                    isConnected
                      ? 'bg-emerald-50/45 border-emerald-300/90'
                      : 'bg-slate-50/40 border-slate-200/80 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <AppBrandLogo app={app} size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-slate-900 truncate">{app.name}</p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        <span className="font-mono tabular-nums font-extrabold text-emerald-700">
                          +{formatBoostMultiplierLabel(app.multiplier)}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>{isConnected ? 'Active Data Boost' : app.dataProfile}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleApp(app.id)}
                    className={`min-h-[42px] px-4 py-2 text-xs font-extrabold rounded-xl transition-all active:scale-[0.97] whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                      isConnected
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {isConnected ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Connected
                      </>
                    ) : (
                      'Connect'
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
