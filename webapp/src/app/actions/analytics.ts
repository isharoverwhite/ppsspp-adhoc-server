'use server'

import { prisma } from '@/lib/prisma';

export async function getAnalyticsData() {
    try {
        // 1. History
        const history = await prisma.playerHistory.findMany({
            take: 50,
            orderBy: { joinedAt: 'desc' }
        });

        // 2. Retention (returning players)
        const allPlayers = await prisma.playerHistory.findMany({
            select: { mac: true, joinedAt: true }
        });
        
        const macDates = new Map();
        allPlayers.forEach(p => {
            const dateStr = p.joinedAt.toISOString().split('T')[0];
            if (!macDates.has(p.mac)) {
                macDates.set(p.mac, new Set());
            }
            macDates.get(p.mac).add(dateStr);
        });
        
        let totalUnique = macDates.size;
        let returning = 0;
        macDates.forEach(dates => {
            if (dates.size > 1) returning++;
        });

        // 3. Game Trend
        const gameGroups = await prisma.playerHistory.groupBy({
            by: ['game'],
            _count: { game: true },
            orderBy: { _count: { game: 'desc' } },
            take: 10
        });
        const gameTrend = gameGroups.map(g => ({ game: g.game, count: g._count.game }));

        return { history, retention: { total: totalUnique, returning }, gameTrend };
    } catch (e: any) {
        console.error("Error fetching analytics data", e);
        return { history: [], retention: { total: 0, returning: 0 }, gameTrend: [] };
    }
}

export async function getGeoLocations() {
    try {
        const locations = await prisma.iPLocation.findMany();
        return locations;
    } catch (e: any) {
        console.error("Error fetching geo locations", e);
        return [];
    }
}

export async function resolveIPLocation(ip: string) {
    if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return null;
    }
    
    try {
        const existing = await prisma.iPLocation.findUnique({ where: { ip } });
        if (existing) {
            const age = Date.now() - existing.updatedAt.getTime();
            if (age < 30 * 24 * 60 * 60 * 1000) {
                return existing;
            }
        }

        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'success') {
                const loc = await prisma.iPLocation.upsert({
                    where: { ip },
                    update: { country: data.country, city: data.city, lat: data.lat, lon: data.lon, updatedAt: new Date() },
                    create: { ip, country: data.country, city: data.city, lat: data.lat, lon: data.lon }
                });
                return loc;
            }
        }
    } catch (e) {
        console.error('Failed to resolve IP', e);
    }
    return null;
}

export async function getPerformanceSnapshots(limit: number = 50) {
    try {
        const snapshots = await prisma.performanceSnapshot.findMany({
            take: limit,
            orderBy: { timestamp: 'desc' }
        });
        return { success: true, snapshots };
    } catch (e: any) {
        console.error("Error fetching performance snapshots", e);
        return { success: false, error: e.message };
    }
}
