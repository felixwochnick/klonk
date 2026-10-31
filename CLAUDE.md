# Klonk – Projektkontext für Claude

Klonk ist eine Lern-App fürs Programmieren (Robot-Karol-Prinzip): Schüler steuern Klemmbaustein-Figuren in einer 3D-Welt
per Code. Vorbild ist die Robot-App aus [felixwochnick/virtual-school](https://github.com/felixwochnick/virtual-school)
(`assets/Robot`, `components/Robot`, `stores/useRobotStore.tsx`) – dort nur Ideen übernehmen, Code wird neu geschrieben.

## Arbeitsweise

- Sprache mit dem User: **Deutsch**. Code-Bezeichner Englisch, Kommentare Deutsch.
- **Nach jedem abgeschlossenen Thema committen und auf `main` pushen** (vom User ausdrücklich gewünscht).
- Jede Änderung **selbst in Chromium testen** (`/usr/bin/chromium`): Playwright-E2E-Tests in `apps/app/tests/e2e`,
  Screenshots via `chromium --headless=new --screenshot=…`. Vor Interaktionen auf `html[data-hydrated="true"]` warten
  (`gotoHydrated` in `tests/e2e/utils.ts`).
- Vor dem Commit: `pnpm lint` und `pnpm typecheck` müssen sauber sein.
- Alle UI-Texte über i18n (`apps/app/i18n/locales/{de,en}.json`) – keine hartkodierten Strings. Neue Texte immer in **beiden** Sprachen anlegen.

## Monorepo

pnpm-Workspace (`pnpm-workspace.yaml`), Node ≥ 22.

| Pfad | Paket | Inhalt | Domain |
|---|---|---|---|
| `apps/app` | `@klonk/app` | Nuxt 4 + Nuxt UI 4 + @nuxtjs/i18n, Nitro-Server, Drizzle/Postgres | `app.klonk.*` |
| `apps/docs` | `@klonk/docs` | Docus 5 (Nuxt-Layer), Inhalte in `content/{de,en}` | `docs.klonk.*` |
| `packages/*` | `@klonk/*` | Geplant: `klonk-script` (Sprache), `runtime` (Roboter-API, Worker-Protokoll) | – |

Die Website/Shop `klonk.*` (Mollie, Token-Ausstellung) liegt in einem **separaten privaten Repo** – keinerlei
Abrechnungslogik oder private Signaturschlüssel in dieses Repo.

### Befehle (im Repo-Root)

```bash
pnpm db:up          # Postgres für Entwicklung (docker/docker-compose.dev.yml, Port 5432)
pnpm dev            # App auf :3000 (migriert DB beim Start)
pnpm dev:docs       # Docs auf :3001
pnpm db:generate    # Drizzle-Migration aus apps/app/server/database/schema.ts erzeugen
pnpm lint | pnpm typecheck
pnpm --filter @klonk/app test:e2e   # Playwright gegen lokales Chromium
```

`apps/app/.env` (Vorlage `.env.example`) enthält `NUXT_DATABASE_URL`.

### Datenbank & Migrationen

- Schema: `apps/app/server/database/schema.ts` (Drizzle, `casing: 'snake_case'`), Migrationen in `server/database/migrations`.
- Schemaänderung ⇒ immer `pnpm db:generate --name <thema>` ausführen und die Migration mitcommitten.
- `server/plugins/01.migrate.ts` prüft beim Serverstart das Schema und spielt fehlende Migrationen ein
  (Postgres-Advisory-Lock gegen parallele Instanzen; bei Fehler bricht der Start ab).
- Self-Hosting: `docker/docker-compose.yml` (App + Postgres), Image aus `apps/app/Dockerfile` (Build-Kontext = Repo-Root),
  `NUXT_MIGRATIONS_DIR=/app/migrations` im Image.

## Produktentscheidungen

- **Editor:** Monaco. **Sprachen:** Klonk-Script (eigene Sprache), JS/TS (lokal im Worker, mit Debugging), Blöcke (Blockly ⇒ Klonk-Script).
  Später: Python (Pyodide, `sys.settrace`), Java (**TeaVM**, im Browser kompiliert), C#. Ausführungsschicht von Anfang an
  sprachunabhängig: gemeinsame Roboter-API + Debugger-Protokoll; synchrone Roboterbefehle im Worker via
  SharedArrayBuffer/Atomics ⇒ App braucht COOP/COEP-Header.
- **Klonk-Script ist mehrsprachig:** Schlüsselwörter und Befehle pro Sprache (anfangs Deutsch + Englisch) über
  Schlüsselworttabellen, gemeinsamer AST. Autocomplete, Breakpoints, Schrittmodus.
- **i18n:** App und Docs zunächst Deutsch + Englisch, weitere Sprachen müssen leicht ergänzbar sein.
- **Grafik:** Figuren (männlich, weiblich, divers) und Weltblöcke in Klemmbaustein-Optik, selbst in Blender modelliert, Export glTF.
- **PWA** mit generiertem Logo/Favicon; lokales Dateisystem über File System Access API (Projektordner öffnen).
- **Auth:** Schul-Login `username@schuldomain`; Lehrkräfte können Passwörter zurücksetzen; SSO per **OIDC** und **LDAP**.
- **KI:** Schulen binden ihr eigenes LLM ein (OpenAI-kompatible API), optional WebLLM im Browser.

## Lizenzmodell (Open Core, wie evcc)

- App und Docs sind Open Core und selbst hostbar; volle Funktionen nur mit **Lizenz-Token**.
- Token = signiertes JWT (Ed25519) mit Plan, Ablauf, max. Nutzern, Feature-Flags; die App enthält nur den Public Key
  und prüft offline. Ausstellung/Abrechnung (Mollie) nur auf `klonk.*`.
- **Kostenlos:** 1 Figur, nur Standard-3D-Modelle, max. 10 Nutzer in der DB, LDAP-Login, **keine Bibliotheken/Imports**
  in Klonk-Script und TS.
- Verkauf: Tokens (Self-Hosting) und Abos (Privat, Firmen, Schulen); für Schulen auch Kauf auf Rechnung.
- In der App nur „Upgrade/Lizenz verwalten“-Link + Token-Eingabe, kein Checkout.
- Offen: Code-Lizenz (AGPL+kommerziell / MIT / FSL / ELv2) und Liste weiterer Bezahlfunktionen.

## Roadmap (Status pflegen!)

1. [x] Monorepo-Gerüst: App, Docs, Postgres/Drizzle, Auto-Migration, Docker, i18n, E2E-Tests
2. [ ] Accounts: Schulen, Rollen, Login `user@domain`, Passwort-Reset durch Lehrkräfte, OIDC, LDAP
3. [ ] Lizenz-Token-Prüfung + Free-Tier-Limits
4. [ ] 3D-Welt (three.js): Boden, Wände, Kisten, Markierungen, Welt-Editor
5. [ ] Blender-Modelle: Figuren (m/w/d) + Weltblöcke, glTF
6. [ ] Klonk-Script: Lexer/Parser/Interpreter (Worker), Monaco-Sprache, Autocomplete, Debugger, de/en
7. [ ] JS/TS-Ausführung (esbuild-wasm, Worker) mit Debugging
8. [ ] Blöcke (Blockly ⇒ Klonk-Script)
9. [ ] Lokales Dateisystem (Projektordner)
10. [ ] PWA (Logo, Favicon, Offline)
11. [ ] KI-Assistent (schuleigenes LLM / WebLLM)
12. [ ] Python, Java (TeaVM), C#
