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

# Docs wurden mit Platzhalter-Adresse erzeugt (Sitemap, OG-Bilder, llms.txt) ⇒ echte Adresse einsetzen.
# Schema und Host getrennt ersetzen, damit auch maskierte Varianten (\u002F, %2F) passen.
DOCS_SCHEME="${KLONK_PUBLIC_SCHEME:-$KLONK_SCHEME}"
grep -rlF 'docs.klonk-domain.invalid' /srv/docs 2>/dev/null | while read -r file; do
  sed -i -E \
    -e "s#https:(//|\\\\u002F\\\\u002F|%2F%2F)docs\\.klonk-domain\\.invalid#$DOCS_SCHEME:\\1docs.$KLONK_DOMAIN#g" \
    -e "s#docs\\.klonk-domain\\.invalid#docs.$KLONK_DOMAIN#g" \
    "$file"
done

echo "[klonk-proxy] Version: ${KLONK_VERSION:-dev}, Domain: $KLONK_DOMAIN, TLS: $KLONK_TLS"
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
