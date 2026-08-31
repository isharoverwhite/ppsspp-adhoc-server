import { getServerStatus } from '@/app/actions/serverStatus';
import { getChatLogs } from '@/app/actions/chatLogs';
import { getMonthlyGameTrends } from '@/app/actions/gameTrends';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let intervalId: NodeJS.Timeout | null = null;
  let isClosed = false;

  const cleanup = () => {
    isClosed = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  // Listen to client disconnect / navigation abort
  request.signal.addEventListener('abort', cleanup);

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = async () => {
        if (isClosed || request.signal.aborted) {
          cleanup();
          try { controller.close(); } catch {}
          return;
        }

        try {
          const [status, chat, trends] = await Promise.all([
            getServerStatus(),
            getChatLogs(),
            getMonthlyGameTrends()
          ]);

          if (isClosed || request.signal.aborted) {
            cleanup();
            return;
          }

          const payload = JSON.stringify({
            status,
            chat,
            trends: trends.success ? trends.trends : [],
            timestamp: Date.now()
          });

          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch (err) {
          // Stream closed or error
          cleanup();
        }
      };

      // Initial immediate send
      await sendEvent();

      // Periodic push every 3 seconds
      intervalId = setInterval(sendEvent, 3000);
    },
    cancel() {
      cleanup();
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
