'use server'

import { prisma } from '@/lib/prisma';
import { getProductMap } from '@/lib/products';

// In-memory cache for game trends
let cachedGameTrends: { trends: any[]; timestamp: number } | null = null;
const TRENDS_CACHE_TTL = 30 * 1000; // 30 seconds

export async function getMonthlyGameTrends() {
    const now = Date.now();
    if (cachedGameTrends && (now - cachedGameTrends.timestamp) < TRENDS_CACHE_TTL) {
        return { success: true, trends: cachedGameTrends.trends };
    }

    try {
        const last30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);

        const history = await prisma.playerHistory.findMany({
            where: {
                joinedAt: { gte: last30Days }
            },
            select: {
                game: true,
                mac: true,
                joinedAt: true,
                leftAt: true
            }
        });

        if (!history || history.length === 0) {
            cachedGameTrends = { trends: [], timestamp: now };
            return { success: true, trends: [] };
        }

        // Group by game
        const gameStats: Record<string, { totalSeconds: number; uniqueMacs: Set<string>; name: string }> = {};

        history.forEach(session => {
            const leftAt = session.leftAt ? new Date(session.leftAt).getTime() : now;
            const joinedAt = new Date(session.joinedAt).getTime();
            const durationSeconds = Math.floor((leftAt - joinedAt) / 1000);

            const safeDuration = Math.max(0, Math.min(durationSeconds, 12 * 3600));
            const gameId = session.game || 'UNKNOWN';

            if (!gameStats[gameId]) {
                gameStats[gameId] = {
                    totalSeconds: 0,
                    uniqueMacs: new Set(),
                    name: gameId
                };
            }

            gameStats[gameId].totalSeconds += safeDuration;
            if (session.mac) {
                gameStats[gameId].uniqueMacs.add(session.mac);
            }
        });

        const productMap = await getProductMap();

        const trends = Object.values(gameStats).map(stat => {
            const usercount = stat.uniqueMacs.size;
            const score = Math.round(stat.totalSeconds / 60) + usercount * 10;
            const realName = productMap.get(stat.name) || stat.name;

            return {
                id: stat.name,
                name: realName,
                totalSeconds: stat.totalSeconds,
                usercount,
                score
            };
        });

        trends.sort((a, b) => b.score - a.score);

        cachedGameTrends = { trends, timestamp: now };
        return { success: true, trends };
    } catch (error) {
        console.error("Failed to calculate monthly game trends:", error);
        return { success: false, trends: [] };
    }
}
