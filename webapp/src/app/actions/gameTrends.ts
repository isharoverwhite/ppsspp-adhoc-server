'use server'

import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

// Parse status.xml to get the game name mapping (fallback to XML/DB if needed)
import { XMLParser } from 'fast-xml-parser';

export async function getMonthlyGameTrends() {
    try {
        const now = new Date();
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const history = await prisma.playerHistory.findMany({
            where: {
                joinedAt: {
                    gte: last30Days
                }
            }
        });

        if (!history || history.length === 0) {
            return { success: true, trends: [] };
        }

        // Group by game
        const gameStats: Record<string, { totalSeconds: number, uniqueMacs: Set<string>, name: string }> = {};

        history.forEach(session => {
            const leftAt = session.leftAt ? new Date(session.leftAt).getTime() : Date.now();
            const joinedAt = new Date(session.joinedAt).getTime();
            const durationSeconds = Math.floor((leftAt - joinedAt) / 1000);

            // Ignore glitches, cap at 12 hours
            const safeDuration = Math.max(0, Math.min(durationSeconds, 12 * 3600));

            const gameId = session.game;

            if (!gameStats[gameId]) {
                gameStats[gameId] = {
                    totalSeconds: 0,
                    uniqueMacs: new Set(),
                    name: gameId
                };
            }

            gameStats[gameId].totalSeconds += safeDuration;
            gameStats[gameId].uniqueMacs.add(session.mac);
        });

        // Fetch product names for mapping
        const productIds = await prisma.$queryRaw<Array<{id: string, name: string}>>`SELECT id, name FROM productids`;
        const productMap = new Map(productIds.map(p => [p.id, p.name]));

        const trends = Object.values(gameStats).map(stat => {
            const usercount = stat.uniqueMacs.size;
            // score based on time
            const score = stat.totalSeconds;
            const realName = productMap.get(stat.name) || stat.name;

            return {
                id: stat.name,
                name: realName, 
                usercount: usercount,
                totalSeconds: stat.totalSeconds,
                score: score
            };
        });

        // Sort by highest score (time)
        trends.sort((a, b) => b.score - a.score);

        return { success: true, trends: trends.slice(0, 5) };
    } catch (error: any) {
        console.error('Error getting game trends:', error);
        return { success: false, error: error.message };
    }
}
