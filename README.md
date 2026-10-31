# Klonk

Programmieren lernen mit Klemmbaustein-Figuren – in Klonk-Script, Blöcken, JavaScript und TypeScript.

| Paket | Beschreibung |
|---|---|
| [`apps/app`](apps/app) | Die Klonk-App (Nuxt 4, Nuxt UI, Postgres) |
| [`apps/docs`](apps/docs) | Dokumentation (Docus) |

## Entwicklung

```bash
pnpm install
cp apps/app/.env.example apps/app/.env
pnpm db:up      # Postgres starten
pnpm dev        # App auf http://localhost:3000
pnpm dev:docs   # Docs auf http://localhost:3001
```

## Selbst hosten

```bash
POSTGRES_PASSWORD=geheim docker compose -f docker/docker-compose.yml up -d
```

Das Datenbankschema wird beim Start automatisch geprüft und migriert.
