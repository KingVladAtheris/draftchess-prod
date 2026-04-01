// apps/socket-server/src/handlers/disconnect.ts
//
// Improved: Better logging, clearer flow, and explicit clear on reconnect paths.

import { prisma } from '@draftchess/db';
import { setDisconnectedPresence } from '../presence.js';
import {
  getGameState,
  cancelRematch,
} from '@draftchess/game-state';
import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@draftchess/socket-types';

type IO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const DISCONNECT_GRACE_SECS = 30;

export function registerDisconnect(io: IO, socket: Sock, redis: any): void {
  socket.on('disconnect', async (reason) => {
    const { userId, gameId: knownGameId } = socket.data;
    console.log(`[disconnect] user ${userId} disconnected — reason: ${reason}`);

    // Always remove online status
    redis.del(`online:${userId}`).catch(() => {});

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { queueStatus: true },
      });

      if (!user) return;

      // Handle queued users
      if (user.queueStatus === 'queued') {
        await prisma.user.update({
          where: { id: userId },
          data: {
            queueStatus: 'offline',
            queuedAt: null,
            queuedDraftId: null,
          },
        });
        console.log(`[disconnect] user ${userId} removed from queue`);
        return;
      }

      // Not in game → possibly on finished game page with rematch offer
      if (user.queueStatus !== 'in_game') {
        if (knownGameId) {
          await maybeCancelRematch(io, redis, userId, knownGameId);
        }
        return;
      }

      // In game case
      const gameIdToUse = knownGameId || await getActiveGameId(userId);

      if (!gameIdToUse) return;

      const game = await prisma.game.findUnique({
        where: { id: gameIdToUse },
        select: { id: true, status: true, player1Id: true, player2Id: true },
      });

      if (!game) return;

      if (game.status === 'active' || game.status === 'prep') {
        const opponentId = game.player1Id === userId ? game.player2Id : game.player1Id;

        await setDisconnectedPresence(redis, userId, game.id);

        io.to(`game-${game.id}-user-${opponentId}`).emit('opponent-disconnected', {
          userId,
          gracePeriodSecs: DISCONNECT_GRACE_SECS,
        });

        console.log(`[disconnect] set grace period for user ${userId} in game ${game.id}`);
        return;
      }

      // Finished game → handle rematch offer
      if (game.status === 'finished') {
        await maybeCancelRematch(io, redis, userId, game.id);
      }

    } catch (err) {
      console.error(`[disconnect] error for user ${userId}`, err);
    }
  });
}

// Helper to find active game if socket.data.gameId is not set
async function getActiveGameId(userId: number): Promise<number | null> {
  const game = await prisma.game.findFirst({
    where: {
      status: { in: ['active', 'prep'] },
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    select: { id: true },
  });
  return game?.id ?? null;
}

/**
 * Cancel pending rematch offer when user disconnects from finished game
 */
async function maybeCancelRematch(
  io: IO,
  redis: any,
  userId: number,
  gameId: number,
): Promise<void> {
  try {
    const state = await getGameState(redis, gameId);
    if (!state || state.rematchRequestedBy !== userId) return;

    await cancelRematch(redis, gameId);

    const opponentId = state.player1Id === userId ? state.player2Id : state.player1Id;

    io.to(`game-${gameId}-user-${opponentId}`).emit('game-update' as any, {
      rematchCancelled: true,
    });

    console.log(`[disconnect] cancelled rematch offer for game ${gameId}, user ${userId}`);
  } catch (err) {
    console.error(`[disconnect] failed to cancel rematch for game ${gameId}`, err);
  }
}