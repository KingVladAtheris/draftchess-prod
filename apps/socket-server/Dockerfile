FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/game-state/package.json ./packages/game-state/
COPY packages/logger/package.json ./packages/logger/
COPY packages/shared/package.json ./packages/shared/
COPY packages/socket-types/package.json ./packages/socket-types/
COPY apps/socket-server/package.json ./apps/socket-server/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY packages/ ./packages/
COPY apps/socket-server/ ./apps/socket-server/
RUN find . -name "*.tsbuildinfo" -delete
RUN pnpm --filter @draftchess/socket-server... build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 socketuser

COPY --from=builder /app/apps/socket-server/dist ./dist
COPY --from=builder /app/apps/socket-server/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

USER socketuser
EXPOSE 3001
CMD ["node", "dist/index.js"]