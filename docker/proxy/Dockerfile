# Mitgelieferter Reverse-Proxy (Caddy) inkl. statisch erzeugter Docs und IONOS-DNS-Modul für Let's Encrypt
# Build-Kontext: Repo-Root (docker build -f docker/proxy/Dockerfile --build-arg KLONK_DOMAIN=klonk.example .)
ARG KLONK_DOMAIN=klonk.localhost

FROM caddy:2-builder AS caddy
RUN xcaddy build --with github.com/caddy-dns/ionos

FROM node:22-alpine AS docs
ARG KLONK_DOMAIN
WORKDIR /repo
RUN apk add --no-cache python3 make g++ && corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@klonk/docs..." \
 && DOCS_URL="https://docs.${KLONK_DOMAIN}" pnpm --filter @klonk/docs generate

FROM caddy:2
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY --from=docs /repo/apps/docs/.output/public /srv/docs
COPY docker/proxy/Caddyfile /etc/caddy/Caddyfile
RUN mkdir -p /etc/caddy/sites
COPY docker/proxy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
