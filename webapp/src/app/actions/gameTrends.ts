'use server'

import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

// Parse status.xml to get the game name mapping (fallback to XML/DB if needed)
import { XMLParser } from 'fast-xml-parser';

export async function getMonthlyGameTrends() {
    try {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const history = await prisma.playerHistory.findMany({
            where: {
                joinedAt: {
                    gte: firstDayOfMonth
                }
            }
        });

        // Group by game
        const gameStats: Record<string, { totalSeconds: number, uniqueMacs: Set<string>, name: string }> = {};

        history.forEach(session => {
            if (!session.leftAt) return; // Ignore ongoing sessions that haven't finished, or we can use `now` for ongoing
            const leftAt = session.leftAt ? new Date(session.leftAt).getTime() : Date.now();
            const joinedAt = new Date(session.joinedAt).getTime();
            const durationSeconds = Math.floor((leftAt - joinedAt) / 1000);

            // Ignore negative or unreasonable durations
            if (durationSeconds < 0 || durationSeconds > 86400 * 30) return;

            const gameId = session.game; // This is actually the game name or ID stored in DB. Wait, the C server stores `safegamestr` which is the game ID. But wait! The C server uses `safegamestr` which could be ID, but it also has `find_cached_gamename`. Let's see what is saved in DB. It saves `safegamestr` (the product ID).

            if (!gameStats[gameId]) {
                gameStats[gameId] = {
                    totalSeconds: 0,
                    uniqueMacs: new Set(),
                    name: gameId
                };
            }

            gameStats[gameId].totalSeconds += durationSeconds;
            gameStats[gameId].uniqueMacs.add(session.mac);
        });

        // Fetch product names for mapping using raw query since it's @@ignore
        const productIds = await prisma.$queryRaw<Array<{id: string, name: string}>>`SELECT id, name FROM productids`;
        const productMap = new Map(productIds.map(p => [p.id, p.name]));

        const trends = Object.values(gameStats).map(stat => {
            const usercount = stat.uniqueMacs.size;
            // Simple trend score: Total Playtime * (log10(Unique Users + 1))
            // This favors games that are played longer by more people.
            const score = stat.totalSeconds * Math.max(1, Math.log10(usercount + 1));
            const realName = productMap.get(stat.name) || stat.name;

            return {
                id: stat.name,
                name: realName, 
                usercount: usercount,
                totalSeconds: stat.totalSeconds,
                score: score
            };
        });

        // Sort by highest score
        trends.sort((a, b) => b.score - a.score);

        return { success: true, trends: trends.slice(0, 5) };
    } catch (error: any) {
        console.error('Error getting game trends:', error);
        return { success: false, error: error.message };
    }
}
