import { getServerStatus } from '@/app/actions/serverStatus';
import { getChatLogs } from '@/app/actions/chatLogs';
import { getMonthlyGameTrends } from '@/app/actions/gameTrends';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isAlive = true;

      const sendEvent = async () => {
        if (!isAlive) return;

        try {
          const [status, chat, trends] = await Promise.all([
            getServerStatus(),
            getChatLogs(),
            getMonthlyGameTrends()
          ]);

          const payload = JSON.stringify({
            status,
            chat,
            trends: trends.success ? trends.trends : [],
            timestamp: Date.now()
          });

          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch (err) {
          // If error occurs, send error payload
          console.error("SSE stream error:", err);
        }
      };

      // Send immediately
      await sendEvent();

      // Interval stream every 2 seconds
      const interval = setInterval(async () => {
        if (!isAlive) {
          clearInterval(interval);
          return;
        }
        await sendEvent();
      }, 2000);

      // Clean up on stream cancel
      return () => {
        isAlive = false;
        clearInterval(interval);
      };
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
