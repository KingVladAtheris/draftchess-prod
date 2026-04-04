FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/db/package.json packages/db/prisma.config.ts ./packages/db/
COPY packages/db/prisma/ ./packages/db/prisma/
COPY packages/game-state/package.json ./packages/game-state/
COPY packages/logger/package.json ./packages/logger/
COPY packages/shared/package.json ./packages/shared/
COPY packages/socket-types/package.json ./packages/socket-types/
COPY packages/token-service/package.json ./packages/token-service/
COPY packages/tournament-engine/package.json ./packages/tournament-engine/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile
RUN cd packages/db && pnpm exec prisma generate --config prisma.config.ts

FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN find . -name "*.tsbuildinfo" -delete

ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN pnpm --filter @draftchess/web... build

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV PORT=3000

USER nextjs
EXPOSE 3000
CMD ["pnpm", "--filter", "@draftchess/web", "start"]