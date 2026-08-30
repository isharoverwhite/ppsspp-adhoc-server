'use client';

import { useState } from 'react';

export default function ConnectionGuideBanner() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const domain = 'direct.play.isharoverwhite.com';

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/90 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl overflow-hidden transition-all duration-300">
      {/* Top Banner Row */}
      <div className="p-3.5 md:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left: Key Connection Info Badges */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {/* Domain Copy Chip */}
          <button
            onClick={() => copyToClipboard(domain, 'Domain')}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/25 hover:border-sky-400/60 hover:bg-sky-500/20 text-sky-300 transition-all cursor-pointer shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px] text-sky-400 group-hover:scale-110 transition-transform">
              {copied === 'Domain' ? 'check_circle' : 'dns'}
            </span>
            <span className="font-mono text-xs font-semibold tracking-wide">
              {domain}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-200 font-sans font-medium uppercase tracking-wider">
              {copied === 'Domain' ? 'Copied!' : 'Copy'}
            </span>
          </button>

          {/* Port Chip */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-300">
            <span className="material-symbols-outlined text-[18px] text-indigo-400">router</span>
            <span className="font-mono text-xs font-semibold">PORT: 27312</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-200 font-mono">TCP</span>
          </div>

          {/* Offset Chip */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
            <span className="material-symbols-outlined text-[18px] text-emerald-400">tune</span>
            <span className="font-mono text-xs font-semibold">OFFSET: 0</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 font-sans">PSP &amp; PPSSPP</span>
          </div>

          {/* Configuration Params Summary */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-white/5 text-xs text-slate-300">
            <span className="text-slate-400">Quick Config:</span>
            <span className="text-emerald-400 font-mono font-medium">WLAN: ON</span> • 
            <span className="text-sky-300 font-mono font-medium">Server: direct.play...</span> • 
            <span className="text-rose-400 font-mono font-medium">Built-in: OFF</span>
          </div>
        </div>

        {/* Right: Quick Action Toggle */}
        <div className="flex items-center gap-2 self-end lg:self-auto">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-sky-500/20 hover:text-sky-300 hover:border-sky-500/40 text-xs font-medium text-slate-300 transition-all border border-white/10 shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-sky-400">
              {isOpen ? 'expand_less' : 'help'}
            </span>
            <span>{isOpen ? 'Close Guide' : 'Connection Guide'}</span>
          </button>
        </div>
      </div>

      {/* Expandable Step-by-Step Guide Panel */}
      {isOpen && (
        <div className="px-4 pb-4 pt-3 border-t border-white/[0.08] bg-slate-950/40 animate-fade-in text-xs md:text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            {/* Step 1: PORT & DOMAIN */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-sky-400 font-bold mb-2">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 flex items-center justify-center text-xs font-mono">1</span>
                  <span>Port &amp; Domain Endpoint</span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Default Ad-hoc server port is <strong className="text-sky-300 font-mono">27312</strong> (TCP). Connect directly to our unproxied DDNS domain.
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-white/5 font-mono text-[11px] text-slate-300 break-all flex justify-between items-center">
                <span>{domain}</span>
                <button
                  onClick={() => copyToClipboard(domain, 'Guide Domain')}
                  className="text-sky-400 hover:text-sky-300 ml-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                </button>
              </div>
            </div>

            {/* Step 2: PPSSPP SETUP */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-indigo-400 font-bold mb-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-mono">2</span>
                  <span>PPSSPP Emulator Settings</span>
                </div>
                <ul className="text-slate-400 text-xs space-y-1.5 leading-relaxed">
                  <li>• <span className="text-slate-300 font-medium">Enable networking/WLAN:</span> <span className="text-emerald-400 font-mono">ON</span></li>
                  <li>• <span className="text-slate-300 font-medium">Change PRO ad hoc server:</span> Paste domain above</li>
                  <li>• <span className="text-slate-300 font-medium">Enable built-in PRO server:</span> <span className="text-rose-400 font-mono">OFF</span></li>
                  <li>• <span className="text-slate-300 font-medium">Port offset:</span> <span className="text-indigo-300 font-mono">0</span></li>
                </ul>
              </div>
              <div className="text-[11px] text-amber-300/80 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20">
                ⚠️ Remember to change your MAC address if cloning emulator profiles!
              </div>
            </div>

            {/* Step 3: REAL PSP */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-emerald-400 font-bold mb-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-mono">3</span>
                  <span>Real PSP Hardware (Pro Online Plugin)</span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Open your Memory Stick, edit <code className="text-emerald-300 font-mono bg-slate-950 px-1 py-0.5 rounded">seplugins/server.txt</code> and enter:
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-white/5 font-mono text-[11px] text-emerald-400 break-all">
                {domain}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
