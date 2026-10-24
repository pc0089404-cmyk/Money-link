import React, { useMemo, useState } from 'react';
import { Calendar, Download, Search } from 'lucide-react';
import { EarningEntry, EarningsTimeframe, MICROS_PER_SECOND } from '../types';
import {
  formatDurationSeconds,
  formatUsdMicros,
  getDateBuckets,
} from '../utils/validation';

interface EarningsPageProps {
  earnings: EarningEntry[];
  pendingSeconds: number;
  pendingMicros?: number;
}

interface ChartBucket {
  key: string;
  label: string;
  micros: number;
  seconds: number;
}

export const EarningsPage: React.FC<EarningsPageProps> = ({
  earnings,
  pendingSeconds,
  pendingMicros: passedPendingMicros,
}) => {
  const [timeframe, setTimeframe] = useState<EarningsTimeframe>('daily');
  const [searchTerm, setSearchTerm] = useState('');

  const now = useMemo(() => new Date(), [earnings.length, pendingSeconds]);
  const currentBuckets = getDateBuckets(now);
  const pendingMicros =
    passedPendingMicros !== undefined
      ? passedPendingMicros
      : pendingSeconds * MICROS_PER_SECOND;

  // Compute exact real totals for Daily, Weekly, Monthly, Yearly (all start at $0.0000)
  const summaryByPeriod = useMemo(() => {
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - 6);
    const weekDayKeys = new Set<string>();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      weekDayKeys.add(getDateBuckets(d).dayKey);
    }

    let dailyMicros = pendingMicros;
    let dailySeconds = pendingSeconds;
    let dailyCount = 0;

    let weeklyMicros = pendingMicros;
    let weeklySeconds = pendingSeconds;
    let weeklyCount = 0;

    let monthlyMicros = pendingMicros;
    let monthlySeconds = pendingSeconds;
    let monthlyCount = 0;

    let yearlyMicros = pendingMicros;
    let yearlySeconds = pendingSeconds;
    let yearlyCount = 0;

    for (const entry of earnings) {
      if (entry.dayKey === currentBuckets.dayKey) {
        dailyMicros += entry.amountMicros;
        dailySeconds += entry.secondsOnline;
        dailyCount += 1;
      }
      if (weekDayKeys.has(entry.dayKey)) {
        weeklyMicros += entry.amountMicros;
        weeklySeconds += entry.secondsOnline;
        weeklyCount += 1;
      }
      if (entry.monthKey === currentBuckets.monthKey) {
        monthlyMicros += entry.amountMicros;
        monthlySeconds += entry.secondsOnline;
        monthlyCount += 1;
      }
      if (entry.yearKey === currentBuckets.yearKey) {
        yearlyMicros += entry.amountMicros;
        yearlySeconds += entry.secondsOnline;
        yearlyCount += 1;
      }
    }

    return {
      daily: { micros: dailyMicros, seconds: dailySeconds, count: dailyCount },
      weekly: { micros: weeklyMicros, seconds: weeklySeconds, count: weeklyCount },
      monthly: { micros: monthlyMicros, seconds: monthlySeconds, count: monthlyCount },
      yearly: { micros: yearlyMicros, seconds: yearlySeconds, count: yearlyCount },
    };
  }, [earnings, pendingMicros, pendingSeconds, currentBuckets, now]);

  const chartData: ChartBucket[] = useMemo(() => {
    if (timeframe === 'daily') {
      const map = new Map<string, { micros: number; seconds: number }>();
      for (let h = 0; h < 24; h += 1) {
        const hh = String(h).padStart(2, '0');
        map.set(`${currentBuckets.dayKey}T${hh}`, { micros: 0, seconds: 0 });
      }
      for (const e of earnings) {
        if (e.dayKey === currentBuckets.dayKey && map.has(e.hourKey)) {
          const cur = map.get(e.hourKey)!;
          cur.micros += e.amountMicros;
          cur.seconds += e.secondsOnline;
        }
      }
      if (pendingMicros > 0 && map.has(currentBuckets.hourKey)) {
        const cur = map.get(currentBuckets.hourKey)!;
        cur.micros += pendingMicros;
        cur.seconds += pendingSeconds;
      }
      return Array.from(map.entries()).map(([key, val]) => ({
        key,
        label: `${key.slice(-2)}:00`,
        micros: val.micros,
        seconds: val.seconds,
      }));
    }

    if (timeframe === 'weekly') {
      const buckets: ChartBucket[] = [];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dk = getDateBuckets(d).dayKey;
        let micros = dk === currentBuckets.dayKey ? pendingMicros : 0;
        let seconds = dk === currentBuckets.dayKey ? pendingSeconds : 0;
        for (const e of earnings) {
          if (e.dayKey === dk) {
            micros += e.amountMicros;
            seconds += e.secondsOnline;
          }
        }
        buckets.push({
          key: dk,
          label: `${dayNames[d.getDay()]} ${d.getDate()}`,
          micros,
          seconds,
        });
      }
      return buckets;
    }

    if (timeframe === 'monthly') {
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const buckets: ChartBucket[] = [];
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dk = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        let micros = dk === currentBuckets.dayKey ? pendingMicros : 0;
        let seconds = dk === currentBuckets.dayKey ? pendingSeconds : 0;
        for (const e of earnings) {
          if (e.dayKey === dk) {
            micros += e.amountMicros;
            seconds += e.secondsOnline;
          }
        }
        buckets.push({
          key: dk,
          label: String(day),
          micros,
          seconds,
        });
      }
      return buckets;
    }

    const monthLabels = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const yearStr = currentBuckets.yearKey;
    return monthLabels.map((lbl, idx) => {
      const mk = `${yearStr}-${String(idx + 1).padStart(2, '0')}`;
      let micros = mk === currentBuckets.monthKey ? pendingMicros : 0;
      let seconds = mk === currentBuckets.monthKey ? pendingSeconds : 0;
      for (const e of earnings) {
        if (e.monthKey === mk) {
          micros += e.amountMicros;
          seconds += e.secondsOnline;
        }
      }
      return { key: mk, label: lbl, micros, seconds };
    });
  }, [timeframe, earnings, currentBuckets, now, pendingMicros, pendingSeconds]);

  const maxMicros = useMemo(() => {
    const peak = Math.max(0, ...chartData.map((b) => b.micros));
    return peak > 0 ? peak : 10000;
  }, [chartData]);

  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return earnings.filter((entry) => {
      const inPeriod =
        timeframe === 'daily'
          ? entry.dayKey === currentBuckets.dayKey
          : timeframe === 'monthly'
            ? entry.monthKey === currentBuckets.monthKey
            : timeframe === 'yearly'
              ? entry.yearKey === currentBuckets.yearKey
              : chartData.some((b) => b.key === entry.dayKey);

      if (!inPeriod) return false;
      if (!q) return true;
      return (
        entry.deviceName.toLowerCase().includes(q) ||
        entry.dayKey.toLowerCase().includes(q) ||
        entry.hourKey.toLowerCase().includes(q)
      );
    });
  }, [earnings, timeframe, currentBuckets, chartData, searchTerm]);

  const handleExportCsv = (): void => {
    const header = 'Entry ID,Date Key,Hour Key,Device Name,Online Seconds,Earned USD\n';
    const rows = filteredEntries
      .map(
        (e) =>
          `${e.entryId},${e.dayKey},${e.hourKey},"${e.deviceName.replace(/"/g, '""')}",${
            e.secondsOnline
          },${(e.amountMicros / 1_000_000).toFixed(6)}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `money-link-${timeframe}-earnings.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeSummary = summaryByPeriod[timeframe];

  return (
    <div className="space-y-7">
      {/* Header & Tactile Period Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Live Earnings Tracker
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track your daily, weekly, monthly &amp; yearly cash rewards as they roll in
          </p>
        </div>

        <div className="grid grid-cols-4 p-1 bg-white border border-slate-200/80 rounded-2xl w-full sm:w-auto shadow-2xs">
          {(['daily', 'weekly', 'monthly', 'yearly'] as EarningsTimeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`min-h-[40px] px-4 py-1.5 text-xs font-extrabold rounded-xl capitalize transition-all whitespace-nowrap shrink-0 ${
                timeframe === tf
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Period Summary Cards */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {(
          [
            {
              id: 'daily',
              title: 'Daily Earn',
              sub: currentBuckets.dayKey,
              activeTone: 'from-[#00D084] to-[#059669] text-white',
              idleTone: 'from-emerald-50/90 to-teal-50/70 border-emerald-200/80 text-slate-900',
            },
            {
              id: 'weekly',
              title: 'Weekly Earn',
              sub: 'Last 7 days',
              activeTone: 'from-[#0A84FF] to-[#2563EB] text-white',
              idleTone: 'from-sky-50/90 to-blue-50/70 border-sky-200/80 text-slate-900',
            },
            {
              id: 'monthly',
              title: 'Monthly Earn',
              sub: currentBuckets.monthKey,
              activeTone: 'from-[#5E5CE6] to-[#7C3AED] text-white',
              idleTone: 'from-indigo-50/90 to-violet-50/70 border-indigo-200/80 text-slate-900',
            },
            {
              id: 'yearly',
              title: 'Yearly Earn',
              sub: `Year ${currentBuckets.yearKey}`,
              activeTone: 'from-[#FF9500] to-[#FF2D55] text-white',
              idleTone: 'from-amber-50/90 to-rose-50/70 border-amber-200/80 text-slate-900',
            },
          ] as {
            id: EarningsTimeframe;
            title: string;
            sub: string;
            activeTone: string;
            idleTone: string;
          }[]
        ).map((card) => {
          const data = summaryByPeriod[card.id];
          const selected = timeframe === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setTimeframe(card.id)}
              className={`p-5 rounded-[28px] text-left transition-all active:scale-[0.98] flex flex-col justify-between gap-2.5 bg-gradient-to-br ${
                selected
                  ? `${card.activeTone} shadow-lg shadow-indigo-950/15`
                  : `${card.idleTone} border shadow-2xs`
              }`}
            >
              <span
                className={`text-xs font-extrabold ${
                  selected ? 'text-white/95' : 'text-slate-600'
                }`}
              >
                {card.title}
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums tracking-tight">
                {formatUsdMicros(data.micros, 2)}
              </span>
              <span
                className={`text-[11px] font-mono tabular-nums ${
                  selected ? 'text-white/90' : 'text-slate-500'
                }`}
              >
                {formatDurationSeconds(data.seconds)} · {card.sub}
              </span>
            </button>
          );
        })}
      </section>

      {/* Bar Chart Card */}
      <section className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 capitalize">
              {timeframe} Real Activity Chart
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              Total {formatUsdMicros(activeSummary.micros, 2)} ·{' '}
              {formatDurationSeconds(activeSummary.seconds)} active · {activeSummary.count} drops
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-emerald-700 font-bold">
            Peak: {formatUsdMicros(Math.max(0, ...chartData.map((b) => b.micros)), 2)}
          </span>
        </div>

        <div className="h-48 w-full pt-4 flex items-end gap-1.5 border-b border-slate-100 pb-2">
          {chartData.map((bucket) => {
            const heightPct =
              bucket.micros > 0 ? Math.max(6, Math.round((bucket.micros / maxMicros) * 100)) : 0;
            return (
              <div
                key={bucket.key}
                className="flex-1 h-full flex flex-col justify-end items-center group relative min-w-0"
                title={`${bucket.label}: ${formatUsdMicros(bucket.micros, 4)} (${
                  bucket.seconds
                }s online)`}
              >
                <div className="w-full h-full flex items-end justify-center">
                  <div
                    className={`w-full max-w-[24px] rounded-t-lg transition-opacity ${
                      bucket.micros > 0
                        ? 'bg-gradient-to-t from-emerald-600 to-teal-400 group-hover:opacity-80'
                        : 'bg-slate-100 h-[3px]'
                    }`}
                    style={bucket.micros > 0 ? { height: `${heightPct}%` } : undefined}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
          <span>{chartData[0]?.label}</span>
          <span>{chartData[Math.floor(chartData.length / 2)]?.label}</span>
          <span>{chartData[chartData.length - 1]?.label}</span>
        </div>
      </section>

      {/* Verified Interval Tap List */}
      <section className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-slate-900 capitalize">
            {timeframe} Verified Commits
          </h2>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-52">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter device or date..."
                className="w-full min-h-[40px] pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="button"
              disabled={filteredEntries.length === 0}
              onClick={handleExportCsv}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </button>
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center space-y-1.5">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-slate-900">
              $0.00 earned in this {timeframe} view yet
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Tap Connect on your Home screen to watch +$0.10 roll in every 1.8 seconds ($10.00 in
              3 minutes).
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEntries.map((item) => (
              <div
                key={item.entryId}
                className="px-5 py-3.5 min-h-[60px] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{item.deviceName}</p>
                  <p className="text-xs font-mono tabular-nums text-slate-500">
                    {item.createdAt
                      ? item.createdAt.toDate().toLocaleString()
                      : `${item.hourKey}:00`}{' '}
                    · +{item.secondsOnline}s active
                  </p>
                </div>
                <span className="text-sm font-extrabold font-mono tabular-nums text-emerald-700 shrink-0">
                  +{formatUsdMicros(item.amountMicros, 2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
