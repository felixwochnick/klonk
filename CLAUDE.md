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
  Auth läuft im E2E auf :3013. Nach Weiterleitungen über auth.* hinweg mit `waitForPage()` auf Hydration warten,
  Logins über `loginWithPassword()` (beides `e2e/utils.ts`).
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
| `apps/auth` | `@klonk/auth` | **Zentrale Anmeldung** (Single Sign-on für app, admin, Website): Login, Passwort ändern, alle SSO-Rücksprünge, `/api/session` | `auth.klonk.*` |
| `apps/docs` | `@klonk/docs` | Docus 5 (Nuxt-Layer), Inhalte in `content/{de,en}`, Theme via `app/app.css` + `@klonk/ui/app-config` | `docs.klonk.*` |
| `packages/ui` | `@klonk/ui` | **Nuxt-Layer für einheitliches Design**: Nuxt UI, Theme (`theme.css`, `app.config.ts`), i18n-Grundkonfiguration, `KlonkLogo`, `LocaleSwitch`, Hydration-Marker | – |
| `packages/world` | `@klonk/world` | **Weltmodell** (ohne Darstellung, läuft auch im Worker): Raster, Ziegelstapel, Marken, Quader, Figuren, Befehle, Ereignisse, JSON-Format (`WorldData`, zod) | – |
| `packages/core` | `@klonk/core` | **Nuxt-Layer für Server & Auth**: Drizzle-Schema, Migrationen, RLS, Sessions (nuxt-auth-utils), Login-API, `/login`, `/change-password`, `UserMenu` | – |

App, Admin und Auth erweitern beide Layer (`extends: ['@klonk/ui', '@klonk/core']`). Geplant: `packages/klonk-script`, `packages/runtime`. Paket-Tests: `pnpm -r test`.
Jede App/Layer hat eigene `i18n/locales/{de,en}.json`; @nuxtjs/i18n führt sie zusammen (App-Config listet die Dateien).

Die Website/Shop `klonk.*` (Mollie, Token-Ausstellung) liegt in einem **separaten privaten Repo** – keinerlei
Abrechnungslogik oder private Signaturschlüssel in dieses Repo.

### Befehle (im Repo-Root)

