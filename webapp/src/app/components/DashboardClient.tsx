'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { kickPlayer } from '../actions/serverControls';
import { banPlayer } from '../actions/bans';
import anime from 'animejs';
import ChatboxWidget from './ChatboxWidget';
import ConnectionGuideBanner from './ConnectionGuideBanner';

// Custom colors for Donut slices & progress bars
const PALETTE = [
  { stroke: '#38bdf8', bg: 'bg-sky-500', text: 'text-sky-400', border: 'border-sky-500/30' },
  { stroke: '#818cf8', bg: 'bg-indigo-500', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  { stroke: '#10b981', bg: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  { stroke: '#f59e0b', bg: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500/30' },
  { stroke: '#f43f5e', bg: 'bg-rose-500', text: 'text-rose-400', border: 'border-rose-500/30' },
  { stroke: '#c084fc', bg: 'bg-purple-500', text: 'text-purple-400', border: 'border-purple-500/30' },
];

function ModernDonutChart({ trends }: { trends: any[] }) {
  const chartRef = useRef<SVGSVGElement>(null);
  const prevTrendsHashRef = useRef<string>('');

  // Extract stable hash of data to only trigger animation when actual data changes
  const trendsHash = useMemo(() => {
    return JSON.stringify(trends.map(t => ({ id: t.name, score: t.score, sec: t.totalSeconds })));
  }, [trends]);

  const totalScore = useMemo(() => {
    return trends.reduce((acc, curr) => acc + (curr.score || curr.totalSeconds || 1), 0);
  }, [trends]);

  const totalHours = useMemo(() => {
    const totalSec = trends.reduce((acc, curr) => acc + (curr.totalSeconds || 0), 0);
    return (totalSec / 3600).toFixed(1);
  }, [trends]);

  // SVG Geometry constants
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 78;
  const strokeWidth = 24;
  const C = 2 * Math.PI * r;

  // Calculate slice angles & dashes
  let cumulativePercent = 0;
  const slices = trends.map((item, idx) => {
    const itemScore = item.score || item.totalSeconds || 1;
    const percent = totalScore > 0 ? (itemScore / totalScore) * 100 : 0;
    const dashLength = Math.max((percent * C) / 100 - 2, 2);
    const offset = ((cumulativePercent) * C) / 100;
    cumulativePercent += percent;

    const color = PALETTE[idx % PALETTE.length];

    return {
      ...item,
      idx,
      percent: Math.round(percent),
      dashLength,
      offset,
      color
    };
  });

  useEffect(() => {
    // Only animate when actual data hash has changed!
    if (prevTrendsHashRef.current === trendsHash) return;
    prevTrendsHashRef.current = trendsHash;

    if (!chartRef.current) return;

    anime.set('.donut-slice', { strokeDasharray: '0 1000', opacity: 0 });
    anime.set('.donut-center-info', { scale: 0.8, opacity: 0 });

    const tl = anime.timeline({ easing: 'easeOutQuart' });

    tl.add({
      targets: '.donut-center-info',
      scale: [0.8, 1],
      opacity: [0, 1],
      duration: 600
    })
    .add({
      targets: '.donut-slice',
      strokeDasharray: (el: any) => {
        const val = el.getAttribute('data-dash');
        const c = el.getAttribute('data-c');
        return [`0 ${c}`, `${val} ${c}`];
      },
      opacity: [0, 1],
      duration: 1000,
      delay: anime.stagger(80),
      offset: '-=400'
    });
  }, [trendsHash]);

  if (trends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-2">
        <span className="material-symbols-outlined text-4xl opacity-40">donut_large</span>
        <p className="text-xs font-mono">No game trends recorded for this month.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col xl:flex-row items-center gap-6 w-full py-2">
      {/* Left: Modern SVG Donut with Center HUD */}
      <div className="relative flex-shrink-0 flex items-center justify-center">
        <svg 
          ref={chartRef}
          viewBox={`0 0 ${size} ${size}`} 
          className="w-48 h-48 sm:w-52 sm:h-52 overflow-visible filter drop-shadow-[0_0_20px_rgba(56,189,248,0.15)]"
        >
          {/* Background Track Ring */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="transparent"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={strokeWidth}
          />

          {/* Slices */}
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {slices.map((s) => (
              <circle
                key={`slice-${s.idx}`}
                className="donut-slice transition-all duration-300 hover:opacity-80"
                cx={cx} cy={cy} r={r}
                fill="transparent"
                stroke={s.color.stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={`0 ${C}`}
                strokeDashoffset={-s.offset}
                data-dash={s.dashLength}
                data-c={C}
                strokeLinecap="round"
              />
            ))}
          </g>
        </svg>

        {/* Center Text HUD */}
        <div className="donut-center-info absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-2xl font-black text-white font-mono tracking-tight">{totalHours}h</span>
          <span className="text-[10px] font-mono text-sky-400 uppercase tracking-wider font-semibold">PLAYTIME</span>
          <span className="text-[9px] text-slate-400 font-sans mt-0.5">{trends.length} Titles</span>
        </div>
      </div>

      {/* Right: Clean Game Breakdown List (Zero text overflow) */}
      <div className="flex-1 w-full space-y-2.5 overflow-y-auto max-h-[220px] custom-scrollbar pr-1">
        {slices.map((item) => (
          <div 
            key={item.name}
            className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 hover:border-white/15 transition-all group"
          >
            <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <span className={`w-2.5 h-2.5 rounded-md ${item.color.bg} flex-shrink-0`}></span>
                <span className="font-semibold text-slate-200 truncate group-hover:text-white transition-colors" title={item.name}>
                  {item.name}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 font-mono text-[11px]">
                <span className="text-slate-400">{item.displayValue || `${item.percent}%`}</span>
                <span className={`px-1.5 py-0.2 rounded font-bold ${item.color.text} bg-slate-800/80`}>
                  {item.percent}%
                </span>
              </div>
            </div>

            {/* Mini Progress Bar */}
            <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full ${item.color.bg} rounded-full transition-all duration-500`}
                style={{ width: `${Math.max(item.percent, 3)}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const [status, setStatus] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [selectedGame, setSelectedGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Deep comparison ref to prevent unnecessary state resets
  const lastStateHashRef = useRef<string>('');

  // Connect to Real-time SSE Stream
  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectSSE = () => {
      eventSource = new EventSource('/api/realtime');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.status) {
            const newHash = JSON.stringify({
              users: data.status.totalUsers,
              games: data.status.games?.map((g: any) => ({ name: g.name, count: g.usercount })),
              uptime: Math.floor((data.status.uptimeSeconds || 0) / 60),
              totalUsage: Math.floor((data.status.totalUsageSeconds || 0) / 60)
            });

            if (newHash !== lastStateHashRef.current) {
              lastStateHashRef.current = newHash;
              setStatus(data.status);
            }
          }

          if (data.trends) {
            setTrends(data.trends.map((t: any) => ({
              ...t,
              usercount: t.score,
              displayValue: `${Math.floor(t.totalSeconds / 3600)}h ${Math.floor((t.totalSeconds % 3600) / 60)}m`
            })));
          }

          setLoading(false);
        } catch (e) {
          console.error("SSE parse error", e);
        }
      };

      eventSource.onerror = () => {
        // SSE reconnects automatically
      };
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  if (loading) {
    return (
      <div className="py-32 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-sky-400/20 border-t-sky-400 animate-spin"></div>
        <div className="text-sm font-mono text-slate-400 tracking-wider">CONNECTING REALTIME STREAM...</div>
      </div>
    );
  }

  if (!status || !status.isOnline) {
    return (
      <div className="py-24 text-center max-w-md mx-auto p-8 rounded-2xl glass-card border-rose-500/30">
        <div className="text-5xl mb-4 text-rose-400 animate-pulse">📡</div>
        <h2 className="text-xl font-bold text-white mb-2">Core Ad-Hoc Server Offline</h2>
        <p className="text-xs text-slate-400 font-mono mb-4">status.xml / server daemon is unreachable</p>
        <div className="text-xs text-rose-400/80 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 font-mono">
          {status?.error || 'Connection refused on port 27312'}
        </div>
      </div>
    );
  }

  const handleKick = async (mac: string) => {
    if (confirm(`Kick player with MAC: ${mac}?`)) {
      const res: any = await kickPlayer(mac);
      if (!res.success) {
        alert('Failed to kick player: ' + res.error);
      }
    }
  };

  const handleBan = async (mac: string, ip: string) => {
    const reason = prompt('Enter ban reason:', 'Banned by Admin');
    if (reason !== null) {
      const res: any = await banPlayer(mac, ip, reason);
      if (!res.success) {
        alert('Failed to ban player: ' + res.error);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Game Rooms HUD Modal */}
      {selectedGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#0b0f19] rounded-2xl border border-white/15 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-white/10 bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <span className="material-symbols-outlined">sports_esports</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">{selectedGame.name}</h2>
                  <span className="text-[11px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20 inline-block mt-1">
                    {selectedGame.usercount} ACTIVE PLAYERS
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedGame(null)}
                className="w-9 h-9 rounded-xl bg-slate-800/80 border border-white/10 flex items-center justify-center hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30 transition-all text-slate-400 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 bg-[#090d16]/50">
              {selectedGame.groups.map((grp: any, i: number) => (
                <div key={i} className="p-4 rounded-xl bg-slate-900/60 border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-indigo-400 text-[20px]">hub</span>
                      <h3 className="text-sm font-bold text-white font-mono">ROOM: {grp.name}</h3>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 border border-white/10 text-slate-300">
                      {grp.usercount} / 8 Players
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {grp.users.map((u: any, j: number) => (
                      <div key={j} className="glass-card bg-slate-950/70 rounded-xl p-3.5 border border-white/10 relative overflow-hidden group hover:border-sky-500/50 transition-all">
                        <div className="absolute top-0 left-0 w-1 h-full bg-sky-400"></div>
                        <div className="flex items-center justify-between mb-2.5 pl-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 status-pulse"></span>
                            <span className="font-bold text-white text-sm truncate max-w-[130px]">{u.name || u}</span>
                          </div>
                        </div>
                        
                        <div className="pl-2 mb-3 space-y-1 font-mono text-[11px] text-slate-400">
                          <div className="flex justify-between">
                            <span className="text-slate-500">MAC:</span>
                            <span className="text-slate-300">{u.mac || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">IP:</span>
                            <span className="text-slate-300">{u.ip || 'N/A'}</span>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 pl-2">
                          <button 
                            onClick={() => handleKick(u.mac)}
                            className="flex-1 bg-slate-800/80 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/30 border border-white/5 text-slate-300 text-[11px] font-semibold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">logout</span>
                            KICK
                          </button>
                          <button 
                            onClick={() => handleBan(u.mac, u.ip)}
                            className="flex-1 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/20 text-rose-400 text-[11px] font-semibold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">block</span>
                            BAN
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Connection Guide HUD Banner */}
      <ConnectionGuideBanner />

      {/* System Status Indicators Bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl shadow-lg">
        <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs font-mono text-sky-400">
          <span className="w-2 h-2 rounded-full bg-sky-400"></span>
          <span>REALTIME SSE: <strong>ACTIVE</strong></span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>RATE LIMIT: <strong>ACTIVE</strong></span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-mono text-indigo-400">
          <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
          <span>DATABASE: <strong>CONNECTED</strong></span>
        </div>
        <div className="ml-auto hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400 px-3">
          <span>TCP: <strong className="text-white">27312</strong></span>
          <span className="text-slate-600">•</span>
          <span>ADMIN UDP: <strong className="text-white">27313</strong></span>
        </div>
      </div>

      {/* 4 Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Online Players */}
        <div className="glass-card p-5 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/10 rounded-full blur-2xl group-hover:bg-sky-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Online Players</span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <span className="material-symbols-outlined text-[20px]">group</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-white font-mono tracking-tight">{status.totalUsers}</div>
            <div className="text-xs font-mono text-sky-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Connected
            </div>
          </div>
        </div>

        {/* Card 2: Active Games */}
        <div className="glass-card p-5 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Active Games</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <span className="material-symbols-outlined text-[20px]">sports_esports</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-white font-mono tracking-tight">{status.activeGames}</div>
            <div className="text-xs font-mono text-indigo-400">Titles Playing</div>
          </div>
        </div>

        {/* Card 3: Uptime Today */}
        <div className="glass-card p-5 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Uptime Today</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <span className="material-symbols-outlined text-[20px]">timer</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
              {Math.floor((status.uptimeSeconds || 0) / 3600)}<span className="text-lg text-slate-400 font-normal mx-0.5">h</span>
              {Math.floor(((status.uptimeSeconds || 0) % 3600) / 60)}<span className="text-lg text-slate-400 font-normal">m</span>
            </div>
            <div className="text-xs font-mono text-emerald-400">Server Running</div>
          </div>
        </div>

        {/* Card 4: Total Playtime */}
        <div className="glass-card p-5 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">Total Playtime</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <span className="material-symbols-outlined text-[20px]">history</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
              {((status.totalUsageSeconds || 0) / 3600).toFixed(1)}<span className="text-sm text-slate-400 font-normal ml-1">Hours</span>
            </div>
            <div className="text-xs font-mono text-amber-400">All Time Record</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Live Sessions + Redesigned Donut Chart + Chatbox */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column (8 cols): Live Sessions & Redesigned Trends Donut */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
          {/* Redesigned Donut Trends Card */}
          <div className="glass-card p-5 md:p-6 rounded-2xl flex flex-col">
            <div className="flex justify-between items-center w-full mb-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-400 text-[20px]">donut_large</span>
                <h3 className="text-base font-bold text-white font-['Outfit']">Monthly Game Trends</h3>
              </div>
              <span className="text-[10px] font-mono bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 px-2 py-0.5 rounded-full font-bold">
                REALTIME METRICS
              </span>
            </div>

            <ModernDonutChart trends={trends} />
          </div>

          {/* Live Sessions Card */}
          <div className="glass-card p-5 md:p-6 rounded-2xl flex flex-col min-h-[300px]">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sky-400 text-[20px]">meeting_room</span>
                <h3 className="text-base font-bold text-white font-['Outfit']">Live Game Sessions</h3>
              </div>
              <span className="text-[10px] font-mono font-bold bg-sky-500/15 border border-sky-500/30 text-sky-400 px-2 py-0.5 rounded-full">
                {status.games.length} ACTIVE ROOMS
              </span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2.5 max-h-[300px] pr-1">
              {status.games.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 space-y-2">
                  <span className="material-symbols-outlined text-4xl text-slate-600">videogame_asset_off</span>
                  <p className="text-xs font-mono">No active player sessions right now.</p>
                </div>
              ) : (
                status.games.map((game: any, i: number) => (
                  <button 
                    key={i} 
                    onClick={() => setSelectedGame(game)}
                    className="w-full p-3.5 rounded-xl bg-slate-900/70 border border-white/10 hover:border-sky-500/40 hover:bg-slate-800/80 transition-all text-left flex justify-between items-center group cursor-pointer shadow-sm"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 flex-shrink-0 group-hover:scale-105 transition-transform">
                        <span className="material-symbols-outlined text-[18px]">sports_esports</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-200 group-hover:text-sky-300 transition-colors truncate">
                        {game.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
                        {game.usercount} Online
                      </span>
                      <span className="material-symbols-outlined text-slate-500 group-hover:text-sky-400 text-[18px] transition-colors">
                        chevron_right
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Live Realtime Chatbox */}
        <div className="col-span-12 lg:col-span-4 flex flex-col">
          <ChatboxWidget games={status.games || []} />
        </div>
      </div>
    </div>
  );
}
