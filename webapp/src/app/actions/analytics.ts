'use server'

import { prisma } from '@/lib/prisma';

function isPrivateIP(ip?: string | null): boolean {
    if (!ip) return true;
    const clean = ip.trim();
    if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;
    if (clean.startsWith('192.168.') || clean.startsWith('10.') || clean.startsWith('169.254.')) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
    return false;
}

export async function getAnalyticsData() {
    try {
        // 1. History (Filter out local LAN/NAT test connections)
        const allHistory = await prisma.playerHistory.findMany({
            take: 100,
            orderBy: { joinedAt: 'desc' }
        });

        // Filter out private LAN IPs
        const publicHistory = allHistory.filter(h => !isPrivateIP(h.ip)).slice(0, 50);

        // 2. Retention (returning players with public IPs)
        const allPlayers = await prisma.playerHistory.findMany({
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
        
        let totalUnique = macDates.size;
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

        // Fetch product names for mapping
        const productIds = await prisma.$queryRaw<Array<{id: string, name: string}>>`SELECT id, name FROM productids`;
        const productMap = new Map(productIds.map(p => [p.id, p.name]));

        const gameTrend = Array.from(gameCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([gameKey, count]) => ({
                game: productMap.get(gameKey) || gameKey,
                count
            }));

        return { 
            history: publicHistory, 
            retention: { total: totalUnique, returning }, 
            gameTrend 
        };
    } catch (e: any) {
        console.error("Error fetching analytics data", e);
        return { history: [], retention: { total: 0, returning: 0 }, gameTrend: [] };
    }
}

export async function getGeoLocations() {
    try {
        const locations = await prisma.iPLocation.findMany();
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

        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon`, {
            signal: AbortSignal.timeout(3000)
        });
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
        console.error('Failed to resolve IP location for ' + ip, e);
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
