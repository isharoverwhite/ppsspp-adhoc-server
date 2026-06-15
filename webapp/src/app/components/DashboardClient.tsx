'use client';

import { useState, useEffect, useRef } from 'react';
import { getServerStatus } from '../actions/serverStatus';
import { kickPlayer } from '../actions/serverControls';
import { banPlayer } from '../actions/bans';
import { getMonthlyGameTrends } from '../actions/gameTrends';
import anime from 'animejs';
import ChatboxWidget from './ChatboxWidget';

function PieChart({ games }: { games: any[] }) {
  const chartRef = useRef(null);
  
  useEffect(() => {
    // Initial state: empty segments and hidden labels
    anime.set('.pie-segment', { strokeDasharray: '0 1000', opacity: 0 });
    anime.set('.pie-label, .pie-polyline', { opacity: 0, scale: 0.5 });
    anime.set('.chart-container', { scale: 0.8, opacity: 0 });
    
    const tl = anime.timeline({ easing: 'easeOutQuart' });

    tl.add({ 
      targets: '.chart-container', 
      scale: [0.8, 1], 
      opacity: [0, 1], 
      duration: 800 
    })
    .add({
      targets: '.pie-segment',
      // Animating the first value of dasharray (the dash) while keeping total (C) constant
      // We use a proxy object to handle the string formatting correctly
      strokeDasharray: (el: any) => {
        const val = el.getAttribute('data-value');
        const c = el.getAttribute('data-c');
        return [`0 ${c}`, `${val} ${c}`];
      },
      opacity: [0, 1],
      duration: 1200,
      delay: anime.stagger(100),
      offset: '-=600'
    })
    .add({
      targets: '.pie-label, .pie-polyline',
      opacity: [0, 1],
      scale: [0.5, 1],
      duration: 600,
      delay: anime.stagger(50),
      offset: '-=800'
    });
  }, [games]);

  const colors = ['#5cc5aa', '#eac59e', '#f07b65', '#f5d44f', '#eda13a'];
  const total = games.reduce((acc: number, curr: any) => acc + curr.usercount, 0);
  let cumulativeOffset = 0;

  // SVG space constants
  const width = 500; 
  const height = 300;
  const cx = width / 2;
  const cy = height / 2;
  const r = 55;
  const strokeWidth = 35;
  const C = 2 * Math.PI * r;

  const labelData = games.map((g, i) => {
    const percent = total > 0 ? (g.usercount / total) * 100 : 0;
    const theta = (cumulativeOffset + percent / 2) / 100 * 2 * Math.PI;
    cumulativeOffset += percent;
    const angle = theta - Math.PI / 2;
    const isRight = Math.cos(angle) >= 0;
    const r_outer = r + strokeWidth / 2;

    return {
      g, i, angle, isRight,
      tx: cx + r * Math.cos(angle),
      ty: cy + r * Math.sin(angle),
      px0: cx + r_outer * Math.cos(angle),
      py0: cy + r_outer * Math.sin(angle),
      px1: cx + (r_outer + 15) * Math.cos(angle),
      py1: cy + (r_outer + 15) * Math.sin(angle),
      // Enforce a minimum width of 2 units for visibility of small sessions
      dashLength: Math.max((percent * C) / 100 - 1.5, 2),
      offset: ((cumulativeOffset - percent) * C) / 100
    };
  });

  // Sort ALL for global collision avoidance
  const sortedLabels = [...labelData].sort((a, b) => a.py1 - b.py1);
  const minGap = 22; 
  for (let i = 1; i < sortedLabels.length; i++) {
    if (sortedLabels[i].py1 < sortedLabels[i-1].py1 + minGap) {
      sortedLabels[i].py1 = sortedLabels[i-1].py1 + minGap;
    }
  }

  return (
    <div className="w-full flex items-center justify-center chart-container" ref={chartRef}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto drop-shadow-xl overflow-visible">
        {/* Draw slices in original order to keep offsets correct */}
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {labelData.map((l) => (
            <circle
              key={`slice-${l.i}`}
              className="pie-segment"
              r={r} cx={cx} cy={cy}
              fill="transparent"
              stroke={colors[l.i % colors.length]}
              strokeWidth={strokeWidth}
              strokeDasharray={`0 ${C}`}
              strokeDashoffset={-l.offset}
              data-value={l.dashLength}
              data-c={C}
            />
          ))}
        </g>
        {/* Draw labels using adjusted coordinates */}
        <g>
          {sortedLabels.map((l) => {
            const px2 = l.isRight ? cx + 130 : cx - 130;
            const textAnchor = l.isRight ? "start" : "end";
            const textX = l.isRight ? px2 + 8 : px2 - 8;
            
            return (
              <g key={`label-${l.i}`}>
                <text x={l.tx} y={l.ty + 2} textAnchor="middle" className="pie-label opacity-0 font-data-md text-[9px] fill-[#222] font-bold pointer-events-none">
                  {l.g.displayValue || l.g.usercount}
                </text>
                <polyline
                  points={`${l.px0},${l.py0} ${l.px1},${l.py1} ${px2},${l.py1}`}
                  fill="none" stroke={colors[l.i % colors.length]} strokeWidth="1.2"
                  className="pie-polyline opacity-0"
                />
                <text x={textX} y={l.py1 + 3} textAnchor={textAnchor} className="pie-label opacity-0 font-data-md text-[11px] fill-on-surface font-bold">
                  {l.g.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export default function DashboardClient() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [chatTab, setChatTab] = useState<'game' | 'public'>('game');
  const [selectedGame, setSelectedGame] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);

  const fetchStatus = async () => {
    const data = await getServerStatus();
    setStatus(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    
    getMonthlyGameTrends().then(trendsData => {
      if (trendsData.success && trendsData.trends) {
        setTrends(trendsData.trends.map((t: any) => ({
          ...t,
          usercount: t.score,
          displayValue: `${Math.floor(t.totalSeconds / 3600)}h${Math.floor((t.totalSeconds % 3600) / 60)}m`
        })));
      }
    });

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="py-20 text-center font-label-caps text-on-surface-variant animate-pulse">Đang tải dữ liệu server...</div>;
  }

  if (!status || !status.isOnline) {
    return (
      <div className="py-20 text-center text-error">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="font-headline-sm">Server Offline hoặc không tìm thấy status.xml</p>
        <p className="text-xs text-on-surface-variant mt-2 font-data-md">{status?.error}</p>
      </div>
    );
  }

  const handleKick = async (mac: string) => {
    if (confirm(`Kick player with MAC: ${mac}?`)) {
      const res: any = await kickPlayer(mac);
      if (res.success) {
        alert('Player kicked successfully.');
        fetchStatus();
      } else {
        alert('Failed to kick player: ' + res.error);
      }
    }
  };

  const handleBan = async (mac: string, ip: string) => {
    const reason = prompt('Enter ban reason:', 'Banned by Admin');
    if (reason !== null) {
      const res: any = await banPlayer(mac, ip, reason);
      if (res.success) {
        alert('Player banned successfully.');
        fetchStatus();
      } else {
        alert('Failed to ban player: ' + res.error);
      }
    }
  };

  return (
    <>
      {selectedGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-container rounded-2xl border border-outline-variant w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in">
            <div className="flex justify-between items-center p-6 border-b border-outline-variant/30">
              <div>
                <h2 className="font-display-sm text-2xl font-bold text-on-surface">{selectedGame.name}</h2>
                <span className="font-label-caps text-xs text-primary-fixed-dim bg-primary/10 px-2 py-1 rounded mt-2 inline-block">
                  {selectedGame.usercount} ACTIVE PLAYERS
                </span>
              </div>
              <button 
                onClick={() => setSelectedGame(null)}
                className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center hover:bg-error/20 hover:text-error transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-surface/50">
              {selectedGame.groups.map((grp: any, i: number) => (
                <div key={i} className="mb-8 last:mb-0">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-secondary-fixed-dim">hub</span>
                    <h3 className="font-headline-sm text-on-surface">Room: {grp.name}</h3>
                    <span className="ml-auto font-label-caps text-[10px] text-on-surface-variant">{grp.usercount} / 8</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {grp.users.map((u: any, j: number) => (
                      <div key={j} className="glass-card bg-surface-container-high rounded-xl p-4 border border-outline-variant/50 relative overflow-hidden group hover:border-surface-tint transition-colors">
                        <div className="absolute top-0 left-0 w-1 h-full bg-primary-fixed-dim"></div>
                        <div className="flex items-start justify-between mb-3 pl-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-primary status-pulse"></span>
                            <span className="font-data-lg font-bold text-on-surface text-lg truncate max-w-[120px]">{u.name || u}</span>
                          </div>
                        </div>
                        
                        <div className="pl-2 mb-4 space-y-1">
                          <div className="text-xs text-on-surface-variant font-mono">MAC: {u.mac || 'N/A'}</div>
                          <div className="text-xs text-on-surface-variant font-mono">IP: {u.ip || 'N/A'}</div>
                        </div>
                        
                        <div className="flex gap-2 pl-2">
                          <button 
                            onClick={() => handleKick(u.mac)}
                            className="flex-1 bg-surface-variant hover:bg-secondary-fixed-dim hover:text-on-secondary text-on-surface font-label-caps text-[10px] py-1.5 rounded transition-colors flex items-center justify-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">logout</span>
                            KICK
                          </button>
                          <button 
                            onClick={() => handleBan(u.mac, u.ip)}
                            className="flex-1 bg-error/10 hover:bg-error text-error hover:text-on-error font-label-caps text-[10px] py-1.5 rounded transition-colors flex items-center justify-center gap-1"
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

      <div className="flex flex-wrap gap-stack-md mb-stack-lg bg-surface-container-low p-3 rounded-xl border border-outline-variant/50">
        <div className="flex items-center gap-stack-sm px-3">
          <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">Rate Limiting</span>
          <span className="flex items-center gap-1 text-primary-fixed-dim font-bold text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed-dim"></span> ACTIVE
          </span>
        </div>
        <div className="w-px h-4 bg-outline-variant self-center"></div>
        <div className="flex items-center gap-stack-sm px-3">
          <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">Auto-Backup</span>
          <span className="text-secondary-fixed-dim font-bold text-xs uppercase tracking-tight">ACTIVE</span>
        </div>
        <div className="w-px h-4 bg-outline-variant self-center"></div>
        <div className="flex items-center gap-stack-sm px-3">
          <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">Database</span>
          <span className="text-secondary-fixed-dim font-bold text-xs uppercase tracking-tight">CONNECTED</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-stack-lg">
        <div className="col-span-12 grid grid-cols-1 md:grid-cols-4 gap-stack-md">
          <div className="glass-card p-card-padding rounded-xl flex flex-col justify-between h-32 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest text-[9px]">Online Players</span>
              <span className="material-symbols-outlined text-primary-fixed-dim text-lg">group</span>
            </div>
            <div className="flex items-end justify-between">
              <div className="font-data-lg text-[32px] text-primary-fixed-dim leading-none">{status.totalUsers}</div>
              <div className="font-label-caps text-[9px] text-on-surface-variant mb-1 uppercase opacity-60">Connected</div>
            </div>
          </div>
          
          <div className="glass-card p-card-padding rounded-xl flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest text-[9px]">Active Games</span>
              <span className="material-symbols-outlined text-secondary-fixed-dim text-lg">sports_esports</span>
            </div>
            <div className="flex items-end justify-between">
              <div className="font-data-lg text-[32px] text-secondary-fixed-dim leading-none">{status.activeGames}</div>
              <div className="font-label-caps text-[9px] text-on-surface-variant mb-1 uppercase opacity-60">Titles</div>
            </div>
          </div>
          
          <div className="glass-card p-card-padding rounded-xl flex flex-col justify-between h-32 bg-primary/5">
            <div className="flex justify-between items-start">
              <span className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-widest">Usage Today</span>
              <span className="material-symbols-outlined text-primary text-lg">today</span>
            </div>
            <div className="flex items-end justify-between">
              <div className="font-data-lg text-[28px] text-on-surface">
                {Math.floor((status.uptimeSeconds || 0) / 3600)}<span className="text-sm opacity-50 mx-0.5">h</span>
                {Math.floor(((status.uptimeSeconds || 0) % 3600) / 60)}<span className="text-sm opacity-50">m</span>
              </div>
              <div className="font-label-caps text-[9px] text-on-surface-variant mb-1 uppercase opacity-60">Active</div>
            </div>
          </div>

          <div className="glass-card p-card-padding rounded-xl flex flex-col justify-between h-32 border-primary/20">
            <div className="flex justify-between items-start">
              <span className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-widest">Total Playtime</span>
              <span className="material-symbols-outlined text-secondary text-lg">history</span>
            </div>
            <div className="flex items-end justify-between">
              <div className="font-data-lg text-[24px] text-secondary">
                {((status.totalUsageSeconds || 0) / 3600).toFixed(1)}<span className="text-xs opacity-50 ml-1">Hours</span>
              </div>
              <div className="font-label-caps text-[9px] text-on-surface-variant mb-1 uppercase opacity-60">All Time</div>
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-8 grid grid-cols-12 gap-stack-md">
          <div className="col-span-12 md:col-span-6 glass-card p-card-padding rounded-xl relative overflow-hidden min-h-[400px] flex flex-col">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-stack-sm relative z-10 flex justify-between items-center">
              Live Sessions
              <span className="font-label-caps text-[10px] bg-surface-variant px-2 py-1 rounded text-primary-fixed-dim">LIVE</span>
            </h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 relative z-10 mt-4">
              {status.games.length === 0 ? (
                <div className="text-on-surface-variant text-center font-data-md py-10 opacity-50">No active sessions.</div>
              ) : (
                status.games.map((game: any, i: number) => (
                  <button 
                    key={i} 
                    onClick={() => setSelectedGame(game)}
                    className="w-full border border-outline-variant/30 rounded-lg bg-surface-container-low hover:bg-surface-variant/30 transition-colors text-left flex justify-between items-center p-3 group"
                  >
                    <span className="font-data-md text-sm text-on-surface group-hover:text-primary transition-colors">{game.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-label-caps text-[10px] text-primary bg-primary/10 px-2 py-1 rounded">{game.usercount} In-Game</span>
                      <span className="material-symbols-outlined text-on-surface-variant text-sm">open_in_new</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
          
          <div className="col-span-12 md:col-span-6 glass-card p-card-padding rounded-xl flex flex-col items-center justify-center min-h-[400px]">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-stack-lg self-start w-full">Game Trends (This Month)</h3>
            <div className="flex-1 w-full flex items-center justify-center overflow-visible">
              {trends.length === 0 ? (
                <div className="text-on-surface-variant text-xs font-data-md">No trending games yet.</div>
              ) : (
                <PieChart games={trends} />
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-4 flex flex-col gap-stack-md">
          <ChatboxWidget games={status.games || []} />
        </div>
      </div>
    </>
  );
}
