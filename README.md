# Klonk

Programmieren lernen mit Klemmbaustein-Figuren – in Klonk-Script, Blöcken, JavaScript und TypeScript.

| Paket | Beschreibung |
|---|---|
| [`apps/app`](apps/app) | Die Klonk-App (Nuxt 4, Nuxt UI, Postgres) |
| [`apps/admin`](apps/admin) | Verwaltung: Organisationen, Konten, Login-Methoden |
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
pnpm dev:docs   # Docs auf http://localhost:3001
```

## Selbst hosten

```bash
export KLONK_APP_SECRET=$(openssl rand -base64 32) KLONK_ENCRYPTION_KEY=$(openssl rand -base64 32)
POSTGRES_PASSWORD=geheim docker compose -f docker/docker-compose.yml up -d
```

Das Datenbankschema wird beim Start automatisch geprüft und migriert.
