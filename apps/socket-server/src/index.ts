// apps/socket-server/src/index.ts
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '@draftchess/socket-types';

import { authMiddleware } from './auth.js';
import { registerGameHandlers } from './handlers/game.js';
import { registerQueueHandlers } from './handlers/queue.js';
import { registerDisconnect } from './handlers/disconnect.js';
import { startPresenceExpiry } from './presence.js';
import { subscribeToRedis } from './subscriber.js';
import { startHealthServer } from './health.js';
import { trackConnection, trackDisconnection, logPerformanceSnapshot } from './monitoring.js';

// ── Env validation ────────────────────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL;
const AUTH_SECRET = process.env.AUTH_SECRET;
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const PORT = parseInt(process.env.SOCKET_PORT ?? '3001', 10);

if (!REDIS_URL) { console.error('[socket] REDIS_URL is required'); process.exit(1); }
if (!AUTH_SECRET) { console.error('[socket] AUTH_SECRET is required'); process.exit(1); }

// ── Redis clients ─────────────────────────────────────────────────────────────
function makeRedis() {
  const c = createClient({ url: REDIS_URL! });
  c.on('error', (err) => console.error('[redis] error', err));
  c.on('reconnecting', () => console.warn('[redis] reconnecting'));
  return c;
}

const pubClient = makeRedis();
const subClient = makeRedis();
const cmdClient = makeRedis();

await Promise.all([pubClient.connect(), subClient.connect(), cmdClient.connect()]);
console.log('[socket] Redis connected');

// ── Verify keyspace notifications ─────────────────────────────────────────────
try {
  const config = await cmdClient.configGet('notify-keyspace-events');
  const flags = (config['notify-keyspace-events'] ?? '').toUpperCase();
  if (!flags.includes('E') || !flags.includes('X')) {
    console.error(
      '[socket] WARNING: Redis notify-keyspace-events does not include E+x. ' +
      'Presence-based forfeit will not fire. Add --notify-keyspace-events KExg to your Redis config.'
    );
  } else {
    console.log(`[socket] Redis keyspace notifications OK (flags: ${flags})`);
  }
} catch {
  console.warn('[socket] Could not verify Redis keyspace notifications.');
}

// ── HTTP server (health + minimal) ───────────────────────────────────────────
const httpServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200).end('ok');
  } else {
    res.writeHead(404).end();
  }
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
export const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: { origin: ALLOWED_ORIGIN, credentials: true },
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectTimeout: 10_000,
});

io.adapter(createAdapter(pubClient, subClient));
io.use(authMiddleware);

io.on('connection', socket => {
  const { userId } = socket.data;
  console.log(`[socket] user ${userId} connected — socket ${socket.id}`);

  cmdClient.set(`online:${userId}`, '1', { EX: 70 }).catch(() => {});

  socket.join(`queue-user-${userId}`);

  // Monitoring
  trackConnection(socket.id, userId);

  socket.on('heartbeat', () => {
    cmdClient.set(`online:${userId}`, '1', { EX: 70 }).catch(() => {});
  });

  socket.on('disconnect', () => {
    trackDisconnection(socket.id, userId);
    logPerformanceSnapshot();
  });

  registerGameHandlers(io, socket, cmdClient);
  registerQueueHandlers(socket);
  registerDisconnect(io, socket, cmdClient);
});

// ── Redis pub/sub fan-out ─────────────────────────────────────────────────────
await subscribeToRedis(io, cmdClient);

// ── Presence / Forfeit system ─────────────────────────────────────────────────
await startPresenceExpiry(cmdClient);

// ── Health server ─────────────────────────────────────────────────────────────
startHealthServer(3003);

// ── Start server ──────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[socket] listening on :${PORT}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  console.log(`[socket] ${signal} received, shutting down`);
  await io.close();
  await Promise.all([pubClient.quit(), subClient.quit(), cmdClient.quit()]);
  console.log('[socket] clean exit');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));