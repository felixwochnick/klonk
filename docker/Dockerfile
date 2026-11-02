# Ein Image pro App: docker build -f docker/Dockerfile --build-arg APP=app|admin|auth .
# Die Build-Stufen laufen auf der Build-Plattform (Ausgabe ist reines JS/WASM) – nur die letzte Stufe ist je Architektur.
ARG APP=app

# C#-Host für die App (Roslyn auf .NET-WebAssembly, packages/csharp)
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS csharp
WORKDIR /src
COPY packages/csharp ./
RUN dotnet publish -c Release -o /out --nologo

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
ARG APP
WORKDIR /repo
RUN corepack enable
COPY . .
COPY --from=csharp /out/wwwroot/_framework ./packages/runtime/dotnet
RUN pnpm install --frozen-lockfile --filter "@klonk/${APP}..." \
 && pnpm --filter "@klonk/${APP}" build

FROM node:22-alpine
ARG APP
ARG KLONK_VERSION=dev
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NUXT_MIGRATIONS_DIR=/app/migrations \
    KLONK_VERSION=${KLONK_VERSION}
COPY --from=build /repo/apps/${APP}/.output ./
COPY --from=build /repo/packages/core/server/database/migrations ./migrations
EXPOSE 3000
USER node
CMD ["node", "server/index.mjs"]
