// apps/matchmaker/src/health.ts
import { createServer } from 'http';
import { logger } from '@draftchess/logger';

const log = logger.child({ module: 'health' });

export function startHealthServer(port = 3002) {
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      try {
        // Simple Redis + DB ping can be added later
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        res.writeHead(503);
        res.end(JSON.stringify({ status: 'unhealthy' }));
      }
    } else {
      res.writeHead(404).end();
    }
  });

  server.listen(port, () => {
    log.info({ port }, 'health server started');
  });
}