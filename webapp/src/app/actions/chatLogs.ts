'use server'

import { prisma } from '@/lib/prisma';

export async function getChatLogs() {
    try {
        const messages = await prisma.chatMessage.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        
        // Map Prisma ChatMessage to the format expected by ChatboxWidget
        return messages.map((m) => ({
            id: m.id,
            timestamp: m.createdAt.toISOString().replace('T', ' ').substring(0, 19),
            game: m.game === 'UNKNOWN' ? 'Global' : m.game,
            sender: m.name,
            message: m.message
        })).reverse(); // Newest last, as expected by UI
    } catch (error) {
        console.error("Failed to read chat logs from DB", error);
        return [];
    }
}
