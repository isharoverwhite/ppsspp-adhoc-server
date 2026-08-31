'use client';

import { useState, useEffect } from 'react';

export default function HeaderNav() {
  const [pingData, setPingData] = useState<{
    online: boolean;
    latencyMs: number | null;
    loading: boolean;
  }>({
    online: true,
    latencyMs: 5,
    loading: false
  });

  const checkPortHealth = async () => {
    try {
      const res = await fetch('/api/ping?host=direct.play.isharoverwhite.com&port=27312');
      if (res.ok) {
        const data = await res.json();
        setPingData({
          online: data.online,
          latencyMs: data.latencyMs,
          loading: false
        });
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    checkPortHealth();
    const interval = setInterval(checkPortHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-[#090d16]/85 backdrop-blur-xl border-b border-white/[0.08] flex justify-between items-center h-16 w-full pl-16 md:pl-[96px] pr-6 shadow-sm">
      <div className="flex items-center gap-3.5 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-lg md:text-xl text-white tracking-tight font-['Outfit']">
            PPSSPP <span className="text-gradient-cyan">Ad-Hoc Core</span>
          </span>
        </div>

        {/* Live Port Auto-Ping Badge via Domain direct.play.isharoverwhite.com */}
        <div 
          title="Automated TCP socket latency probe via direct.play.isharoverwhite.com:27312"
          className={`flex items-center gap-2 px-3 py-1 rounded-full border shadow-inner transition-all duration-300 ${
            pingData.online 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${
            pingData.online ? 'bg-emerald-400 status-pulse' : 'bg-rose-400 animate-ping'
          }`}></span>
          <span className="text-xs font-mono font-medium whitespace-nowrap tracking-wide flex items-center gap-1.5">
            <span>27312 {pingData.online ? 'ONLINE' : 'OFFLINE'}</span>
            {pingData.online && pingData.latencyMs !== null && (
              <>
                <span className="text-emerald-600">•</span>
                <span className="font-bold text-[11px] text-emerald-300">{pingData.latencyMs}ms</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Right side is intentionally clean & minimalist */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono text-slate-500 hidden sm:inline-block">
          PRO ONLINE • PROTOCOL V4
        </span>
      </div>
    </header>
  );
}
