'use client';

import { useState, useTransition, useMemo } from 'react';
import { createBan, deleteBan, banPlayer, unbanByMacOrIp } from '@/app/actions/bans';

interface BanItem {
  id: number;
  ip?: string | null;
  mac?: string | null;
  reason: string;
  createdAt: string | Date;
}

interface OnlinePlayer {
  name: string;
  mac: string;
  ip: string;
  game?: string;
  group?: string;
  isOnline: boolean;
}

interface HistoryPlayer {
  id: number;
  mac: string;
  ip: string;
  name: string;
  game?: string;
  joinedAt: string | Date;
  leftAt?: string | Date | null;
}

interface UnifiedUserRow {
  key: string;
  name: string;
  mac: string;
  ip: string;
  status: 'online' | 'offline' | 'banned';
  banId?: number;
  banReason?: string;
  bannedAt?: string | Date;
  lastGame?: string;
  lastSeen?: string | Date;
}

export default function ClientBans({
  initialBans = [],
  onlineUsers = [],
  historyUsers = [],
}: {
  initialBans?: BanItem[];
  onlineUsers?: OnlinePlayer[];
  historyUsers?: HistoryPlayer[];
}) {
  const [bans, setBans] = useState<BanItem[]>(initialBans);
  const [filterTab, setFilterTab] = useState<'all' | 'online' | 'offline' | 'banned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  // Ban Modal state
  const [banModalTarget, setBanModalTarget] = useState<UnifiedUserRow | null>(null);
  const [banReasonInput, setBanReasonInput] = useState('Banned by Admin');

  // Manual Ban Modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualMac, setManualMac] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [manualError, setManualError] = useState('');

  // Unify and deduplicate all users into one unified list
  const unifiedUsers = useMemo(() => {
    const list: UnifiedUserRow[] = [];
    const seenMacs = new Set<string>();
    const seenIps = new Set<string>();

    // Fast lookup maps for active bans
    const bannedMacMap = new Map<string, BanItem>();
    const bannedIpMap = new Map<string, BanItem>();
    bans.forEach((b) => {
      if (b.mac) bannedMacMap.set(b.mac.toUpperCase(), b);
      if (b.ip) bannedIpMap.set(b.ip.trim(), b);
    });

    const usedBanIds = new Set<number>();

    // 1. Process Online Players
    onlineUsers.forEach((u) => {
      const macUpper = u.mac ? u.mac.toUpperCase() : '';
      const ipTrim = u.ip ? u.ip.trim() : '';
      const matchingBan = (macUpper && bannedMacMap.get(macUpper)) || (ipTrim && bannedIpMap.get(ipTrim));

      if (macUpper) seenMacs.add(macUpper);
      if (ipTrim) seenIps.add(ipTrim);

      if (matchingBan) {
        usedBanIds.add(matchingBan.id);
        list.push({
          key: `online-${macUpper || ipTrim || u.name}`,
          name: u.name,
          mac: macUpper,
          ip: ipTrim,
          status: 'banned',
          banId: matchingBan.id,
          banReason: matchingBan.reason,
          bannedAt: matchingBan.createdAt,
          lastGame: u.game,
        });
      } else {
        list.push({
          key: `online-${macUpper || ipTrim || u.name}`,
          name: u.name,
          mac: macUpper,
          ip: ipTrim,
          status: 'online',
          lastGame: u.game,
        });
      }
    });

    // 2. Process History Players (Offline or Banned)
    historyUsers.forEach((h) => {
      const macUpper = h.mac ? h.mac.toUpperCase() : '';
      const ipTrim = h.ip ? h.ip.trim() : '';

      // Skip if already in online list
      if (macUpper && seenMacs.has(macUpper)) return;
      if (!macUpper && ipTrim && seenIps.has(ipTrim)) return;

      if (macUpper) seenMacs.add(macUpper);
      if (ipTrim) seenIps.add(ipTrim);

      const matchingBan = (macUpper && bannedMacMap.get(macUpper)) || (ipTrim && bannedIpMap.get(ipTrim));

      if (matchingBan) {
        usedBanIds.add(matchingBan.id);
        list.push({
          key: `hist-${macUpper || ipTrim || h.id}`,
          name: h.name,
          mac: macUpper,
          ip: ipTrim,
          status: 'banned',
          banId: matchingBan.id,
          banReason: matchingBan.reason,
          bannedAt: matchingBan.createdAt,
          lastGame: h.game,
          lastSeen: h.leftAt || h.joinedAt,
        });
      } else {
        list.push({
          key: `hist-${macUpper || ipTrim || h.id}`,
          name: h.name,
          mac: macUpper,
          ip: ipTrim,
          status: 'offline',
          lastGame: h.game,
          lastSeen: h.leftAt || h.joinedAt,
        });
      }
    });

    // 3. Process remaining Standalone Bans (manual bans without prior session)
    bans.forEach((b) => {
      if (usedBanIds.has(b.id)) return;
      const macUpper = b.mac ? b.mac.toUpperCase() : '';
      const ipTrim = b.ip ? b.ip.trim() : '';

      list.push({
        key: `ban-${b.id}`,
        name: 'Manual Blacklist',
        mac: macUpper,
        ip: ipTrim,
        status: 'banned',
        banId: b.id,
        banReason: b.reason,
        bannedAt: b.createdAt,
      });
    });

    return list;
  }, [bans, onlineUsers, historyUsers]);

  // Filter and search
  const filteredUsers = useMemo(() => {
    return unifiedUsers.filter((u) => {
      // Tab filter
      if (filterTab !== 'all' && u.status !== filterTab) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = u.name.toLowerCase().includes(q);
        const matchMac = u.mac.toLowerCase().includes(q);
        const matchIp = u.ip.toLowerCase().includes(q);
        const matchReason = u.banReason?.toLowerCase().includes(q);
        const matchGame = u.lastGame?.toLowerCase().includes(q);
        if (!matchName && !matchMac && !matchIp && !matchReason && !matchGame) return false;
      }

      return true;
    });
  }, [unifiedUsers, filterTab, searchQuery]);

  // Statistics counts
  const counts = useMemo(() => {
    let online = 0;
    let offline = 0;
    let banned = 0;
    unifiedUsers.forEach((u) => {
      if (u.status === 'online') online++;
      else if (u.status === 'offline') offline++;
      else if (u.status === 'banned') banned++;
    });
    return { total: unifiedUsers.length, online, offline, banned };
  }, [unifiedUsers]);

  // Unban Handler
  const handleUnban = (user: UnifiedUserRow) => {
    if (!confirm(`Unban player "${user.name}" (${user.mac || user.ip})?`)) return;

    startTransition(async () => {
      let res: any;
      if (user.banId) {
        res = await deleteBan(user.banId);
      } else {
        res = await unbanByMacOrIp(user.mac, user.ip);
      }

      if (res?.success) {
        setBans((prev) => prev.filter((b) => b.id !== user.banId && b.mac !== user.mac && b.ip !== user.ip));
      } else {
        alert('Failed to unban: ' + (res?.error || 'Unknown error'));
      }
    });
  };

  // Trigger Ban Confirmation Modal
  const openBanModal = (user: UnifiedUserRow) => {
    setBanModalTarget(user);
    setBanReasonInput('Banned by Admin');
  };

  // Submit Ban from Modal
  const submitBanModal = () => {
    if (!banModalTarget) return;

    startTransition(async () => {
      const res: any = await banPlayer(banModalTarget.mac, banModalTarget.ip, banReasonInput);
      if (res?.success) {
        if (res.ban) {
          setBans((prev) => [res.ban, ...prev]);
        }
        setBanModalTarget(null);
      } else {
        alert('Failed to ban player: ' + res?.error);
      }
    });
  };

  // Submit Manual Custom Ban
  const handleManualBanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError('');

    if (!manualIp && !manualMac) {
      setManualError('Please provide at least an IP or MAC address.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      if (manualIp) formData.append('ip', manualIp);
      if (manualMac) formData.append('mac', manualMac);
      formData.append('reason', manualReason || 'Banned by Admin');

      const res = await createBan(formData);
      if (res.success && res.ban) {
        setBans((prev) => [res.ban, ...prev]);
        setManualIp('');
        setManualMac('');
        setManualReason('');
        setShowManualModal(false);
      } else {
        setManualError(res.error || 'Failed to create ban');
      }
    });
  };

  const getAvatarGradient = (name: string) => {
    const gradients = [
      'from-sky-500 to-blue-600',
      'from-indigo-500 to-purple-600',
      'from-emerald-500 to-teal-600',
      'from-amber-500 to-orange-600',
      'from-rose-500 to-pink-600',
    ];
    const idx = (name || 'P').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % gradients.length;
    return gradients[idx];
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-white/10">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.2)] flex-shrink-0">
            <span className="material-symbols-outlined text-[24px]">gavel</span>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white font-['Outfit'] tracking-tight">
              Access Control &amp; Ban Management
            </h1>
            <p className="text-xs text-slate-400 font-sans">
              Monitor active player sessions, offline history, and enforce network blacklist policies.
            </p>
          </div>
        </div>

        {/* Action Button: Manual Ban Modal */}
        <button
          onClick={() => setShowManualModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-lg shadow-rose-500/20 cursor-pointer ml-auto sm:ml-0"
        >
          <span className="material-symbols-outlined text-[16px]">add_moderator</span>
          MANUAL BAN
        </button>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Users */}
        <div className="glass-card p-4 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">Total Catalog</span>
            <span className="material-symbols-outlined text-slate-500 text-[18px]">group</span>
          </div>
          <div className="text-2xl font-black text-white font-mono">{counts.total}</div>
        </div>

        {/* Online (Green dot) */}
        <div className="glass-card p-4 rounded-2xl border border-emerald-500/20 bg-emerald-950/10">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 status-pulse shadow-[0_0_8px_#34d399]"></span>
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">Online</span>
            </div>
            <span className="material-symbols-outlined text-emerald-400 text-[18px]">sports_esports</span>
          </div>
          <div className="text-2xl font-black text-emerald-300 font-mono">{counts.online}</div>
        </div>

        {/* Offline (Dark dot) */}
        <div className="glass-card p-4 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600 border border-slate-500"></span>
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">Offline</span>
            </div>
            <span className="material-symbols-outlined text-slate-500 text-[18px]">history</span>
          </div>
          <div className="text-2xl font-black text-slate-300 font-mono">{counts.offline}</div>
        </div>

        {/* Banned (Red dot) */}
        <div className="glass-card p-4 rounded-2xl border border-rose-500/30 bg-rose-950/15">
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse"></span>
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">Banned</span>
            </div>
            <span className="material-symbols-outlined text-rose-400 text-[18px]">block</span>
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">{counts.banned}</div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-2xl border border-white/10 backdrop-blur-xl">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 no-scrollbar">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterTab === 'all'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            All ({counts.total})
          </button>
          <button
            onClick={() => setFilterTab('online')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterTab === 'online'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-900/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Online ({counts.online})
          </button>
          <button
            onClick={() => setFilterTab('offline')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterTab === 'offline'
                ? 'bg-slate-800 text-slate-200 border border-slate-600 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-slate-600 border border-slate-500"></span>
            Offline ({counts.offline})
          </button>
          <button
            onClick={() => setFilterTab('banned')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterTab === 'banned'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'text-slate-400 hover:text-rose-300 hover:bg-slate-900/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            Banned ({counts.banned})
          </button>
        </div>

        {/* Realtime Search Input */}
        <div className="relative w-full sm:w-64">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-500 text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search name, IP, MAC..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/90 border border-white/10 focus:border-sky-500/50 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white outline-none placeholder:text-slate-600 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Adaptive Responsive Table / Rows Section */}
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        {filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-slate-500 font-mono flex flex-col items-center justify-center space-y-2">
            <span className="material-symbols-outlined text-4xl text-slate-600">person_off</span>
            <p className="text-xs">No matching user records found.</p>
          </div>
        ) : (
          <>
            {/* A. Desktop Table View (visible on lg and above) */}
            <div className="hidden lg:block w-full overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-950/70 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4 font-semibold">Player</th>
                    <th className="py-3.5 px-4 font-semibold">Network Identity (IP / MAC)</th>
                    <th className="py-3.5 px-4 font-semibold">Activity &amp; Notes</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs font-mono">
                  {filteredUsers.map((user) => {
                    const isBanned = user.status === 'banned';
                    const isOnline = user.status === 'online';

                    return (
                      <tr
                        key={user.key}
                        className={`transition-colors duration-150 group ${
                          isBanned
                            ? 'bg-rose-950/10 hover:bg-rose-950/20'
                            : isOnline
                            ? 'bg-emerald-950/5 hover:bg-slate-800/60'
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        {/* 1. Player Info */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-xl bg-gradient-to-br ${getAvatarGradient(
                                user.name
                              )} flex items-center justify-center text-white text-[11px] font-bold shadow-sm flex-shrink-0`}
                            >
                              {(user.name || 'P').substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-white text-sm tracking-tight truncate max-w-[160px]">
                                {user.name}
                              </span>
                              {user.lastGame && (
                                <span className="text-[10px] text-slate-400 truncate max-w-[160px]">
                                  {user.lastGame}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 2. Network Identity (with left status dot: Green, Black, Red) */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {/* Exact Status Dot: Only color, no text explanation */}
                            <div className="flex items-center justify-center flex-shrink-0" title={user.status}>
                              {isOnline && (
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 status-pulse shadow-[0_0_8px_#34d399] inline-block"></span>
                              )}
                              {user.status === 'offline' && (
                                <span className="w-2.5 h-2.5 rounded-full bg-slate-600 border border-slate-500 inline-block"></span>
                              )}
                              {isBanned && (
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse inline-block"></span>
                              )}
                            </div>

                            {/* IP & MAC addresses */}
                            <div className="flex flex-col space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 text-[10px]">IP:</span>
                                <span className={`font-semibold ${isBanned ? 'text-rose-300' : 'text-slate-200'}`}>
                                  {user.ip || '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500 text-[10px]">MAC:</span>
                                <span className="text-slate-400 font-mono text-[11px]">
                                  {user.mac || '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 3. Activity & Notes */}
                        <td className="py-3.5 px-4">
                          {isBanned ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[11px] font-sans w-fit">
                                <span className="material-symbols-outlined text-[14px]">gavel</span>
                                {user.banReason || 'Banned by Admin'}
                              </span>
                              {user.bannedAt && (
                                <span className="text-[10px] text-slate-500">
                                  {new Date(user.bannedAt).toLocaleString('en-US', { hour12: false })}
                                </span>
                              )}
                            </div>
                          ) : isOnline ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] w-fit">
                              <span className="material-symbols-outlined text-[14px]">hub</span>
                              Active in Session
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {user.lastSeen
                                ? `Last Seen: ${new Date(user.lastSeen).toLocaleDateString('en-US')}`
                                : 'Historical Record'}
                            </span>
                          )}
                        </td>

                        {/* 4. Action Button (Right Side: BAN or UNBAN depending on state) */}
                        <td className="py-3.5 px-4 text-right">
                          {isBanned ? (
                            <button
                              onClick={() => handleUnban(user)}
                              disabled={isPending}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 hover:text-slate-950 active:scale-95 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                              <span className="material-symbols-outlined text-[15px]">lock_open</span>
                              UNBAN
                            </button>
                          ) : (
                            <button
                              onClick={() => openBanModal(user)}
                              disabled={isPending}
                              className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 hover:text-white active:scale-95 border border-rose-500/30 text-rose-400 font-mono text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                              <span className="material-symbols-outlined text-[15px]">block</span>
                              BAN
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* B. Mobile / Tablet Adaptive Row Cards (visible below lg) */}
            <div className="block lg:hidden divide-y divide-white/5">
              {filteredUsers.map((user) => {
                const isBanned = user.status === 'banned';
                const isOnline = user.status === 'online';

                return (
                  <div
                    key={`mobile-${user.key}`}
                    className={`p-4 space-y-3 transition-colors ${
                      isBanned
                        ? 'bg-rose-950/10'
                        : isOnline
                        ? 'bg-emerald-950/5'
                        : 'hover:bg-slate-900/40'
                    }`}
                  >
                    {/* Top Row: Avatar + Name + Action Button */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 overflow-hidden flex-1">
                        <div
                          className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getAvatarGradient(
                            user.name
                          )} flex items-center justify-center text-white text-xs font-bold shadow-sm flex-shrink-0`}
                        >
                          {(user.name || 'P').substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col truncate">
                          <span className="font-bold text-white text-sm tracking-tight truncate">
                            {user.name}
                          </span>
                          {user.lastGame && (
                            <span className="text-[11px] text-slate-400 truncate">
                              {user.lastGame}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Action Button */}
                      <div className="flex-shrink-0">
                        {isBanned ? (
                          <button
                            onClick={() => handleUnban(user)}
                            disabled={isPending}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 hover:text-slate-950 active:scale-95 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">lock_open</span>
                            UNBAN
                          </button>
                        ) : (
                          <button
                            onClick={() => openBanModal(user)}
                            disabled={isPending}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 hover:text-white active:scale-95 border border-rose-500/30 text-rose-400 font-mono text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">block</span>
                            BAN
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Network Identity with Left Status Dot */}
                    <div className="flex items-center gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-white/5 font-mono text-xs">
                      {/* Exact Status Dot: Only color, no text */}
                      <div className="flex items-center justify-center flex-shrink-0 pl-1" title={user.status}>
                        {isOnline && (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 status-pulse shadow-[0_0_8px_#34d399] inline-block"></span>
                        )}
                        {user.status === 'offline' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-600 border border-slate-500 inline-block"></span>
                        )}
                        {isBanned && (
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse inline-block"></span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 text-[10px]">IP:</span>
                          <span className={isBanned ? 'text-rose-300 font-semibold' : 'text-slate-200'}>
                            {user.ip || '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 text-[10px]">MAC:</span>
                          <span className="text-slate-400">
                            {user.mac || '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Ban Reason or Activity */}
                    {isBanned && (
                      <div className="flex items-center gap-1.5 text-[11px] font-sans text-rose-300 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20">
                        <span className="material-symbols-outlined text-[14px]">gavel</span>
                        <span>Reason: {user.banReason || 'Banned by Admin'}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 5. Quick Ban Confirmation Modal */}
      {banModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#0b0f19] rounded-2xl border border-rose-500/30 w-full max-w-md p-6 shadow-[0_0_50px_rgba(244,63,94,0.3)] space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5 text-rose-400">
                <span className="material-symbols-outlined text-[24px]">block</span>
                <h3 className="text-lg font-bold text-white font-['Outfit']">Enforce Player Ban</h3>
              </div>
              <button
                onClick={() => setBanModalTarget(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Target Player:</span>
                <span className="text-white font-bold">{banModalTarget.name}</span>
              </div>
              {banModalTarget.ip && (
                <div className="flex justify-between">
                  <span className="text-slate-400">IP Address:</span>
                  <span className="text-rose-300">{banModalTarget.ip}</span>
                </div>
              )}
              {banModalTarget.mac && (
                <div className="flex justify-between">
                  <span className="text-slate-400">MAC Address:</span>
                  <span className="text-slate-300">{banModalTarget.mac}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase">Ban Reason</label>
              <input
                type="text"
                value={banReasonInput}
                onChange={(e) => setBanReasonInput(e.target.value)}
                placeholder="e.g. Exploiting / Cheating / Toxicity"
                className="w-full p-3 bg-slate-950/90 border border-white/15 focus:border-rose-500 rounded-xl text-white outline-none font-mono text-xs"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setBanModalTarget(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={submitBanModal}
                disabled={isPending}
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-mono text-xs font-bold transition-all shadow-lg shadow-rose-500/25 cursor-pointer disabled:opacity-50"
              >
                {isPending ? 'BANNING...' : 'CONFIRM BAN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Manual Ban Dialog Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <form
            onSubmit={handleManualBanSubmit}
            className="bg-[#0b0f19] rounded-2xl border border-white/15 w-full max-w-lg p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5 text-white">
                <span className="material-symbols-outlined text-rose-400 text-[24px]">add_moderator</span>
                <h3 className="text-lg font-bold font-['Outfit']">Add Manual Blacklist Filter</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {manualError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
                ⚠️ {manualError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase">IP Address</label>
                <input
                  type="text"
                  placeholder="e.g. 14.241.6.27"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  className="w-full p-3 bg-slate-950/90 border border-white/15 focus:border-rose-500 rounded-xl text-white outline-none font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase">MAC Address</label>
                <input
                  type="text"
                  placeholder="e.g. 58:8E:99:CE:97:EC"
                  value={manualMac}
                  onChange={(e) => setManualMac(e.target.value)}
                  className="w-full p-3 bg-slate-950/90 border border-white/15 focus:border-rose-500 rounded-xl text-white outline-none font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase">Ban Reason</label>
              <input
                type="text"
                placeholder="e.g. Cheating / Flooding / Security Policy"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                className="w-full p-3 bg-slate-950/90 border border-white/15 focus:border-rose-500 rounded-xl text-white outline-none font-mono text-xs"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-mono text-xs font-bold transition-all shadow-lg shadow-rose-500/25 cursor-pointer disabled:opacity-50"
              >
                {isPending ? 'SAVING...' : 'ENFORCE BAN'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
