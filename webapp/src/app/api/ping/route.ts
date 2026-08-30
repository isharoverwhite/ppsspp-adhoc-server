import { NextResponse } from 'next/server';
import net from 'net';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const host = searchParams.get('host') || 'direct.play.isharoverwhite.com';
  const port = parseInt(searchParams.get('port') || '27312', 10);
  const timeoutMs = 3000;

  const startTime = Date.now();

  try {
    const isOnline = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });

    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      online: isOnline,
      latencyMs: isOnline ? latencyMs : null,
      host,
      port,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({
      online: false,
      error: error.message,
      host,
      port
    }, { status: 500 });
  }
}
