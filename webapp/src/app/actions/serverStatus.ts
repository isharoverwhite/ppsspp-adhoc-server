'use server'

import { prisma } from '@/lib/prisma';

export async function getServerStatus() {
    let statusData: any = null;
    
    try {
        // Fetch from the local Go server's JSON HTTP API (running on port 8080 by default inside container)
        const response = await fetch('http://127.0.0.1:8080/api/status', { 
            next: { revalidate: 0 }, // no-cache
            signal: AbortSignal.timeout(2000) // 2 second timeout
        });
        
        if (response.ok) {
            statusData = await response.json();
        } else {
            return { error: `Go Server API returned ${response.status}`, isOnline: false };
        }
    } catch (e: any) {
        return { error: 'Failed to connect to Go Server API: ' + e.message, isOnline: false };
    }

    if (!statusData) {
        return { error: 'Empty response from Go Server', isOnline: false };
    }

    try {
        const totalUsers = statusData.usercount || 0;
        const games = statusData.games || [];
        
        const activeGames = games.length;
        const totalGroups = games.reduce((acc: number, g: any) => {
            const realGroups = (g.groups || []).filter((grp: any) => grp.name !== 'Groupless');
            return acc + realGroups.length;
        }, 0);

        // Fetch analytics from PlayerHistory
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        let uptimeSeconds = 0; // Today's total
        let totalUsageSeconds = 0; // All-time cumulative
        
        try {
            // Get currently online MACs
            const onlineMacs = new Set();
            games.forEach((g: any) => {
                g.groups.forEach((grp: any) => {
                    grp.users.forEach((u: any) => onlineMacs.add(u.mac));
                });
            });

            const allHistory = await prisma.playerHistory.findMany({
                where: {
                    joinedAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } // Limit to 1 year
                }
            });

            // Fetch product names for live list mapping
            const productIds = await prisma.$queryRaw<Array<{id: string, name: string}>>`SELECT id, name FROM productids`;
            const productMap = new Map(productIds.map(p => [p.id, p.name]));

            // Map names in live list if they are just IDs
            games.forEach((g: any) => {
                if (g.name === g.id || !g.name) {
                    const realName = productMap.get(g.id);
                    if (realName) g.name = realName;
                }
            });

            allHistory.forEach((session: any) => {
                const joined = new Date(session.joinedAt).getTime();
                
                let left: number;
                if (session.leftAt === null) {
                    if (onlineMacs.has(session.mac)) {
                        left = Date.now();
                        // Cap active session duration to 4 hours to avoid "fake" large numbers if script hangs
                        if (left - joined > 4 * 3600 * 1000) left = joined + 4 * 3600 * 1000;
                    } else {
                        return; // Skip zombie session
                    }
                } else {
                    left = new Date(session.leftAt).getTime();
                }

                const duration = Math.floor((left - joined) / 1000);
                
                // Reasonable duration check (max 12 hours per session)
                if (duration > 0 && duration < 12 * 3600) {
                    totalUsageSeconds += duration;
                    
                    // Daily portion
                    const start = Math.max(joined, todayStart.getTime());
                    const end = Math.min(left, Date.now());
                    if (end > start) {
                        uptimeSeconds += Math.floor((end - start) / 1000);
                    }
                }
            });
        } catch(e) {
            console.error("Failed to fetch usage time:", e);
        }

        return {
            isOnline: true,
            totalUsers,
            activeGames,
            totalGroups,
            games,
            uptimeSeconds,
            totalUsageSeconds
        };

    } catch (e: any) {
        return { error: 'Failed to parse status JSON: ' + e.message, isOnline: false };
    }
}
