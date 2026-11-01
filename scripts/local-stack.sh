#!/usr/bin/env bash
# Lokaler Komplett-Stack unter *.klonk.local (Proxy mit selbst signierten Zertifikaten, alle Dienste, Test-Anmeldedienste)
#
#   scripts/local-stack.sh up       Bauen und starten
#   scripts/local-stack.sh down     Stoppen (Daten bleiben erhalten)
#   scripts/local-stack.sh reset    Stoppen und alle Daten löschen
#   scripts/local-stack.sh ca       Lokale Root-CA nach docker/local/klonk-local-ca.crt exportieren
#   scripts/local-stack.sh logs     Logs verfolgen
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -p klonk-local --env-file docker/local/local.env -f docker/docker-compose.yml -f docker/docker-compose.local.yml)
HOSTS="klonk.local app.klonk.local admin.klonk.local auth.klonk.local docs.klonk.local sso.klonk.local"
CA_FILE=docker/local/klonk-local-ca.crt

export_ca() {
  "${COMPOSE[@]}" cp proxy:/data/caddy/pki/authorities/local/root.crt "$CA_FILE" >/dev/null
  echo "Root-CA: $CA_FILE"
}

check_hosts() {
  local missing=()
  for host in $HOSTS; do
    getent hosts "$host" >/dev/null 2>&1 || missing+=("$host")
  done
  if ((${#missing[@]})); then
    echo
    echo "Diese Namen lösen noch nicht auf. Einmalig in /etc/hosts eintragen:"
    echo "  echo '127.0.0.1 $HOSTS' | sudo tee -a /etc/hosts"
  fi
}

print_trust_help() {
  cat <<HELP

Damit der Browser den Zertifikaten vertraut, die Root-CA einmalig importieren:
  Linux (System):   sudo trust anchor --store $CA_FILE
  Chrome/Chromium:  certutil -d sql:\$HOME/.pki/nssdb -A -t "C,," -n "Klonk Local CA" -i $CA_FILE
  Firefox:          Einstellungen → Zertifikate → Importieren → $CA_FILE
  macOS:            sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $CA_FILE
HELP
}

case "${1:-up}" in
  up)
    "${COMPOSE[@]}" up -d --build --wait
    export_ca
    cat <<INFO

Klonk läuft:
  App            https://app.klonk.local
  Verwaltung     https://admin.klonk.local   (beim ersten Aufruf: Einrichtung)
  Anmeldung      https://auth.klonk.local
  Docs           https://docs.klonk.local
  Test-IdP       https://sso.klonk.local/dex  (Nutzer tim/lisa/anna, Passwort <name>-pass)
  Test-LDAP      ldap://glauth:3893 (aus Sicht der Dienste), Bind cn=service,ou=svcaccts,dc=klonk,dc=test / service-pass
INFO
    check_hosts
    print_trust_help
    ;;
  down) "${COMPOSE[@]}" down ;;
  reset) "${COMPOSE[@]}" down -v ;;
  ca) export_ca && print_trust_help ;;
  logs) "${COMPOSE[@]}" logs -f ;;
  *) echo "Unbekannter Befehl: $1 (up | down | reset | ca | logs)" >&2; exit 1 ;;
esac
