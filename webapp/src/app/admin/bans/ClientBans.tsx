'use client';

import { useState, useTransition } from 'react';
import { createBan, deleteBan } from '@/app/actions/bans';

export default function ClientBans({ initialBans, activeUsers = [] }: { initialBans: any[], activeUsers?: any[] }) {
  const [inputMode, setInputMode] = useState<'select' | 'manual'>('select');
  const [selectedUser, setSelectedUser] = useState('');
  
  const [ip, setIp] = useState('');
  const [mac, setMac] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [bans, setBans] = useState(initialBans);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let finalIp = ip;
    let finalMac = mac;

    if (inputMode === 'select') {
      if (!selectedUser) {
        setError('Please select a player to ban');
        return;
      }
      const user = activeUsers.find(u => u.mac === selectedUser || u.name === selectedUser);
      if (user) {
         finalIp = user.ip || '';
         finalMac = user.mac || '';
      } else {
         finalMac = selectedUser; // Fallback
      }
    }

    if (!finalIp && !finalMac) {
      setError('Must provide either IP or MAC address');
      return;
    }

    const formData = new FormData();
    if (ip) formData.append('ip', ip);
    if (mac) formData.append('mac', mac);
    formData.append('reason', reason);

    startTransition(async () => {
      const result = await createBan(formData);
      if (!result.success) {
        setError(result.error as string);
      } else {
        setIp('');
        setMac('');
        setReason('');
        // We do a manual update here because we don't want to refresh the whole page
        if (result.ban) {
           setBans([result.ban, ...bans]);
        }
      }
    });
  };

  const handleDelete = (id: number) => {
    startTransition(async () => {
      const result = await deleteBan(id);
      if (result.success) {
        setBans(bans.filter((b) => b.id !== id));
      } else {
        alert(result.error);
      }
    });
  };

  return (
    <div className="w-full max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-stack-sm mb-stack-lg">
        <span className="material-symbols-outlined text-error text-3xl">gavel</span>
        <h1 className="font-display-lg text-3xl font-bold text-on-surface tracking-tight">Ban Management</h1>
      </div>

      <form onSubmit={handleSubmit} className="glass-card p-card-padding rounded-xl mb-stack-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-error"></div>
        <h2 className="font-headline-sm text-xl font-semibold mb-4 text-on-surface pl-2">Add New Ban</h2>
        {error && <div className="bg-error/10 border border-error/50 text-error p-3 rounded-lg mb-4 text-sm font-data-md">{error}</div>}
        
        <div className="flex bg-surface-container-low rounded-lg p-1 mb-6 border border-outline-variant/50 pl-2 ml-2">
          <button
            type="button"
            onClick={() => setInputMode('select')}
            className={`flex-1 py-2 text-sm font-label-caps rounded-md transition-all ${inputMode === 'select' ? 'bg-error text-on-error shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            SELECT PLAYER
          </button>
          <button
            type="button"
            onClick={() => setInputMode('manual')}
            className={`flex-1 py-2 text-sm font-label-caps rounded-md transition-all ${inputMode === 'manual' ? 'bg-error text-on-error shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            MANUAL IP / MAC
          </button>
        </div>

        <div className="pl-2">
          {inputMode === 'select' ? (
          <div className="mb-4">
              <label className="block text-xs font-label-caps text-on-surface-variant mb-2">Select Player to Ban</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full p-3 bg-surface-container border border-outline-variant focus:border-error rounded-lg text-on-surface outline-none transition-all font-data-md text-sm"
              >
                <option value="" disabled>Select a player...</option>
                {activeUsers.filter(u => !u.offline).length > 0 && (
                  <optgroup label="Online Players">
                    {activeUsers.filter(u => !u.offline).map((u, i) => (
                      <option key={`online-${i}`} value={u.mac || u.name}>
                        🟢 {u.name} {u.mac ? `(${u.mac})` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {activeUsers.filter(u => u.offline).length > 0 && (
                  <optgroup label="Recent Offline Players">
                    {activeUsers.filter(u => u.offline).map((u, i) => (
                      <option key={`offline-${i}`} value={u.mac || u.name}>
                        ⚫ {u.name} {u.mac ? `(${u.mac})` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {activeUsers.length === 0 && (
                  <option value="" disabled>No players available</option>
                )}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-label-caps text-on-surface-variant mb-2">IP Address</label>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  className="w-full p-3 bg-surface-container border border-outline-variant focus:border-error rounded-lg text-on-surface outline-none transition-all font-data-md text-sm"
                  placeholder="e.g. 192.168.1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-label-caps text-on-surface-variant mb-2">MAC Address</label>
                <input
                  type="text"
                  value={mac}
                  onChange={(e) => setMac(e.target.value)}
                  className="w-full p-3 bg-surface-container border border-outline-variant focus:border-error rounded-lg text-on-surface outline-none transition-all font-data-md text-sm"
                  placeholder="e.g. 00:11:22:33:44:55"
                />
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-xs font-label-caps text-on-surface-variant mb-2">Reason</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-3 bg-surface-container border border-outline-variant focus:border-error rounded-lg text-on-surface outline-none transition-all font-data-md text-sm"
              placeholder="e.g. Cheating, Harassment"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="bg-error text-on-error font-label-caps text-sm py-3 px-6 rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">block</span>
            {isPending ? 'PROCESSING...' : 'BAN USER'}
          </button>
        </div>
      </form>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container-low border-b border-outline-variant/50">
              <tr>
                <th className="p-4 font-label-caps text-xs text-on-surface-variant">IP Address</th>
                <th className="p-4 font-label-caps text-xs text-on-surface-variant">MAC Address</th>
                <th className="p-4 font-label-caps text-xs text-on-surface-variant">Reason</th>
                <th className="p-4 font-label-caps text-xs text-on-surface-variant">Date</th>
                <th className="p-4 font-label-caps text-xs text-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {bans.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-on-surface-variant font-data-md text-sm">
                    No bans found.
                  </td>
                </tr>
              ) : (
                bans.map((ban) => (
                  <tr key={ban.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-4 font-data-md text-sm text-on-surface">{ban.ip || '-'}</td>
                    <td className="p-4 font-data-md text-sm text-on-surface">{ban.mac || '-'}</td>
                    <td className="p-4 text-sm text-on-surface">{ban.reason}</td>
                    <td className="p-4 font-data-md text-sm text-on-surface-variant">{new Date(ban.createdAt).toLocaleDateString()}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleDelete(ban.id)}
                        disabled={isPending}
                        className="bg-surface-variant hover:bg-error/10 text-on-surface-variant hover:text-error px-3 py-1.5 rounded text-xs font-label-caps transition-colors disabled:opacity-50 flex items-center gap-1 inline-flex"
                      >
                        <span className="material-symbols-outlined text-[14px]">undo</span>
                        UNBAN
                      </button>
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
