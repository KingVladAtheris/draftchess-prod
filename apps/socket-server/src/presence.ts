// apps/socket-server/src/presence.ts
import { createClient } from 'redis';
import { logger } from '@draftchess/logger';

const log = logger.child({ module: 'socket-server:presence' });

export const PRESENCE_KEY_PREFIX = 'presence:disconnected:';
export const DISCONNECT_GRACE_SECS = 30;

export function presenceKey(userId: number, gameId: number): string {
  return `${PRESENCE_KEY_PREFIX}${userId}:${gameId}`;
}

// ── Public helpers used by disconnect.ts and game.ts ─────────────────────
export async function setDisconnectedPresence(
  redis: any,
  userId: number,
  gameId: number,
): Promise<void> {
  const key = presenceKey(userId, gameId);
  await redis.set(key, '1', { EX: DISCONNECT_GRACE_SECS });
  log.debug({ userId, gameId }, 'set disconnected presence (grace period started)');
}

export async function clearDisconnectedPresence(
  redis: any,
  userId: number,
  gameId: number,
): Promise<void> {
  const key = presenceKey(userId, gameId);
  await redis.del(key);
  log.debug({ userId, gameId }, 'cleared disconnected presence (player reconnected)');
}

// ── Forfeit publisher (used by both notification path and poller) ───────────
async function publishForfeit(cmdClient: any, userId: number, gameId: number) {
  try {
    await cmdClient.publish('draftchess:forfeit', JSON.stringify({ userId, gameId }));
    log.info({ userId, gameId }, 'forfeit published');
  } catch (err: any) {
    log.error({ userId, gameId, err: err.message }, 'failed to publish forfeit');
  }
}

// ── Light safety net poller (runs infrequently) ─────────────────────────────
function startPresencePoller(cmdClient: any): void {
  const POLL_INTERVAL_MS = 45_000; // 45 seconds - very low overhead

  log.info({ intervalMs: POLL_INTERVAL_MS }, 'presence poller started as safety net');

  setInterval(async () => {
    try {
      let cursor = 0;
      do {
        const result = await cmdClient.scan(cursor, {
          MATCH: `${PRESENCE_KEY_PREFIX}*`,
          COUNT: 50,
        });
        cursor = result.cursor;

        for (const key of result.keys) {
          const ttl = await cmdClient.ttl(key);
          if (ttl <= 0) {
            const parts = key.slice(PRESENCE_KEY_PREFIX.length).split(':');
            const userId = parseInt(parts[0] ?? '0');
            const gameId = parseInt(parts[1] ?? '0');
            if (userId && gameId) {
              await publishForfeit(cmdClient, userId, gameId);
            }
          }
        }
      } while (cursor !== 0);
    } catch (err: any) {
      log.warn({ err: err.message }, 'presence poller tick failed');
    }
  }, POLL_INTERVAL_MS);
}

// ── Main entry point: Keyspace notifications + safety poller ────────────────
export async function startPresenceExpiry(cmdClient: any): Promise<void> {
  const REDIS_URL = process.env.REDIS_URL!;
  const dbIndex = parseInt(new URL(REDIS_URL).pathname.replace('/', '') || '0', 10);
  const channel = `__keyevent@${dbIndex}__:expired`;

  const subClient = createClient({ url: REDIS_URL });
  await subClient.connect().catch((err) => {
    log.error({ err }, 'failed to connect presence subscriber');
  });

  try {
    await subClient.subscribe(channel, async (expiredKey) => {
      if (!expiredKey?.startsWith(PRESENCE_KEY_PREFIX)) return;

      const parts = expiredKey.slice(PRESENCE_KEY_PREFIX.length).split(':');
      const userId = parseInt(parts[0] ?? '0');
      const gameId = parseInt(parts[1] ?? '0');

      if (userId && gameId) {
        log.debug({ userId, gameId }, 'grace period expired via keyspace notification');
        await publishForfeit(cmdClient, userId, gameId);
      }
    });

    log.info({ channel }, 'subscribed to Redis keyspace expiry notifications');
  } catch (err: any) {
    log.error({ err }, 'failed to subscribe to keyspace notifications');
  }

  // Always start light poller as backup
  startPresencePoller(cmdClient);
}