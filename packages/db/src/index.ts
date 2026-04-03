// packages/db/src/index.ts
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('[db] DATABASE_URL environment variable is required')
}

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient }

function createPrismaClient(): PrismaClient {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,                          // Important when using PgBouncer
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

export const prisma: PrismaClient =
  globalForPrisma.__prisma ?? (globalForPrisma.__prisma = createPrismaClient())

export * from '@prisma/client'