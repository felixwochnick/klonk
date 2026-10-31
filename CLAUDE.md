# Klonk – Projektkontext für Claude

Klonk ist eine Lern-App fürs Programmieren (Robot-Karol-Prinzip): Schüler steuern Klemmbaustein-Figuren in einer 3D-Welt
per Code. Vorbild ist die Robot-App aus [felixwochnick/virtual-school](https://github.com/felixwochnick/virtual-school)
(`assets/Robot`, `components/Robot`, `stores/useRobotStore.tsx`) – dort nur Ideen übernehmen, Code wird neu geschrieben.

## Arbeitsweise

- Sprache mit dem User: **Deutsch**. Code-Bezeichner Englisch, Kommentare Deutsch.
- **Nach jedem abgeschlossenen Thema committen und auf `main` pushen** (vom User ausdrücklich gewünscht).
- Jede Änderung **selbst in Chromium testen** (`/usr/bin/chromium`): Playwright-E2E-Tests in `e2e/` (Repo-Root),
  Screenshots via `chromium --headless=new --screenshot=…`. Vor Interaktionen auf `html[data-hydrated="true"]` warten
  (`gotoHydrated` in `e2e/utils.ts`). Die E2E-Tests starten eigene Dev-Server (app :3010, admin :3012) gegen die
  Datenbank `klonk_e2e` und leeren sie vorher – laufende `pnpm dev`-Server derselben App vorher beenden (gemeinsames `.nuxt`).
- RLS-Integrationstests: `pnpm --filter @klonk/core test` (Vitest, legt `klonk_rls_test` an). Neue Tabellen/Policies dort abdecken.
- Prozesse beenden mit `pgrep -f "nuxt[.]mjs dev"` – ohne die Klammern trifft das Muster die eigene Shell.
- Vor dem Commit: `pnpm lint` und `pnpm typecheck` müssen sauber sein.
- Alle UI-Texte über i18n (`apps/app/i18n/locales/{de,en}.json`) – keine hartkodierten Strings. Neue Texte immer in **beiden** Sprachen anlegen.

## Monorepo

pnpm-Workspace (`pnpm-workspace.yaml`), Node ≥ 22.

| Pfad | Paket | Inhalt | Domain |
|---|---|---|---|
| `apps/app` | `@klonk/app` | Lern-App (Editor, Welt) | `app.klonk.*` |
| `apps/admin` | `@klonk/admin` | Verwaltung: Einrichtung, Konten, Organisation, Login-Methoden (OIDC/LDAP/lokal), alle Organisationen | `admin.klonk.*` |
| `apps/docs` | `@klonk/docs` | Docus 5 (Nuxt-Layer), Inhalte in `content/{de,en}`, Theme via `app/app.css` + `@klonk/ui/app-config` | `docs.klonk.*` |
| `packages/ui` | `@klonk/ui` | **Nuxt-Layer für einheitliches Design**: Nuxt UI, Theme (`theme.css`, `app.config.ts`), i18n-Grundkonfiguration, `KlonkLogo`, `LocaleSwitch`, Hydration-Marker | – |
| `packages/core` | `@klonk/core` | **Nuxt-Layer für Server & Auth**: Drizzle-Schema, Migrationen, RLS, Sessions (nuxt-auth-utils), Login-API, `/login`, `/change-password`, `UserMenu` | – |

App und Admin erweitern beide Layer (`extends: ['@klonk/ui', '@klonk/core']`). Geplant: `packages/klonk-script`, `packages/runtime`.
Jede App/Layer hat eigene `i18n/locales/{de,en}.json`; @nuxtjs/i18n führt sie zusammen (App-Config listet die Dateien).

Die Website/Shop `klonk.*` (Mollie, Token-Ausstellung) liegt in einem **separaten privaten Repo** – keinerlei
Abrechnungslogik oder private Signaturschlüssel in dieses Repo.

### Befehle (im Repo-Root)

```bash
pnpm db:up          # Postgres für Entwicklung (docker/docker-compose.dev.yml, Port 5432)
pnpm dev            # App auf :3000 (migriert DB beim Start)
pnpm dev:admin      # Verwaltung auf :3002
pnpm dev:docs       # Docs auf :3001
pnpm db:generate    # Drizzle-Migration aus apps/app/server/database/schema.ts erzeugen
pnpm lint | pnpm typecheck
pnpm test:e2e       # Playwright (Root-Config) gegen lokales Chromium
pnpm --filter @klonk/core test      # RLS-Integrationstests
```

`.env` im Repo-Root (Vorlage `.env.example`) wird per `--dotenv ../../.env` von app und admin geladen:
`NUXT_DATABASE_URL`, `NUXT_APP_SECRET` (Session-Cookies, für beide Apps gleich ⇒ gemeinsame Anmeldung), `NUXT_ENCRYPTION_KEY`.

### Datenbank & Migrationen

- Schema: `packages/core/server/database/schema.ts` (Drizzle, `casing: 'snake_case'`), Migrationen daneben in `migrations/`.
- Schemaänderung ⇒ immer `pnpm db:generate --name <thema>` ausführen und die Migration mitcommitten.
  Handgeschriebenes SQL (RLS, Rollen, Funktionen) ⇒ `pnpm --filter @klonk/core db:generate --custom --name <thema>`.
- `server/plugins/01.migrate.ts` prüft beim Serverstart das Schema und spielt fehlende Migrationen ein
  (Postgres-Advisory-Lock gegen parallele Instanzen; bei Fehler bricht der Start ab).
- Self-Hosting: `docker/docker-compose.yml` (app + admin + Postgres), ein Image pro App aus `docker/Dockerfile`
  (`--build-arg APP=app|admin`, Build-Kontext = Repo-Root), `NUXT_MIGRATIONS_DIR=/app/migrations` im Image.

### Row Level Security (Pflicht für alle Nutzerdaten)

- Migration `0001_rls.sql`: Rolle `klonk_user` (NOLOGIN), Hilfsfunktionen im Schema `klonk`
  (`current_user_id()`, `current_org_id()`, `current_member_role()`, `is_platform_admin()`, `stored_*()`), Policies.
- **Nutzerbezogene Abfragen immer über `withUserDb(user.id, tx => …)`**: setzt `klonk.user_id` und `SET LOCAL ROLE klonk_user`.
  `useSystemDb()` (Owner, ohne RLS) nur für Login, Sessions, Einrichtung.
- Neue Tabelle ⇒ `GRANT` an `klonk_user`, `ENABLE ROW LEVEL SECURITY`, Policies, Tests in `packages/core/tests/rls.test.ts`.
- Mehrere permissive Policies werden ODER-verknüpft – auch im `WITH CHECK` jede Rollenbedingung wiederholen.

### Konten & Anmeldung

- Organisationen (`school` | `company`) mit Domain; Login `username@domain`. Rollen: `member` / `teacher` / `admin`
  (bei Unternehmen in der UI „Mitarbeitende / Ausbildende / Admin“). Plattformrolle `owner`/`developer` = Betreiber.
- Pro Organisation wählbar (admin → Anmeldung): lokale Konten, OIDC, LDAP (Secrets AES-GCM-verschlüsselt).
- Privatkonten (ohne Organisation): OAuth-Anbieter; Betreiber (`owner`/`developer`) per Authentik.
- Erste Einrichtung über `admin /setup`: erste Organisation + Admin (= Instanz-Besitzer).
- Lehrkräfte setzen Passwörter von Lernenden zurück (⇒ `mustChangePassword`, alle Sessions widerrufen).
- Sessions: versiegeltes Cookie + Zeile in `sessions`; `server/middleware/session.ts` prüft jede API-Anfrage gegen die DB.
- API-Fehler als Code (`createError({ message: 'code' })`), UI übersetzt via `errors.<code>`; Bodies mit `readValidated()`.

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
- **Auth:** siehe „Konten & Anmeldung“. Schulen und Unternehmen wählen selbst OIDC, LDAP und/oder lokale Konten.
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
2. [x] Layer `@klonk/ui` + `@klonk/core`, Admin-App, Organisationen, Rollen, RLS, lokale Konten, Passwort-Reset
2b. [ ] OIDC + LDAP pro Organisation (Login-Flows, Verbindungstest, JIT-Provisionierung)
2c. [ ] Privatkonten: OAuth-Anbieter (Google, Microsoft, GitHub, Apple) + Authentik für Betreiber
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