```bash
pnpm db:up          # Postgres für Entwicklung (docker/docker-compose.dev.yml, Port 5432)
pnpm sso:up         # + Test-LDAP glauth (:3893) und Test-OIDC Dex (:5556, Client klonk/klonk-dev-secret);
                    #   Nutzer tim/lisa/anna, Passwort <name>-pass; E2E-SSO-Tests werden ohne diese übersprungen
pnpm dev            # App auf :3000 (migriert DB beim Start)
pnpm dev:admin      # Verwaltung auf :3002
pnpm dev:auth       # Zentrale Anmeldung auf :3003 (für Login in app/admin mitstarten, s. NUXT_PUBLIC_AUTH_URL)
pnpm dev:docs       # Docs auf :3001
pnpm db:generate    # Drizzle-Migration aus packages/core/server/database/schema.ts erzeugen
pnpm lint | pnpm typecheck
pnpm test:e2e       # Playwright (Root-Config) gegen lokales Chromium
pnpm stack:up       # Komplett-Stack *.klonk.local (Proxy, alle Apps, Docs, Test-LDAP/-IdP) – scripts/local-stack.sh
pnpm test:e2e:stack # dieselben E2E-Tests gegen den Stack (Produktions-Builds hinter TLS-Proxy, kein /etc/hosts nötig)
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
- Self-Hosting: `docker/docker-compose.yml` (proxy + app + admin + auth + Postgres, Variablen aus `docker/.env`, Vorlage
  `docker/.env.example`), ein Image pro App aus `docker/Dockerfile` (`--build-arg APP=app|admin|auth`, Build-Kontext = Repo-Root),
  `NUXT_MIGRATIONS_DIR=/app/migrations` im Image. Alle öffentlichen URLs/Cookie-Domain werden aus `KLONK_DOMAIN` abgeleitet.
- **Proxy** `docker/proxy/` (Caddy mit IONOS-DNS-Modul + statisch erzeugte Docs): `*.KLONK_DOMAIN` ⇒ app/admin/auth/docs,
  Hauptdomain ⇒ App. TLS über `KLONK_TLS`: `internal` (lokale CA), `http` (Let's Encrypt HTTP-01), `ionos` (DNS-01 via
  `IONOS_API_TOKEN`), `off`. Zusätzliche Sites über `/etc/caddy/sites/*.caddy`.
- **Lokaler Stack** `docker/docker-compose.local.yml` + `docker/local/` (klonk.local, `tls internal`, glauth + Dex unter
  sso.klonk.local; Apps vertrauen der lokalen CA via `NODE_EXTRA_CA_CERTS`, Proxy hat Netz-Aliase für alle Hostnamen).
  E2E-Ziel per `KLONK_E2E_TARGET=stack` (`e2e/targets.ts`).

### Row Level Security (Pflicht für alle Nutzerdaten)

- Migration `0001_rls.sql`: Rolle `klonk_user` (NOLOGIN), Hilfsfunktionen im Schema `klonk`
  (`current_user_id()`, `current_org_id()`, `current_member_role()`, `is_platform_admin()`, `stored_*()`), Policies.
- **Nutzerbezogene Abfragen immer über `withUserDb(user.id, tx => …)`**: setzt `klonk.user_id` und `SET LOCAL ROLE klonk_user`.
  `useSystemDb()` (Owner, ohne RLS) nur für Login, Sessions, Einrichtung.
- Neue Tabelle ⇒ `GRANT` an `klonk_user`, `ENABLE ROW LEVEL SECURITY`, Policies, Tests in `packages/core/tests/rls.test.ts`.
- Mehrere permissive Policies werden ODER-verknüpft – auch im `WITH CHECK` jede Rollenbedingung wiederholen.
- Achtung `search_path`: Heißt der DB-Nutzer `klonk`, würde `"$user"` neue Tabellen ins Hilfsschema `klonk` legen.
  Migration 0002 setzt daher `ALTER ROLE CURRENT_USER SET search_path = public` – nie Tabellen ins Schema `klonk` legen.

### Konten & Anmeldung

- Organisationen (`school` | `company`) mit Domain; Login `username@domain`. Rollen: `member` / `teacher` / `admin`
  (bei Unternehmen in der UI „Mitarbeitende / Ausbildende / Admin“). Plattformrolle `owner`/`developer` = Betreiber.
- Pro Organisation wählbar (admin → Anmeldung): lokale Konten, OIDC, LDAP (Secrets AES-GCM-verschlüsselt).
  OIDC: `server/routes/auth/oidc/*` (PKCE, Zustand verschlüsselt im Cookie), LDAP: `server/utils/ldap.ts` (Filter maskiert).
  JIT-Provisionierung in `server/utils/provision.ts` – verknüpft nie mit Konten, die ein lokales Passwort haben.
- Privatkonten (ohne Organisation): Google/Microsoft/Apple/GitHub (`server/routes/auth/<anbieter>.get.ts`, nuxt-auth-utils)
  Wiedererkennung nur über Anbieter-ID. Social-Buttons nur in der App (`appConfig.klonk.socialLogin`).
- **Klonk ID** (Authentik, `runtimeConfig.platformOidc`, Route `/auth/oidc/platform`) ist **nur für Entwickler:innen und
  Besitzer:innen** (vom User so festgelegt): Button nur für admin (`appConfig.klonk.operatorLogin` bzw. Ziel admin auf auth.*), ohne Betreiber-Gruppe
  kein Login; Gruppenentzug ⇒ Konto gesperrt + Sessions widerrufen, Rückkehr in die Gruppe ⇒ wieder freigegeben.
- E2E: Dex dient auch als Klonk ID (Gruppe `admins` ⇒ owner, siehe `playwright.config.ts`).
- Erste Einrichtung über `admin /setup`: erste Organisation + Admin (= Instanz-Besitzer).
- Lehrkräfte setzen Passwörter von Lernenden zurück (⇒ `mustChangePassword`, alle Sessions widerrufen).
- Sessions: versiegeltes Cookie + Zeile in `sessions`; `server/middleware/session.ts` prüft jede API-Anfrage gegen die DB.
- API-Fehler als Code (`createError({ message: 'code' })`), UI übersetzt via `errors.<code>`; Bodies mit `readValidated()`.
- **Zentrale Anmeldung:** Ist `NUXT_PUBLIC_AUTH_URL` gesetzt, leiten app/admin (`useAuthUrls().isCentral`) für Login und
  Passwortänderung nach auth.* weiter (`?redirect=<absolute URL>`); ohne die Variable nutzt jede App ihre eingebaute Login-Seite.
  Weiterleitungsziele immer über `safeRedirectTarget()` gegen die erlaubten Origins (app, admin, auth, `NUXT_PUBLIC_WEBSITE_URLS`)
  prüfen. Auf auth.* bestimmt das Ziel die Buttons: Ziel admin ⇒ Klonk ID, sonst Social-Login.
  Gemeinsame Session über `NUXT_SESSION_COOKIE_DOMAIN` (z. B. `.klonk.example`); die Website (privates Repo) fragt
  `auth.*/api/session` mit `credentials: 'include'` ab. Setup-Prüfung der Verwaltung steckt in der Core-Middleware
  (`appConfig.klonk.setupRoute`), da Layer-Middlewares vor App-Middlewares laufen.

## Produktentscheidungen

- **Editor:** Monaco. **Sprachen:** Klonk-Script (eigene Sprache), JS/TS (lokal im Worker, mit Debugging), Blöcke (Blockly ⇒ Klonk-Script).
  Später: Python (Pyodide, `sys.settrace`), Java (**TeaVM**, im Browser kompiliert), C#. Ausführungsschicht von Anfang an
  sprachunabhängig: gemeinsame Roboter-API + Debugger-Protokoll; synchrone Roboterbefehle im Worker via
  SharedArrayBuffer/Atomics ⇒ App braucht COOP/COEP-Header.
- **Klonk-Script ist mehrsprachig:** Schlüsselwörter und Befehle pro Sprache (anfangs Deutsch + Englisch) über
  Schlüsselworttabellen, gemeinsamer AST. Autocomplete, Breakpoints, Schrittmodus.
- **i18n:** App und Docs zunächst Deutsch + Englisch, weitere Sprachen müssen leicht ergänzbar sein.
- **Grafik:** Figuren (männlich, weiblich, divers) und Weltblöcke in Klemmbaustein-Optik, selbst in Blender modelliert, Export glTF.
  Modelle entstehen per Skript: `blender -b --factory-startup --python assets/blender/build_models.py` ⇒
  `apps/app/public/models/*.glb` + `assets/blender/klonk-models.blend` + `preview.png`. Maße: 1 Feld = 1 Einheit = 2×2 Noppen,
  Ziegel 0,6 hoch, Platte 0,2, Noppe 0,1. Figuren sind aus Ziegeln aufgebaut (bewusst keine Minifiguren-Nachbildung),
  Gelenke `ArmL/ArmR/LegL/LegR` für Animationen. Blender-MCP (Port 9876) ist optional – das Skript läuft headless.
- **3D:** `apps/app/app/utils/world-renderer.ts` (three.js, InstancedMesh, animiert `WorldEvent`s aus `@klonk/world`),
  Komponente `KlonkWorld` nur in `<ClientOnly>` (`.client.vue` + Template-Ref funktionierte nicht).
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
- **Selbsthost-Pläne** (vom User festgelegt, Unterschied nur Plan + Grenze): `self-hosted` (bis 1000 Konten) und
  `self-hosted-enterprise` (> 1000, unbegrenzt oder vereinbart) – `SELF_HOSTED_PLANS`. Kontengrenze: Warnung ab 90 %,
  danach 10 % Puffer (min. 1), dann Sperre neuer Konten (`userUsage()`); kostenlos hart bei 10.
- In der App nur „Upgrade/Lizenz verwalten“-Link (`NUXT_PUBLIC_SHOP_URL`) + Token-Eingabe, kein Checkout.
- **Umsetzung:** `packages/core/shared/utils/license.ts` (Features, Free-Grenzen, Kulanzzeit 14 Tage),
  `server/utils/license.ts` (`verifyLicenseToken`, `getEffectiveLicense(orgId)`, `requireFeature()`, `assertUserCapacity()`),
  öffentliche Schlüssel in `server/utils/license-keys.ts` (`kid`), Testschlüssel `klonk-dev` nur mit `import.meta.dev`
  (privater Testschlüssel in `packages/core/tests/fixtures`). Instanz-Token: `NUXT_LICENSE_TOKEN` oder `instance_settings.license`
  (admin → Lizenz, nur Plattform-Admins). Feature `hosted` ⇒ Grenzen pro Organisation (`organizations.license_token`).
  Client: `useLicense()` (`can('libraries')`, `maxCharacters`). **Neue Bezahlfunktionen immer serverseitig mit
  `requireFeature()` absichern** und in `LICENSE_FEATURES` + Admin-i18n (`admin.license.features.*`) eintragen.
- Produktiver Signierschlüssel liegt nur lokal unter `~/.config/klonk/license-signing-key.pem` (gehört ins private Shop-Repo/
  Secret-Store). Tokens manuell ausstellen: `node scripts/sign-license.ts --name … --features … --days …`.
- Offen: Code-Lizenz (AGPL+kommerziell / MIT / FSL / ELv2), weitere Bezahlfunktionen, Abos für Privatkonten auf der gehosteten Plattform.

## Roadmap (Status pflegen!)

1. [x] Monorepo-Gerüst: App, Docs, Postgres/Drizzle, Auto-Migration, Docker, i18n, E2E-Tests
2. [x] Layer `@klonk/ui` + `@klonk/core`, Admin-App, Organisationen, Rollen, RLS, lokale Konten, Passwort-Reset
2b. [x] OIDC + LDAP pro Organisation (Login-Flows, Verbindungstest, JIT-Provisionierung, Rollen aus Gruppen)
2c. [x] Privatkonten: OAuth-Anbieter (Google, Microsoft, GitHub, Apple); Klonk ID (Authentik) nur für Betreiber
2d. [x] Zentrale Anmeldung `auth.klonk.*` (Single Sign-on für app, admin, Website)
2e. [x] Mitgelieferter Proxy (Caddy, TLS: internal/HTTP-01/IONOS-DNS/off) + lokaler Komplett-Stack `*.klonk.local`
3. [x] Lizenz-Token-Prüfung + Free-Tier-Limits (Nutzergrenze, OIDC; Figuren/Modelle/Bibliotheken/KI als Flags für spätere Schritte)
4. [x] 3D-Welt (three.js): Boden, Ziegel, Marken, Quader, Figuren-Animation, Welt-Editor `/world` (Bearbeiten/Ausprobieren, JSON-Dateien)
5. [x] Blender-Modelle: Figuren (m/w/d) + Ziegel/Platte/Fliese, glTF (`assets/blender/build_models.py`)
6. [ ] Klonk-Script: Lexer/Parser/Interpreter (Worker), Monaco-Sprache, Autocomplete, Debugger, de/en
7. [ ] JS/TS-Ausführung (esbuild-wasm, Worker) mit Debugging
8. [ ] Blöcke (Blockly ⇒ Klonk-Script)
9. [ ] Lokales Dateisystem (Projektordner)
10. [ ] PWA (Logo, Favicon, Offline)
11. [ ] KI-Assistent (schuleigenes LLM / WebLLM)
12. [ ] Python, Java (TeaVM), C#
