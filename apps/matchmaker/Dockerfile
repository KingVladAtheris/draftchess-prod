FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm

FROM base AS deps
WORKDIR /app
# Copy workspace manifests for dependency resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/db/package.json packages/db/prisma.config.ts ./packages/db/
COPY packages/db/prisma/ ./packages/db/prisma/
COPY packages/game-state/package.json ./packages/game-state/
COPY packages/logger/package.json ./packages/logger/
COPY packages/shared/package.json ./packages/shared/
COPY packages/token-service/package.json ./packages/token-service/
COPY packages/tournament-engine/package.json ./packages/tournament-engine/
COPY apps/matchmaker/package.json ./apps/matchmaker/
RUN pnpm install --frozen-lockfile
RUN cd packages/db && pnpm exec prisma generate --config prisma.config.ts

FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY packages/ ./packages/
COPY apps/matchmaker/ ./apps/matchmaker/
RUN find . -name "*.tsbuildinfo" -delete
RUN pnpm --filter @draftchess/matchmaker... build

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 matchmakeruser

ENV NODE_ENV=production
ENV PORT=3001

USER matchmakeruser
EXPOSE 3001
CMD ["node", "apps/matchmaker/dist/index.js"]