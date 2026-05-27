FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace and lock files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

# Copy everything
COPY apps ./apps
COPY packages ./packages

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the shared package first
RUN pnpm --filter @fintech/shared build

# Generate prisma client and build backend
RUN pnpm --filter @fintech/backend exec prisma generate
RUN pnpm --filter @fintech/backend build

FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
COPY --from=builder /app/packages ./packages

# Copy Prisma schema
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma

RUN pnpm install --frozen-lockfile --prod
RUN pnpm dlx prisma@6.9.0 generate --schema=./apps/backend/prisma/schema.prisma

COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

WORKDIR /app/apps/backend

EXPOSE 3000

# Nest writes compiled sources under dist/src with the current tsconfig.
CMD ["node", "dist/src/main.js"]