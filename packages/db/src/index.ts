// packages/db/src/index.ts
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient }

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('[db] DATABASE_URL environment variable is required')
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  })

  pool.on('error', (err) => {
    console.error('[db] PostgreSQL pool error:', err.message)
  })

  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export function getPrisma(): PrismaClient {
  return globalForPrisma.__prisma ?? (globalForPrisma.__prisma = createPrismaClient())
}

// Keep `prisma` as a lazy getter so existing imports don't break
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return getPrisma()[prop as keyof PrismaClient]
  }
})

export * from '@prisma/client'