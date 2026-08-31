import { getBans } from '@/app/actions/bans';
import { getServerStatus } from '@/app/actions/serverStatus';
import ClientBans from './ClientBans';
import { prisma } from '@/lib/prisma';
import { getProductMap } from '@/lib/products';

export const metadata = {
  title: 'Ban Management | Admin Dashboard',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BansPage() {
  const [bansResult, statusResult, productMap] = await Promise.all([
    getBans(),
    getServerStatus(),
    getProductMap(),
  ]);

  let recentHistory: any[] = [];
  try {
    recentHistory = await prisma.playerHistory.findMany({
      orderBy: { joinedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        mac: true,
        ip: true,
        name: true,
        game: true,
        joinedAt: true,
        leftAt: true,
      }
    });
  } catch (e) {
    console.error("Failed to fetch player history", e);
  }

  const rawBans = bansResult.success ? bansResult.bans : [];

  // 1. Online Users
  const onlineList: any[] = [];
  if (statusResult.isOnline && statusResult.games) {
    statusResult.games.forEach((g: any) => {
      const realGameName = productMap.get(g.name) || g.name;
      g.groups.forEach((grp: any) => {
        if (grp.users) {
          grp.users.forEach((u: any) => {
            onlineList.push({
              name: u.name || 'Unknown Player',
              mac: u.mac ? u.mac.toUpperCase() : '',
              ip: u.ip || '',
              game: realGameName,
              group: grp.name,
              isOnline: true
            });
          });
        }
      });
    });
  }

  // 2. Formatted History Players
  const historyList = recentHistory.map((h) => ({
    id: h.id,
    mac: h.mac ? h.mac.toUpperCase() : '',
    ip: h.ip || '',
    name: h.name || 'Unknown Player',
    game: productMap.get(h.game) || h.game || 'Unknown Game',
    joinedAt: h.joinedAt ? new Date(h.joinedAt) : new Date(),
    leftAt: h.leftAt ? new Date(h.leftAt) : null,
  }));

  return (
    <ClientBans
      initialBans={rawBans}
      onlineUsers={onlineList}
      historyUsers={historyList}
    />
  );
}
