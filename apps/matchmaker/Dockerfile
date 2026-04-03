FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm

FROM base AS deps
WORKDIR /app
# Copy workspace manifests for dependency resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/game-state/package.json ./packages/game-state/
COPY packages/logger/package.json ./packages/logger/
COPY packages/shared/package.json ./packages/shared/
COPY packages/token-service/package.json ./packages/token-service/
COPY packages/tournament-engine/package.json ./packages/tournament-engine/
COPY apps/matchmaker/package.json ./apps/matchmaker/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
# Now copy actual source
COPY packages/ ./packages/
COPY apps/matchmaker/ ./apps/matchmaker/
RUN find . -name "*.tsbuildinfo" -delete
RUN pnpm --filter @draftchess/matchmaker... build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 matchmakeruser

# Copy the built output and its runtime deps
COPY --from=builder /app/apps/matchmaker/dist ./dist
COPY --from=builder /app/apps/matchmaker/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

USER matchmakeruser
CMD ["node", "dist/index.js"]