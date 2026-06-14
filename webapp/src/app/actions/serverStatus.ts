'use server'

import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { prisma } from '@/lib/prisma';

export async function getServerStatus() {
    let xmlContent = '';
    
    try {
        // Fetch from the local C server's new embedded HTTP API
        const response = await fetch('http://127.0.0.1:8080/status', { 
            next: { revalidate: 0 }, // no-cache
            signal: AbortSignal.timeout(2000) // 2 second timeout
        });
        
        if (response.ok) {
            xmlContent = await response.text();
        }
    } catch (e: any) {
        return { error: 'Failed to connect to C Server HTTP API: ' + e.message, isOnline: false };
    }

    if (!xmlContent) {
        return { error: 'Empty response from C Server', isOnline: false };
    }

    try {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_"
        });
        const jsonObj = parser.parse(xmlContent);

        // Normalize output
        const prometheus = jsonObj.prometheus || {};
        const totalUsers = parseInt(prometheus['@_usercount'] || '0');
        
        let gamesRaw = prometheus.game || [];
        if (!Array.isArray(gamesRaw)) {
            gamesRaw = [gamesRaw]; // Handle single game case
        }

        const games = gamesRaw.map((g: any) => {
            let groupsRaw = g.group || [];
            if (!Array.isArray(groupsRaw)) {
                groupsRaw = [groupsRaw];
            }
            
            const groups = groupsRaw.map((grp: any) => {
                let usersRaw = grp.user || [];
                if (!Array.isArray(usersRaw)) {
                    usersRaw = [usersRaw];
                }
                const users = usersRaw.map((u: any) => {
                    if (typeof u === 'string') return { name: u, mac: '', ip: '' };
                    return {
                        name: u['#text'] || '',
                        mac: u['@_mac'] || '',
                        ip: u['@_ip'] || ''
                    };
                });

                return {
                    name: grp['@_name'],
                    usercount: parseInt(grp['@_usercount'] || '0'),
                    users: users
                };
            });

            return {
                id: g['@_id'] || g['@_name'],
                name: g['@_name'],
                usercount: parseInt(g['@_usercount'] || '0'),
                groups: groups
            };
        });

        const activeGames = games.length;
        const totalGroups = games.reduce((acc: number, g: any) => {
            const realGroups = g.groups.filter((grp: any) => grp.name !== 'Groupless');
            return acc + realGroups.length;
        }, 0);

        // Fetch today's active usage seconds
        const todayDateStr = new Date().toISOString().split('T')[0];
        let uptimeSeconds = 0;
        try {
            const dailyStats = await prisma.dailyActiveTime.findUnique({
                where: { date: todayDateStr }
            });
            if (dailyStats) {
                uptimeSeconds = dailyStats.seconds;
            }
        } catch(e) {
            console.error("Failed to fetch daily active time:", e);
        }

        return {
            isOnline: true,
            totalUsers,
            activeGames,
            totalGroups,
            games,
            uptimeSeconds
        };

    } catch (e: any) {
        return { error: 'Failed to parse status.xml: ' + e.message, isOnline: false };
    }
}
