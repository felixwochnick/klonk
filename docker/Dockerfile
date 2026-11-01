# Ein Image pro App: docker build -f docker/Dockerfile --build-arg APP=app|admin|auth .
ARG APP=app

FROM node:22-alpine AS build
ARG APP
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@klonk/${APP}..." \
 && pnpm --filter "@klonk/${APP}" build

FROM node:22-alpine
ARG APP
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NUXT_MIGRATIONS_DIR=/app/migrations
COPY --from=build /repo/apps/${APP}/.output ./
COPY --from=build /repo/packages/core/server/database/migrations ./migrations
EXPOSE 3000
USER node
CMD ["node", "server/index.mjs"]
