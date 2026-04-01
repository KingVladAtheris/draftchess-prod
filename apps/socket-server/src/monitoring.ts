// apps/socket-server/src/monitoring.ts
import { logger } from '@draftchess/logger';

const log = logger.child({ module: 'monitoring' });

let connectionCount = 0;
let lastStatsTime = Date.now();

export function trackConnection(socketId: string, userId: number) {
  connectionCount++;
  log.info({ socketId, userId, totalConnections: connectionCount }, 'user connected');
}

export function trackDisconnection(socketId: string, userId: number) {
  connectionCount = Math.max(0, connectionCount - 1);
  log.info({ socketId, userId, totalConnections: connectionCount }, 'user disconnected');
}

// Log performance snapshot every 60 seconds
export function logPerformanceSnapshot() {
  const now = Date.now();
  if (now - lastStatsTime > 60_000) {
    log.info({
      activeConnections: connectionCount,
      estimatedActiveGames: Math.floor(connectionCount / 2),
    }, 'socket performance snapshot');
    lastStatsTime = now;
  }
}