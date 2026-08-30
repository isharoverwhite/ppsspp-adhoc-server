'use client';

import ServerChat from "@/app/components/ServerChat";

export default function MonitoringClient({ snapshots }: { snapshots: any[] }) {
  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.2)]">
            <span className="material-symbols-outlined text-[24px]">memory</span>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white font-['Outfit'] tracking-tight">
              Infrastructure &amp; Resource Health
            </h1>
            <p className="text-xs text-slate-400 font-sans">
              Server incident logs, resource threshold spikes, and performance telemetry.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-white/10 text-xs font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 status-pulse"></span>
          <span>HEALTH MONITOR: <strong>OPTIMAL</strong></span>
        </div>
      </div>

      {/* Incident Reports Card */}
      <div className="glass-card p-5 md:p-6 rounded-2xl flex flex-col">
        <div className="flex justify-between items-center pb-4 mb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-[20px]">warning</span>
            <h3 className="text-base font-bold text-white font-['Outfit']">System Telemetry &amp; Incident Reports</h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-white/5">
            THRESHOLDS: CPU 80% • RAM 80% • PLAYERS 50
          </span>
        </div>

        <div>
          {(!snapshots || snapshots.length === 0) ? (
            <div className="py-16 text-center text-slate-400 font-mono text-xs space-y-2">
              <span className="material-symbols-outlined block text-4xl mb-2 text-emerald-400">verified_user</span>
              <p className="text-slate-300 font-bold text-sm">No incidents or resource spikes recorded.</p>
              <p className="text-slate-500">Core Go daemon is operating within healthy parameters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snap) => {
                const time = new Date(snap.timestamp).toLocaleString('en-US', { hour12: false });
                let detailsObj = null;
                try { detailsObj = JSON.parse(snap.details || '{}'); } catch(e){}
                
                let icon = 'info';
                let color = 'text-sky-400 bg-sky-500/10 border-sky-500/20';
                if (snap.triggerReason === 'HIGH_CPU') { icon = 'memory'; color = 'text-rose-400 bg-rose-500/10 border-rose-500/20'; }
                if (snap.triggerReason === 'HIGH_RAM') { icon = 'storage'; color = 'text-amber-400 bg-amber-500/10 border-amber-500/20'; }
                if (snap.triggerReason === 'PLAYER_SPIKE') { icon = 'group_add'; color = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'; }
                
                return (
                  <div key={snap.id} className="bg-slate-900/60 border border-white/5 rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between items-start">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${color}`}>
                        <span className="material-symbols-outlined text-[20px]">{icon}</span>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white mb-1 flex items-center gap-2.5">
                          <span>{snap.triggerReason}</span>
                          <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-white/5">{time}</span>
                        </div>
                        <div className="text-xs font-mono text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                          <span>CPU: <strong className="text-white">{snap.cpuUsage.toFixed(1)}%</strong></span>
                          <span>RAM: <strong className="text-white">{snap.ramUsage.toFixed(1)}%</strong></span>
                          <span>Players: <strong className="text-white">{snap.playerCount}</strong></span>
                        </div>
                      </div>
                    </div>
                    {detailsObj && detailsObj.topGames && detailsObj.topGames.length > 0 && (
                      <div className="bg-slate-950/80 rounded-xl p-3 text-xs w-full md:w-1/3 border border-white/5">
                        <div className="text-[10px] font-mono text-slate-400 uppercase mb-1.5">Top Games During Spike:</div>
                        <div className="space-y-1 font-mono">
                          {detailsObj.topGames.slice(0, 3).map((g: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-slate-300">
                              <span className="truncate pr-2">{g.name}</span>
                              <span className="text-sky-400 font-bold">{g.usercount}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Global Server Chat Log Section */}
      <div className="glass-card p-5 md:p-6 rounded-2xl">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
          <div>
            <h2 className="text-base font-bold text-white font-['Outfit'] flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400 text-[20px]">forum</span>
              Historical Server Chat Stream
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Persistent chat logs across all channels.</p>
          </div>
        </div>
        
        <ServerChat />
      </div>
    </div>
  );
}
