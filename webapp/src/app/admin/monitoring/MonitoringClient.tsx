'use client';

import { useState, useEffect } from "react";
import { Activity, Server, Users, Cpu, MemoryStick as Memory, Globe, RefreshCw, Trash2, Map } from "lucide-react";
import ServerChat from "@/app/components/ServerChat";

export default function MonitoringClient({ snapshots }: { snapshots: any[] }) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-7xl mx-auto">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="font-headline-md text-3xl font-bold text-on-surface mb-2">Infrastructure Monitoring</h2>
          <p className="font-body-sm text-on-surface-variant text-sm opacity-80">Server incident logs, resource spikes, and performance history.</p>
        </div>
      </div>

      <div className="glass-card p-0 rounded-xl relative overflow-hidden flex flex-col">
        <div className="p-card-padding border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
          <h3 className="font-headline-sm text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-error">warning</span>
            Incident Reports & Spikes
          </h3>
          <span className="font-label-caps text-[10px] text-on-surface-variant bg-surface-variant px-2 py-1 rounded">THRESHOLDS: CPU 80%, RAM 80%, PLY 50</span>
        </div>

        <div className="p-card-padding">
          {(!snapshots || snapshots.length === 0) ? (
            <div className="py-16 text-center text-on-surface-variant font-data-md text-sm">
              <span className="material-symbols-outlined block text-5xl mb-4 opacity-50">check_circle</span>
              No incidents recorded recently.<br/>System is stable and operating within normal parameters.
            </div>
          ) : (
            <div className="space-y-4">
              {snapshots.map((snap) => {
                const time = new Date(snap.timestamp).toLocaleString();
                let detailsObj = null;
                try { detailsObj = JSON.parse(snap.details || '{}'); } catch(e){}
                
                let icon = 'info';
                let color = 'text-secondary-fixed-dim';
                if (snap.triggerReason === 'HIGH_CPU') { icon = 'memory'; color = 'text-error'; }
                if (snap.triggerReason === 'HIGH_RAM') { icon = 'storage'; color = 'text-error'; }
                if (snap.triggerReason === 'PLAYER_SPIKE') { icon = 'group_add'; color = 'text-primary-fixed-dim'; }
                
                return (
                  <div key={snap.id} className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-5 flex flex-col md:flex-row gap-4 justify-between items-start">
                    <div className="flex gap-4">
                      <div className={`w-12 h-12 rounded-full bg-surface-variant flex items-center justify-center ${color}`}>
                        <span className="material-symbols-outlined text-2xl">{icon}</span>
                      </div>
                      <div>
                        <div className="font-headline-sm text-lg text-on-surface mb-2 flex items-center gap-3">
                          {snap.triggerReason}
                          <span className="font-label-caps text-[10px] text-on-surface-variant px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/30">{time}</span>
                        </div>
                        <div className="font-data-md text-sm text-on-surface-variant flex flex-wrap gap-x-6 gap-y-2">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px] opacity-70">memory</span>
                            CPU: <strong className="text-on-surface">{snap.cpuUsage.toFixed(1)}%</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px] opacity-70">storage</span>
                            RAM: <strong className="text-on-surface">{snap.ramUsage.toFixed(1)}%</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px] opacity-70">group</span>
                            Players: <strong className="text-on-surface">{snap.playerCount}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                    {detailsObj && detailsObj.topGames && detailsObj.topGames.length > 0 && (
                      <div className="bg-surface-container rounded-lg p-3 text-xs w-full md:w-1/3 border border-outline-variant/30">
                        <div className="font-label-caps text-on-surface-variant mb-2">Top Active Games During Incident:</div>
                        <div className="space-y-1.5">
                          {detailsObj.topGames.slice(0, 3).map((g: any, idx: number) => (
                            <div key={idx} className="flex justify-between font-data-md text-on-surface bg-surface-variant/30 px-2 py-1 rounded">
                              <span className="truncate pr-2">{g.name}</span>
                              <span className="text-primary-fixed-dim font-bold">{g.usercount}</span>
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
        {/* Live Chat System */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 lg:col-span-3">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-400" />
                Live Chat System
              </h2>
              <p className="text-sm text-gray-400 mt-1">Real-time global and game-specific chat logs</p>
            </div>
          </div>
          
          <ServerChat />
        </div>
      </div>
    </div>
  );
}
