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
COPY apps/socket-server/package.json ./apps/socket-server/
RUN pnpm install --frozen-lockfile
RUN cd packages/db && pnpm exec prisma generate --config prisma.config.ts

FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY packages/ ./packages/
COPY apps/socket-server/ ./apps/socket-server/
RUN find . -name "*.tsbuildinfo" -delete
RUN pnpm --filter @draftchess/socket-server... build

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 socketuser

ENV NODE_ENV=production
ENV PORT=3001

USER socketuser
EXPOSE 3001
CMD ["node", "apps/socket-server/dist/index.js"]