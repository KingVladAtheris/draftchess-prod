// apps/matchmaker/src/rate-limit.ts
import { createClient } from 'redis';
import { logger } from '@draftchess/logger';

const log = logger.child({ module: 'rate-limit' });

let redisClient: any = null;

async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();
  }
  return redisClient;
}

export async function rateLimitMove(userId: number, gameId: number): Promise<boolean> {
  const key = `ratelimit:move:${userId}:${gameId}`;
  const redis = await getRedis();

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 5); // 5-second window
  }

  if (count > 12) { // max ~12 moves per 5 seconds (~1 move every 400ms)
    log.warn({ userId, gameId, count }, 'move rate limit exceeded');
    return false;
  }
  return true;
}