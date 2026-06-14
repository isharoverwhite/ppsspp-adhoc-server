import { getBans } from '@/app/actions/bans';
import { getServerStatus } from '@/app/actions/serverStatus';
import ClientBans from './ClientBans';

import { prisma } from '@/lib/prisma';

export const metadata = {
  title: 'Ban Management | Admin Dashboard',
};

export const dynamic = 'force-dynamic';

export default async function BansPage() {
  let recentHistory: any[] = [];
  
  const [bansResult, statusResult] = await Promise.all([
    getBans(),
    getServerStatus(),
  ]);

  try {
    recentHistory = await prisma.playerHistory.findMany({
      orderBy: { joinedAt: 'desc' },
      take: 100,
    });
  } catch (e) {
    console.error("Failed to fetch player history", e);
  }
  
  const bans = bansResult.success ? bansResult.bans : [];
  
  let activeUsers: {name: string, mac: string, ip: string, offline?: boolean}[] = [];
  if (statusResult.isOnline && statusResult.games) {
     statusResult.games.forEach((g: any) => {
         g.groups.forEach((grp: any) => {
             if (grp.users) {
                 activeUsers = activeUsers.concat(grp.users);
             }
         });
     });
  }

  const activeMacs = new Set(activeUsers.map(u => u.mac).filter(Boolean));
  const historyMap = new Map();
  recentHistory.forEach(h => {
    if (h.mac && !activeMacs.has(h.mac) && !historyMap.has(h.mac)) {
      historyMap.set(h.mac, { name: h.name, mac: h.mac, ip: h.ip, offline: true });
    }
  });
  
  const allSelectableUsers = [...activeUsers, ...Array.from(historyMap.values())];

  return (
    <div className="w-full h-full">
      <ClientBans initialBans={bans as any[]} activeUsers={allSelectableUsers} />
    </div>
  );
}
