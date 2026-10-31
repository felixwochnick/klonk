# Build-Kontext: Repo-Root (docker build -f apps/app/Dockerfile .)
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @klonk/app... \
 && pnpm --filter @klonk/app build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NUXT_MIGRATIONS_DIR=/app/migrations
COPY --from=build /repo/apps/app/.output ./
COPY --from=build /repo/apps/app/server/database/migrations ./migrations
EXPOSE 3000
USER node
CMD ["node", "server/index.mjs"]
