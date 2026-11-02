# Klonk

Programmieren lernen mit Klemmbaustein-Figuren – in Klonk-Script, Blöcken, JavaScript und TypeScript.

| Paket | Beschreibung |
|---|---|
| [`apps/app`](apps/app) | Die Klonk-App (Nuxt 4, Nuxt UI, Postgres) |
| [`apps/admin`](apps/admin) | Verwaltung: Organisationen, Konten, Login-Methoden |
| [`apps/auth`](apps/auth) | Zentrale Anmeldung (Single Sign-on) |
| [`packages/ui`](packages/ui) | Nuxt-Layer: gemeinsames Design |
| [`packages/core`](packages/core) | Nuxt-Layer: Datenbank, RLS, Anmeldung |
| [`apps/docs`](apps/docs) | Dokumentation (Docus) |

## Entwicklung

```bash
pnpm install
cp .env.example .env
pnpm db:up      # Postgres starten
pnpm dev        # App auf http://localhost:3000
pnpm dev:admin  # Verwaltung auf http://localhost:3002
pnpm dev:auth   # Anmeldung auf http://localhost:3003
pnpm dev:docs   # Docs auf http://localhost:3001
```

## Selbst hosten

Mitgelieferter Proxy mit automatischen Zertifikaten (Let's Encrypt per HTTP- oder IONOS-DNS-Challenge) – nur `*.deine-domain` muss auf den Server zeigen:

```bash
cp docker/.env.example docker/.env   # Domain, TLS-Modus, Secrets
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d --build
```

## Alles lokal testen

```bash
pnpm stack:up   # https://app.klonk.localhost, admin., auth., docs. – selbst signiert, inkl. Test-LDAP und Test-IdP
```

Details: [Selbst hosten](apps/docs/content/de/6.self-hosting/1.installation.md)
