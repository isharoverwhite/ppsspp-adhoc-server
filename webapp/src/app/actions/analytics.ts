'use server'

import { prisma } from '@/lib/prisma';
import { getProductMap } from '@/lib/products';

function isPrivateIP(ip?: string | null): boolean {
    if (!ip) return true;
    const clean = ip.trim();
    if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;
    if (clean.startsWith('192.168.') || clean.startsWith('10.') || clean.startsWith('169.254.')) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
    return false;
}

// In-memory cache for analytics summary (60s TTL)
let cachedAnalytics: { data: any; timestamp: number } | null = null;
const ANALYTICS_TTL = 60 * 1000;

export async function getAnalyticsData() {
    const now = Date.now();
    if (cachedAnalytics && (now - cachedAnalytics.timestamp) < ANALYTICS_TTL) {
        return cachedAnalytics.data;
    }

    try {
        // 1. History (Filter out local LAN/NAT test connections, limit to recent 100)
        const allHistory = await prisma.playerHistory.findMany({
            take: 100,
            orderBy: { joinedAt: 'desc' },
            select: {
                id: true,
                mac: true,
                ip: true,
                name: true,
                game: true,
                joinedAt: true,
                leftAt: true
            }
        });

        // Filter out private LAN IPs
        const publicHistory = allHistory.filter(h => !isPrivateIP(h.ip)).slice(0, 50);

        // 2. Retention (returning players with public IPs from last 90 days)
        const allPlayers = await prisma.playerHistory.findMany({
            where: {
                joinedAt: { gte: new Date(now - 90 * 24 * 60 * 60 * 1000) }
            },
            select: { mac: true, ip: true, joinedAt: true }
        });
        
        const publicPlayers = allPlayers.filter(p => !isPrivateIP(p.ip));
        const macDates = new Map<string, Set<string>>();
        publicPlayers.forEach(p => {
            if (!p.mac) return;
            const dateStr = p.joinedAt ? p.joinedAt.toISOString().split('T')[0] : '';
            if (!macDates.has(p.mac)) {
                macDates.set(p.mac, new Set());
            }
            if (dateStr) {
                macDates.get(p.mac)?.add(dateStr);
            }
        });
        
        const totalUnique = macDates.size;
        let returning = 0;
        macDates.forEach(dates => {
            if (dates.size > 1) returning++;
        });

        // 3. Game Trend (based on public history)
        const gameCounts = new Map<string, number>();
        publicHistory.forEach(h => {
            if (!h.game) return;
            gameCounts.set(h.game, (gameCounts.get(h.game) || 0) + 1);
        });

        const productMap = await getProductMap();

        const gameTrend = Array.from(gameCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([gameKey, count]) => ({
                game: productMap.get(gameKey) || gameKey,
                count
            }));

        const result = { 
            history: publicHistory, 
            retention: { total: totalUnique, returning }, 
            gameTrend 
        };

        cachedAnalytics = { data: result, timestamp: now };
        return result;
    } catch (e: any) {
        console.error("Error fetching analytics data", e);
        return { history: [], retention: { total: 0, returning: 0 }, gameTrend: [] };
    }
}

export async function getGeoLocations() {
    try {
        const locations = await prisma.iPLocation.findMany({
            take: 200,
            orderBy: { updatedAt: 'desc' }
        });
        // Return only public geo locations
        return locations.filter(l => !isPrivateIP(l.ip));
    } catch (e: any) {
        console.error("Error fetching geo locations", e);
        return [];
    }
}

export async function resolveIPLocation(ip: string) {
    if (!ip || isPrivateIP(ip)) {
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

        // Fetch from ip-api.com
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.status !== 'success') return null;

        return await prisma.iPLocation.upsert({
            where: { ip },
            create: {
                ip,
                country: data.country,
                city: data.city,
                lat: data.lat,
                lon: data.lon,
            },
            update: {
                country: data.country,
                city: data.city,
                lat: data.lat,
                lon: data.lon,
            }
        });
    } catch (e) {
        return null;
    }
}

export async function getPerformanceSnapshots(limit = 50) {
    try {
        const snapshots = await prisma.performanceSnapshot.findMany({
            take: limit,
            orderBy: { timestamp: 'desc' },
        });
        return { success: true, snapshots };
    } catch (error: any) {
        console.error('Failed to fetch performance snapshots:', error);
        return { success: false, snapshots: [] };
    }
}
