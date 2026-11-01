#!/bin/sh
# Wählt anhand von KLONK_TLS das Schema und die TLS-Einstellung für das Caddyfile
set -e

: "${KLONK_DOMAIN:?KLONK_DOMAIN fehlt (z. B. klonk.example)}"
export KLONK_TLS="${KLONK_TLS:-internal}"

case "$KLONK_TLS" in
  internal) export KLONK_SCHEME=https ;;
  http)
    export KLONK_SCHEME=https
    : "${KLONK_ACME_EMAIL:?KLONK_ACME_EMAIL fehlt (für Let's Encrypt)}"
    ;;
  ionos)
    export KLONK_SCHEME=https
    : "${KLONK_ACME_EMAIL:?KLONK_ACME_EMAIL fehlt (für Let's Encrypt)}"
    : "${IONOS_API_TOKEN:?IONOS_API_TOKEN fehlt (Format: <prefix>.<secret>)}"
    ;;
  off) export KLONK_SCHEME=http ;;
  *)
    echo "Unbekannter KLONK_TLS-Modus: $KLONK_TLS (internal | http | ionos | off)" >&2
    exit 1
    ;;
esac

# Leere Variablen aus Compose zählen als gesetzt – Caddy-Defaults greifen dann nicht
export KLONK_ACME_EMAIL="${KLONK_ACME_EMAIL:-admin@localhost}"

echo "[klonk-proxy] Domain: $KLONK_DOMAIN, TLS: $KLONK_TLS"
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
