'use client';

import { useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export default function AnalyticsClient({ initialData, initialGeo }: { initialData: any, initialGeo: any[] }) {
  const [data] = useState(initialData);
  const [locations] = useState(initialGeo);

  const retentionPercent = data.retention.total > 0 
    ? Math.round((data.retention.returning / data.retention.total) * 100) 
    : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.2)]">
            <span className="material-symbols-outlined text-[24px]">insights</span>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white font-['Outfit'] tracking-tight">
              Player &amp; Game Analytics
            </h1>
            <p className="text-xs text-slate-400 font-sans">
              Comprehensive telemetry, geographic distribution, and player retention history.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-white/10 text-xs font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-sky-400 status-pulse"></span>
          <span>ANALYTICS ENGINE: <strong>SYNCED</strong></span>
        </div>
      </div>

      {/* 3 Top Metric KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: Total Unique Players */}
        <div className="glass-card p-5 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Total Unique Players</span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <span className="material-symbols-outlined text-[18px]">group</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-white font-mono tracking-tight">{data.retention.total}</div>
            <div className="text-xs font-mono text-sky-400">All-Time Unique MACs</div>
          </div>
        </div>

        {/* Metric 2: Returning Players */}
        <div className="glass-card p-5 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Returning Players</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <span className="material-symbols-outlined text-[18px]">replay</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-white font-mono tracking-tight">{data.retention.returning}</div>
            <div className="text-xs font-mono text-indigo-400">Reconnected Users</div>
          </div>
        </div>

        {/* Metric 3: Retention Rate */}
        <div className="glass-card p-5 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Player Retention Rate</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <span className="material-symbols-outlined text-[18px]">trending_up</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-white font-mono tracking-tight">{retentionPercent}%</div>
            <div className="text-xs font-mono text-emerald-400">Loyalty Ratio</div>
          </div>
        </div>
      </div>

      {/* Middle Section: Global Map + Trending Games */}
      <div className="grid grid-cols-12 gap-6">
        {/* Global Geolocation Map (8 cols) */}
        <div className="col-span-12 lg:col-span-8 glass-card p-5 md:p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden min-h-[420px]">
          <div className="flex justify-between items-center pb-3 mb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sky-400 text-[20px]">public</span>
              <h3 className="text-base font-bold text-white font-['Outfit']">Global Player Distribution</h3>
            </div>
            <span className="text-[10px] font-mono bg-sky-500/10 border border-sky-500/20 text-sky-400 px-2.5 py-0.5 rounded-full font-semibold">
              {locations.length} ACTIVE PINS
            </span>
          </div>

          <div className="w-full flex-1 flex items-center justify-center overflow-hidden py-2">
            <ComposableMap projectionConfig={{ scale: 145 }} width={800} height={400} style={{ width: "100%", height: "auto" }}>
              <Geographies geography={geoUrl}>
                {({ geographies }: { geographies: any[] }) =>
                  geographies.map((geo: any) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="#151e33"
                      stroke="#273553"
                      strokeWidth={0.6}
                      style={{
                        default: { outline: "none" },
                        hover: { fill: "#223152", outline: "none", cursor: "pointer" },
                        pressed: { fill: "#0f172a", outline: "none" }
                      }}
                    />
                  ))
                }
              </Geographies>
              {locations.filter(l => l.lat && l.lon).map((loc, i) => (
                <Marker key={i} coordinates={[loc.lon, loc.lat]}>
                  <circle r={5} fill="#38bdf8" opacity={0.8} />
                  <circle r={10} fill="#38bdf8" opacity={0.25} className="animate-ping" />
                </Marker>
              ))}
            </ComposableMap>
          </div>
          
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-white/5">
            <span>Map projection: Natural Earth (World-110m)</span>
            <span className="flex items-center gap-1 text-sky-400">
              <span className="w-2 h-2 rounded-full bg-sky-400"></span> Connected Peers
            </span>
          </div>
        </div>

        {/* Trending Games Ranking (4 cols) */}
        <div className="col-span-12 lg:col-span-4 glass-card p-5 md:p-6 rounded-2xl flex flex-col min-h-[420px]">
          <div className="flex justify-between items-center pb-3 mb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-[20px]">leaderboard</span>
              <h3 className="text-base font-bold text-white font-['Outfit']">Top Trending Games</h3>
            </div>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
              TOP TITLES
            </span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto custom-scrollbar max-h-[320px] pr-1">
            {data.gameTrend.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500 space-y-2">
                <span className="material-symbols-outlined text-3xl opacity-40">sports_esports</span>
                <p className="text-xs font-mono">No game sessions recorded yet.</p>
              </div>
            ) : (
              data.gameTrend.map((g: any, i: number) => {
                const rankColor = i === 0 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                  : i === 1 
                  ? 'bg-slate-300/20 text-slate-200 border-slate-300/30' 
                  : i === 2 
                  ? 'bg-amber-700/20 text-amber-500 border-amber-700/30' 
                  : 'bg-slate-800 text-slate-400 border-white/5';

                return (
                  <div key={i} className="p-3 rounded-xl bg-slate-900/70 border border-white/5 hover:border-white/15 transition-all flex items-center justify-between gap-3 group">
                    <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs font-bold border flex-shrink-0 ${rankColor}`}>
                        #{i + 1}
                      </span>
                      <span className="font-semibold text-xs text-slate-200 truncate group-hover:text-white transition-colors" title={g.game}>
                        {g.game}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 font-mono text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                      <span>{g.count}</span>
                      <span className="text-[10px] text-sky-300/70">Plays</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Activity History Table */}
      <div className="glass-card p-5 md:p-6 rounded-2xl">
        <div className="flex justify-between items-center pb-4 mb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-400 text-[20px]">history</span>
            <h3 className="text-base font-bold text-white font-['Outfit']">Recent Player Activity History</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Showing last {data.history.length} events
          </span>
        </div>

        <div className="w-full overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                <th className="pb-3 px-3">Timestamp</th>
                <th className="pb-3 px-3">Player Nickname</th>
                <th className="pb-3 px-3">Game Title</th>
                <th className="pb-3 px-3">IP Address</th>
                <th className="pb-3 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-mono">
              {data.history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-mono">
                    No activity history recorded yet.
                  </td>
                </tr>
              ) : (
                data.history.map((h: any) => (
                  <tr key={h.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 text-slate-400 text-[11px]">
                      {new Date(h.joinedAt).toLocaleString('en-US', { hour12: false })}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        {h.name}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-sky-300 font-sans font-medium">
                      {h.game}
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {h.ip ? h.ip.replace(/\.\d+$/, '.***') : 'N/A'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        COMPLETED
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
