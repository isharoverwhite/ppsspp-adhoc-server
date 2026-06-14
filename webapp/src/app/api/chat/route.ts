import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import dgram from 'dgram';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const game = searchParams.get('game');
  const group = searchParams.get('group');

  if (!game) {
    // If no game is specified, return global chat log
    const messages = await prisma.chatMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json(messages.reverse());
  }

  // Find messages specific to the game/group
  const messages = await prisma.chatMessage.findMany({
    where: {
      game,
      group: group || undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  
  return NextResponse.json(messages.reverse());
}

export async function POST(request: Request) {
  try {
    const { game, group, message } = await request.json();

    if (!message || message.length > 64) {
      return NextResponse.json({ error: 'Invalid message length' }, { status: 400 });
    }

    // 1. Send UDP Broadcast to C Server
    const client = dgram.createSocket('udp4');
    
    let buffer: Buffer;
    
    if (game && group) {
      // Type 3: Group Broadcast (1 byte type + 9 bytes game + 8 bytes group + message)
      buffer = Buffer.alloc(18 + Buffer.byteLength(message));
      buffer.writeUInt8(3, 0);
      buffer.write(game, 1, 9, 'ascii');
      buffer.write(group, 10, 8, 'ascii');
      buffer.write(message, 18, 'utf8');
    } else if (game) {
      // Type 2: Game Broadcast (1 byte type + 9 bytes game + message)
      buffer = Buffer.alloc(10 + Buffer.byteLength(message));
      buffer.writeUInt8(2, 0);
      buffer.write(game, 1, 9, 'ascii');
      buffer.write(message, 10, 'utf8');
    } else {
      // Type 1: Global Broadcast (1 byte type + message)
      buffer = Buffer.alloc(1 + Buffer.byteLength(message));
      buffer.writeUInt8(1, 0);
      buffer.write(message, 1, 'utf8');
    }

    client.send(buffer, 0, buffer.length, 27313, '127.0.0.1', (err) => {
      client.close();
      if (err) console.error("UDP Send Error:", err);
    });

    // 2. Save Admin Message to Database for UI
    const chatMsg = await prisma.chatMessage.create({
      data: {
        mac: '00:00:00:00:00:00', // Admin MAC
        name: 'ADMIN',
        game: game || 'GLOBAL',
        group: group || 'GLOBAL',
        message: message,
      }
    });

    return NextResponse.json(chatMsg);
  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
