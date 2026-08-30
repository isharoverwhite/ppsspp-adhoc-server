import { getBans } from '@/app/actions/bans';
import { getServerStatus } from '@/app/actions/serverStatus';
import ClientBans from './ClientBans';
import { prisma } from '@/lib/prisma';

export const metadata = {
  title: 'Ban Management | Admin Dashboard',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BansPage() {
  const [bansResult, statusResult] = await Promise.all([
    getBans(),
    getServerStatus(),
  ]);

  let recentHistory: any[] = [];
  try {
    recentHistory = await prisma.playerHistory.findMany({
      orderBy: { joinedAt: 'desc' },
      take: 100,
    });
  } catch (e) {
    console.error("Failed to fetch player history", e);
  }

  // Fetch product names for mapping game codes to human titles
  let productMap = new Map<string, string>();
  try {
    const productIds = await prisma.$queryRaw<Array<{id: string, name: string}>>`SELECT id, name FROM productids`;
    productMap = new Map(productIds.map(p => [p.id, p.name]));
  } catch (e) {
    // ignore
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

  // 2. Map History with real game titles
  const formattedHistory = recentHistory.map((h: any) => ({
    id: h.id,
    mac: h.mac ? h.mac.toUpperCase() : '',
    ip: h.ip || '',
    name: h.name || 'Unknown Player',
    game: productMap.get(h.game) || h.game || 'PSP Title',
    joinedAt: h.joinedAt,
    leftAt: h.leftAt,
  }));

  return (
    <div className="w-full h-full">
      <ClientBans 
        initialBans={rawBans as any[]} 
        onlineUsers={onlineList}
        historyUsers={formattedHistory}
      />
    </div>
  );
}
