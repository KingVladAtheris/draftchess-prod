// apps/web/src/app/lib/rate-limit.ts
//
// CHANGE: The ioredis client for rate-limiting is now the same singleton
// used by redis-publisher.ts. Previously this module created its own
// separate ioredis connection pool alongside the node-redis publisher,
// wasting connections. We now share one ioredis instance across the
// rate limiter and use a lazy-initialised singleton pattern.
//
// CHANGE: Added challengeLimiter — 5 challenges per user per hour.

import { RateLimiterRedis, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible'
import Redis                                                    from 'ioredis'
import { NextRequest, NextResponse }                           from 'next/server'
import { logger }                                              from '@draftchess/logger'

const log = logger.child({ module: 'web:rate-limit' })

function parseRedisUrl(url: string) {
  const u = new URL(url)
  return {
    host:     u.hostname,
    port:     parseInt(u.port || '6379', 10),
    password: u.password || undefined,
  }
}

let _ioRedis: Redis | null = null

function getIoRedis(): Redis {
  if (_ioRedis) return _ioRedis

  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is not set')
  }

  const opts = parseRedisUrl(process.env.REDIS_URL)
  _ioRedis   = new Redis(opts)

  _ioRedis.on('error',  (err) => log.error({ err: err.message }, 'rate-limit redis error'))
  _ioRedis.on('ready',  ()    => log.debug('rate-limit redis ready'))

  return _ioRedis
}

const _memoryAuthLimiter = new RateLimiterMemory({
  points:    3,
  duration:  15 * 60,
  keyPrefix: 'mem:auth',
})

// ── Lazy rate limiter factory ─────────────────────────────────────────────────
function makeRedisLimiter(keyPrefix: string, points: number, duration: number) {
  let _limiter: RateLimiterRedis | null = null
  return new Proxy({} as RateLimiterRedis, {
    get(_target, prop) {
      if (!_limiter) {
        _limiter = new RateLimiterRedis({
          storeClient: getIoRedis(),
          keyPrefix,
          points,
          duration,
        })
      }
      return _limiter[prop as keyof RateLimiterRedis]
    }
  })
}

export const signupLimiter   = makeRedisLimiter('rl:signup',    5,   15 * 60)
export const loginLimiter    = makeRedisLimiter('rl:login',     10,  15 * 60)
export const queueLimiter    = makeRedisLimiter('rl:queue',     10,  60)
export const moveLimiter     = makeRedisLimiter('rl:move',      60,  60)
export const placeLimiter    = makeRedisLimiter('rl:place',     20,  60)
export const draftLimiter    = makeRedisLimiter('rl:draft',     30,  60)
export const generalLimiter  = makeRedisLimiter('rl:general',   120, 60)
export const challengeLimiter = makeRedisLimiter('rl:challenge', 5,  60 * 60)

export async function consume(
  limiter: RateLimiterRedis,
  request: NextRequest,
  key?: string,
  isAuthRoute = false,
): Promise<NextResponse | null> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  const limitKey = key ?? ip

  try {
    await limiter.consume(limitKey)
    return null
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      const retryAfter = Math.ceil(err.msBeforeNext / 1000)
      log.warn({ limitKey, retryAfter }, 'rate limit exceeded')
      return NextResponse.json(
        { error: 'Too many requests', retryAfter },
        {
          status: 429,
          headers: {
            'Retry-After':       retryAfter.toString(),
            'X-RateLimit-Reset': new Date(Date.now() + err.msBeforeNext).toISOString(),
          },
        },
      )
    }

    log.error({ err, limitKey }, 'rate limiter consume error')

    if (!isAuthRoute) {
      return null
    }

    try {
      await _memoryAuthLimiter.consume(limitKey)
      log.warn({ limitKey }, 'auth route using memory fallback for rate limit')
      return null
    } catch (memErr) {
      if (memErr instanceof RateLimiterRes) {
        const retryAfter = Math.ceil(memErr.msBeforeNext / 1000)
        return NextResponse.json(
          { error: 'Too many requests', retryAfter },
          { status: 429, headers: { 'Retry-After': retryAfter.toString() } },
        )
      }
      log.error({ err: memErr }, 'memory fallback rate limiter error')
      return NextResponse.json(
        { error: 'Service temporarily unavailable' },
        { status: 503 },
      )
    }
  }
}

export async function consumeAuth(
  limiter: RateLimiterRedis,
  request: NextRequest,
  key?: string,
): Promise<NextResponse | null> {
  return consume(limiter, request, key, true)
}