'use server'

import dgram from 'dgram';
import { prisma } from '@/lib/prisma';

const UDP_PORT = 27313;
const HOST = '127.0.0.1';

export async function sendGlobalBroadcast(message: string) {
    if (!message) {
        return { success: false, error: 'Message is empty' };
    }
    
    // Truncate message to 63 chars max as per C server limits
    if (message.length > 63) {
        message = message.substring(0, 63);
    }
    
    return new Promise((resolve) => {
        try {
            const client = dgram.createSocket('udp4');
            // Type 1: Global Broadcast (1 byte), Message (64 bytes)
            const buffer = Buffer.alloc(65);
            buffer.writeUInt8(1, 0); // Type 1
            buffer.write(message, 1, 64, 'ascii'); // Message padded to 64 bytes
            
            client.send(buffer, 0, buffer.length, UDP_PORT, HOST, (err) => {
                client.close();
                if (err) {
                    resolve({ success: false, error: err.message });
                } else {
                    prisma.chatMessage.create({
                        data: {
                            mac: 'SYSTEM',
                            name: 'ADMIN',
                            game: 'GLOBAL',
                            group: 'GLOBAL',
                            message: message
                        }
                    }).then(() => resolve({ success: true }))
                      .catch((dbErr: any) => resolve({ success: false, error: dbErr.message }));
                }
            });
        } catch (error: any) {
            resolve({ success: false, error: error.message });
        }
    });
}

export async function sendGameChat(gameId: string, gameName: string, message: string) {
    if (!message || !gameId) {
        return { success: false, error: 'Message or Game ID is empty' };
    }
    
    // Truncate message to 63 chars max as per C server limits
    if (message.length > 63) {
        message = message.substring(0, 63);
    }
    
    // Truncate gameId to 9 chars
    if (gameId.length > 9) {
        gameId = gameId.substring(0, 9);
    }
    
    return new Promise((resolve) => {
        try {
            const client = dgram.createSocket('udp4');
            // Type 2: Game Broadcast (1 byte), GameID (9 bytes), Message (64 bytes max)
            const buffer = Buffer.alloc(1 + 9 + 64);
            buffer.writeUInt8(2, 0); // Type 2
            buffer.write(gameId, 1, 9, 'ascii'); // Game ID padded to 9 bytes
            buffer.write(message, 10, 64, 'ascii'); // Message padded to 64 bytes
            
            client.send(buffer, 0, buffer.length, UDP_PORT, HOST, (err) => {
                client.close();
                if (err) {
                    resolve({ success: false, error: err.message });
                } else {
                    prisma.chatMessage.create({
                        data: {
                            mac: 'SYSTEM',
                            name: 'ADMIN',
                            game: gameName,
                            group: 'GLOBAL',
                            message: message
                        }
                    }).then(() => resolve({ success: true }))
                      .catch((dbErr: any) => resolve({ success: false, error: dbErr.message }));
                }
            });
        } catch (error: any) {
            resolve({ success: false, error: error.message });
        }
    });
}

export async function kickPlayer(macStr: string) {
    if (!macStr) return { success: false, error: 'MAC is empty' };
    
    // Parse MAC string like "01:23:45:67:89:AB" to bytes
    const parts = macStr.split(':');
    if (parts.length !== 6) return { success: false, error: 'Invalid MAC format' };
    
    const macBytes = parts.map(p => parseInt(p, 16));
    
    return new Promise((resolve) => {
        try {
            const client = dgram.createSocket('udp4');
            const buffer = Buffer.alloc(7); // Type (1) + MAC (6)
            buffer.writeUInt8(4, 0); // Type 4: Kick
            for (let i = 0; i < 6; i++) {
                buffer.writeUInt8(macBytes[i], i + 1);
            }
            
            client.send(buffer, 0, buffer.length, UDP_PORT, HOST, (err) => {
                client.close();
                if (err) resolve({ success: false, error: err.message });
                else resolve({ success: true });
            });
        } catch (error: any) {
            resolve({ success: false, error: error.message });
        }
    });
}
