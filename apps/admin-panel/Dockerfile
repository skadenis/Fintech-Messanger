FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace and lock files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

# Copy everything
COPY apps ./apps
COPY packages ./packages

# Build the shared package first
RUN pnpm --filter @fintech/shared build

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @fintech/admin-panel build

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/admin-panel/dist /usr/share/nginx/html

# Add nginx config for SPA routing
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $$uri $$uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]