# Mitgelieferter Reverse-Proxy (Caddy) inkl. statisch erzeugter Docs und IONOS-DNS-Modul für Let's Encrypt
# Build-Kontext: Repo-Root (docker build -f docker/proxy/Dockerfile .)
# Die Docs werden mit einer Platzhalter-Adresse erzeugt, entrypoint.sh setzt beim Start docs.$KLONK_DOMAIN ein
# (so passt ein vorgefertigtes Image zu jeder Domain).

FROM --platform=$BUILDPLATFORM caddy:2-builder AS caddy
ARG TARGETOS
ARG TARGETARCH
RUN GOOS=$TARGETOS GOARCH=$TARGETARCH xcaddy build --with github.com/caddy-dns/ionos

FROM --platform=$BUILDPLATFORM node:22-alpine AS docs
WORKDIR /repo
RUN apk add --no-cache python3 make g++ && corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@klonk/docs..." \
 && DOCS_URL="https://docs.klonk-domain.invalid" pnpm --filter @klonk/docs generate

FROM caddy:2
ARG KLONK_VERSION=dev
ENV KLONK_VERSION=${KLONK_VERSION}
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY --from=docs /repo/apps/docs/.output/public /srv/docs
COPY docker/proxy/Caddyfile /etc/caddy/Caddyfile
RUN mkdir -p /etc/caddy/sites
COPY docker/proxy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
