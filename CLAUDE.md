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
| `packages/klonk-script` | `@klonk/klonk-script` | **Klonk-Script**: Sprachtabellen de/en (`languages.ts` – neue Sprache = neue Spalte), Lexer, Parser (AST), async Interpreter mit Prüfpunkten, Übersetzen | – |
| `packages/learn` | `@klonk/learn` | **Lernmodule**: Aufgaben als Daten (`src/modules/*.ts`, Welten als Textkarten `map()`), Prüfung (`compareOutcome`, `missingConstructs`) | – |
| `packages/runtime` | `@klonk/runtime` | **Ausführung**: Worker (`@klonk/runtime/worker?worker`), sprachunabhängiges Protokoll (`protocol.ts`), `ProgramRunner` (Hauptthread, spielt Roboterbefehle auf der angezeigten Welt nach); JS/TS in `src/js/` | – |
| `packages/diagrams` | `@klonk/diagrams` | **Diagramme**: Struktogramm, UML-Klassen-/Objektdiagramm, ER-Diagramm (Modell, Auswertung, Layout, SVG) | – |
| `packages/core` | `@klonk/core` | **Nuxt-Layer für Server & Auth**: Drizzle-Schema, Migrationen, RLS, Sessions (nuxt-auth-utils), Login-API, `/login`, `/change-password`, `UserMenu` | – |

App, Admin und Auth erweitern beide Layer (`extends: ['@klonk/ui', '@klonk/core']`). Paket-Tests: `pnpm -r test`.
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
pnpm stack:up       # Komplett-Stack *.klonk.localhost (Proxy, alle Apps, Docs, Test-LDAP/-IdP) – scripts/local-stack.sh
pnpm test:e2e:stack # dieselben E2E-Tests gegen den Stack (Produktions-Builds hinter TLS-Proxy)
pnpm --filter @klonk/core test      # RLS-Integrationstests
node scripts/build-csharp.ts        # C#-Host bauen (.NET-SDK 10 nötig; Ausgabe nicht im Git)
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
- **Releases** (`.github/workflows/release.yml`): Tag `vX.Y.Z` pushen ⇒ Images `ghcr.io/felixwochnick/klonk-{app,admin,auth,proxy}`
  (amd64 + arm64, Tags `X.Y.Z`, `X.Y`, `X` ab 1.0, `latest`) + GitHub-Release mit generierten Notizen. Vorher `version` in der Root-`package.json`
  anheben. Compose nutzt `image:` mit `KLONK_VERSION` (Standard `latest`, lokaler Stack `local`) und behält `build:` für eigene Builds.
  Build-Stufen laufen auf `$BUILDPLATFORM` (Ausgabe ist reines JS/WASM, kein QEMU für Nuxt/.NET); der Proxy erzeugt die Docs mit der
  Platzhalter-Adresse `docs.klonk-domain.invalid`, `entrypoint.sh` ersetzt sie beim Start durch `docs.$KLONK_DOMAIN`.
- **Proxy** `docker/proxy/` (Caddy mit IONOS-DNS-Modul + statisch erzeugte Docs): `*.KLONK_DOMAIN` ⇒ app/admin/auth/docs,
  Hauptdomain ⇒ App. TLS über `KLONK_TLS`: `internal` (lokale CA), `http` (Let's Encrypt HTTP-01), `ionos` (DNS-01 via
  `IONOS_API_TOKEN`), `off`. Zusätzliche Sites über `/etc/caddy/sites/*.caddy`.
- **Lokaler Stack** `docker/docker-compose.local.yml` + `docker/local/` (klonk.localhost – `.localhost` löst immer lokal auf, kein `.local` (mDNS)!, `tls internal`, glauth + Dex unter
  sso.klonk.localhost; Apps vertrauen der lokalen CA via `NODE_EXTRA_CA_CERTS`, Proxy hat Netz-Aliase für alle Hostnamen).
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
  Besitzer:innen** (vom User so festgelegt): Button in admin und auf auth.* **immer** (`appConfig.klonk.operatorLogin`, vom User so festgelegt; in der eingebauten App-Anmeldung nicht), ohne Betreiber-Gruppe
  kein Login; Gruppenentzug ⇒ Konto gesperrt + Sessions widerrufen, Rückkehr in die Gruppe ⇒ wieder freigegeben.
- E2E: Dex dient auch als Klonk ID (Gruppe `admins` ⇒ owner, siehe `playwright.config.ts`).
- Erste Einrichtung über `admin /setup`: erste Organisation + Admin (= Instanz-Besitzer).
- Lehrkräfte setzen Passwörter von Lernenden zurück (⇒ `mustChangePassword`, alle Sessions widerrufen).
- Sessions: versiegeltes Cookie + Zeile in `sessions`; `server/middleware/session.ts` prüft jede API-Anfrage gegen die DB.
- API-Fehler als Code (`createError({ message: 'code' })`), UI übersetzt via `errors.<code>`; Bodies mit `readValidated()`.
- **Zentrale Anmeldung:** Ist `NUXT_PUBLIC_AUTH_URL` gesetzt, leiten app/admin (`useAuthUrls().isCentral`) für Login und
  Passwortänderung nach auth.* weiter (`?redirect=<absolute URL>`); ohne die Variable nutzt jede App ihre eingebaute Login-Seite.
  Weiterleitungsziele immer über `safeRedirectTarget()` gegen die erlaubten Origins (app, admin, auth, `NUXT_PUBLIC_WEBSITE_URLS`)
  prüfen. Auf auth.* ist die Klonk ID immer sichtbar; Social-Login nur, wenn das Ziel nicht die Verwaltung ist.
  Gemeinsame Session über `NUXT_SESSION_COOKIE_DOMAIN` (z. B. `.klonk.example`); die Website (privates Repo) fragt
  `auth.*/api/session` mit `credentials: 'include'` ab. Setup-Prüfung der Verwaltung steckt in der Core-Middleware
  (`appConfig.klonk.setupRoute`), da Layer-Middlewares vor App-Middlewares laufen.

## Produktentscheidungen

- **Editor:** Monaco. **Sprachen:** Klonk-Script (eigene Sprache), JS/TS (lokal im Worker, mit Debugging), Blöcke (Blockly ⇒ Klonk-Script).
  Python (Pyodide, `sys.settrace`), Java (**TeaVM**, im Browser kompiliert), C# (Roslyn auf .NET-WebAssembly). Ausführungsschicht von Anfang an
  sprachunabhängig: gemeinsame Roboter-API + Debugger-Protokoll; synchrone Roboterbefehle im Worker via
  SharedArrayBuffer/Atomics ⇒ App braucht COOP/COEP-Header.
- **Sprachen mit englischen Schlüsselwörtern (JS, TS, Python, Java, C#) nutzen nur die englische Roboter-API** (vom User so
  festgelegt): keine deutschen Befehle/Farben, Beispiele und Parameternamen englisch; nur Doku/Hover folgen der UI-Sprache.
  Mehrsprachig ist nur Klonk-Script (und damit die Blöcke).
- **Objekt-API in JS/TS/Python/Java/C#** (vom User so festgelegt): keine globalen Roboterbefehle, jede Figur ist ein Objekt
  `new Klonk()` (erste) / `new Klonk("Klara")` (Name, ohne Groß-/Kleinschreibung) / `new Klonk(2)` / `Klonk.all()`; Befehle und
  Sensoren sind Methoden; dazu `wait` (Java `sleep`), Farben und Designs. **Alles nur per Import** (vom User so festgelegt):
  JS/TS `import { Klonk } from 'klonk'`, Python `from klonk import Klonk`, Java `import klonk.Klonk;` (+ `import static klonk.Klonk.*;`),
  C# `using klonk;` (+ `using static klonk.Klonk;`). **Klonk-Script und Blöcke steuern immer nur eine Figur** (`wähleFigur`), ohne Import.
  Gemeinsame Basis `createApi()` in `runtime/src/js/api.ts` (`robot()`, `names()`, `globals`, `ROBOT_METHODS`, `onError`).
  - **Ausgabe/Zufall wie in der Sprache** (vom User so festgelegt): `console.log`/`Math.random`, `print`/`random`, `System.out.println`,
    `Console.WriteLine` – die Bibliothek `klonk` hat davon nur `wait` (Java `sleep`), Farben und Designs.
  - JS/TS: `js/modules.ts` schreibt `import`/`export` zeilentreu in `__klonk_import`/`__klonk_export` um (Exporte als Getter vorne,
    `export *` über Proxy-Namespace); `"klonk"` = API-Modul, `./x` bzw. `/src/x` = Projektdateien (Lizenz `libraries`, ohne Prüfpunkte).
    Monaco: `declare module 'klonk'` in `js-api-types.ts`; Projektdateien als Modelle unter `file:///<pfad>` (`paths: {'/*': ['*']}`,
    nach dem Anlegen mit `getTypeScriptWorker(...uris)` synchronisieren, sonst „Cannot find module“).
  - Python: Modul `klonk` per `sys.modules` im Vorspann (JS-Brücke `_klonk_js`), Projektdateien mit Ordnern (Pakete), Ordner der Hauptdatei in `sys.path`.
  - Java: `klonk.Klonk` + Debugger-Klasse `klonk.Debug` (unsichtbarer Import `import static klonk.Debug.*;` in Zeile 1, `__cp` unqualifiziert –
    eine Variable `klonk` würde `klonk.X` verdecken). Browser-javac kann **keine Unterordner** in Dateinamen ⇒ alle Dateien flach nach Klassenname; Klassen ohne `package` laufen
    intern in `package _default;` (`withPackage()`), sonst findet javac bei `import X.*;`/`import klonk.*;` die flache Datei im Standardpaket;
    fehlt `import klonk.Klonk;`, meldet javac „bad source file: Klonk.java“ ⇒ `friendlyJavacMessage()`. `detectMainClasses()` liefert `a/b/C` ⇒
    in Punkte umwandeln; Startklasse = Package + öffentliche Klasse der geöffneten Datei. JSO-Strings vor `toString()` per Verkettung kopieren.
  - C#: Namensraum `klonk` (klein, `Klonk` würde die Klasse verdecken), Instrumentierung `global::klonk.Klonk.__cp`; Aufrufe `call(method, ["s:<Name>", …])`.
- **Projektsprache:** `klonk.json` (`{ "language": "java" }`, nicht in der Dateiliste) – Dialog „Neues Browser-Projekt“ fragt sie ab,
  Startdateien je Sprache (Java `src/Main.java`), „Neue Datei“ nur in dieser Sprache, Java-Vorlage mit Package aus dem Ordner
  (`javaPackage()`, `javaClassSource()`), weitere C#-Dateien als Klasse im Namespace des Ordners (`csharpNamespace()`, `csharpClassSource()`).
  Ohne Manifest = gemischt; leerer Ordner/leeres Browser-Projekt ⇒ Dialog „Projekt einrichten“ (`offerSetup`, `createStarterFiles`). Der Runner bekommt `path` der geöffneten Datei.
- **Figuren erstellen/wechseln** (vom User so festgelegt): Klonk-Script/Blöcke `erstelle(name, aussehen?, x?, y?)` (en `create`) und
  `wechsle(name)` (en `switch`, alte Schreibweise `wähleFigur`/`selectCharacter` bleibt); danach wird die neue/gewählte Figur gesteuert.
  Objekt-Sprachen: `Klonk.create(...)` (C# `Klonk.Create`). Gemeinsam: `World.spawnCharacter()` (Feld 1-basiert im Programm, sonst
  nächstes freies neben der zuletzt genutzten Figur, deren Blickrichtung), `resolveLook()` (männlich/weiblich/divers bzw. male/… oder
  Projektdesign), Lizenzgrenze `maxCharacters` im Run-Request, Befehl `createCharacter` (Runner fügt die Figur der angezeigten Welt hinzu).
  `createCharacter`/`selectCharacter` sind keine Methoden einer Figur (`CLASS_COMMANDS`).
- **Designs** (Lizenz-Feature `models`): `RobotDesign` (Grundform + Farben + Zubehör, `designSchema`, `DEFAULT_DESIGNS`), Dateien
  `*.klonkdesign.json` (Dateiart `design`) öffnen sich immer im `DesignEditor` (in der IDE statt Code, Live-Vorschau mit `KlonkWorld`).
  Figuren betten ihr Design ein (`CharacterData.design`), Welten bleiben eigenständig. Renderer: `utils/character-look.ts`
  (`applyDesign` färbt Materialien `<modell>-skin|shirt|pants|hair`/`eye` um, Zubehör als three.js-Geometrie; `nameLabel` = Sprite mit
  Namen über jeder Figur, `showNames`). Projektdesigns gehen als `designs` (Dateiname ⇒ Design) an den Runner.
- **Designs in Programmen:** `loadDesign(name)` (JSON-Text; Python `load_design` ⇒ dict) / `saveDesign(name, design)` (Worker-Nachricht
  `saveDesign` ⇒ `ProgramRunner.onSaveDesign` ⇒ `useProject().writeDesign`), `create(name, look)` nimmt auch Design-JSON. Run-Request:
  `designs` nur mit Lizenz (sonst `design_license`), `saveDesigns` = Lizenz + Projekt. **Java-Bibliotheken** `packages/runtime/src/java/lib/*.java`
  (`klonk.Json/JsonObject/JsonArray/Yaml/Xml`, per `?raw` immer mitkompiliert): eigene Klassen, weil org.json im Browser-javac nicht geht
  (kein `getClass()`/`Map.Entry`/`Throwable.getMessage()` in dessen Klassenbibliothek, Absturz bei Annotationen mit Argumenten wie
  `@SuppressWarnings(…)`). `import klonk.*;` geht dank `package _default;` (siehe Java oben). **C#:** Newtonsoft.Json 13.0.4 +
  YamlDotNet 18.1.0 (NuGet, DLLs als Referenz eingebettet, nicht getrimmt) und System.Xml.Linq (Ref-Assemblies + `TrimmerRootAssembly`).
- **Figurennamen** = `CharacterData.id` (`isValidCharacterName`, `World.findCharacter/renameCharacter`, Vorschläge `nextCharacterName`),
  umbenennen im Welt-Editor (Abschnitt „Namen der Figuren“).
- **Klonk-Script ist mehrsprachig:** Schlüsselwörter und Befehle pro Sprache (anfangs Deutsch + Englisch) über
  Schlüsselworttabellen, gemeinsamer AST. Autocomplete, Breakpoints, Schrittmodus.
- **i18n:** App und Docs zunächst Deutsch + Englisch, weitere Sprachen müssen leicht ergänzbar sein.
- **Grafik:** Figuren (männlich, weiblich, divers) und Weltblöcke in Klemmbaustein-Optik, selbst in Blender modelliert, Export glTF.
  Modelle entstehen per Skript: `blender -b --factory-startup --python assets/blender/build_models.py` ⇒
  `apps/app/public/models/*.glb` + `assets/blender/klonk-models.blend` + `preview.png`. Maße: 1 Feld = 1 Einheit = **4×4 Noppen** (Raster 0,25),
  Ziegel 0,3 hoch, Platte/Fliese 0,1, Noppe 0,05; Figuren (Skalierung 0,75) stehen mit jedem Fuß auf einer Noppe (der Renderer setzt das Modell dafür ½ Raster = 0,125 hinter die Feldmitte). Figuren sind aus Ziegeln aufgebaut (bewusst keine Minifiguren-Nachbildung),
  Gelenke `ArmL/ArmR/LegL/LegR` für Animationen. Blender-MCP (Port 9876) ist optional – das Skript läuft headless.
- **JS/TS-Ausführung** (`packages/runtime/src/js/`): Nutzercode läuft **synchron** im Worker. `instrument.ts` (acorn +
  magic-string, nur Einfügungen ⇒ Zeilen bleiben) setzt vor jede Anweisung `__klonk_cp(zeile, () => vars)`, auch in leere/
  blocklose Schleifen. Steuerung über `SharedArrayBuffer` (`shared.ts`: PAUSE/SIGNAL/DELAY + Haltepunkt-Bitmap), da der
  blockierte Worker keine Nachrichten empfängt. TS ⇒ JS mit sucrase (behält Zeilen). Roboter-API (`api.ts`) aus den
  Klonk-Script-Tabellen, nur englische Namen. Vor dem Ausführen werden `fetch`, `WebSocket`, `postMessage` … im Worker entfernt (Sandbox).
  Braucht `crossOriginIsolated` ⇒ app setzt COOP `same-origin` + COEP `require-corp` (routeRules + vite.server.headers) –
  daher **keine Fremd-Ressourcen in der App** (Schriften, Bilder, Skripte nur von der eigenen Origin).
  Monaco-TS: `monaco.typescript.*Defaults` (0.57), API-Deklaration `utils/js-api-types.ts`. Worker-Abhängigkeiten in
  `vite.optimizeDeps.include`, sonst lädt die Dev-Seite beim ersten Lauf neu.
- **Python** (`packages/runtime/src/python/`): Pyodide (`pyodide`-Paket, Version fest) wird **nicht gebündelt**, sondern per
  Nitro-`publicAssets` unter `/pyodide/` ausgeliefert (COEP) und im Worker per dynamischem Import geladen; PWA cacht es erst bei
  Bedarf (`CacheFirst`). Gleiche SAB-Steuerung wie JS: `prelude.ts` setzt `sys.settrace` (nur Datei `<klonk>`) ⇒ Prüfpunkt je Zeile,
  Variablen erst beim Anhalten (`repr`). Roboter-API aus `createApi()` als Modul `klonk` (Methoden nur in snake_case:
  `is_wall`, `turn_left`; gleiche Regel wie `pythonName()` in `useProgram.ts`), `print` bleibt Pythons eigenes.
  API-Fehler kommen in Python als `JsException` an ⇒ zuletzt geworfener `ApiError` wird gemerkt und übersetzt. Projekt-`.py`-Dateien
  nur mit Lizenz (`libraries`) importierbar. Unit-Tests laufen mit Pyodide in Node (`tests/python.test.ts`, Loader injizierbar).
  Monaco: Python-Syntax eingebaut, Vervollständigung/Hover der API in `utils/monaco.ts` (`registerPython`).
- **Java** (`packages/runtime/src/java/`): [teavm-javac](https://github.com/konsoletyper/teavm-javac) (javac + TeaVM als WebAssembly,
  Apache 2.0) liegt mit Prüfsummen in `packages/runtime/teavm/` (`node scripts/fetch-teavm-javac.ts`, Quelle teavm.org/playground/3/),
  Auslieferung per Nitro-`publicAssets` unter `/teavm/`, PWA-Cache bei Bedarf. Ablauf im Worker: `instrument.ts` (java-parser-CST,
  nur Einfügungen) setzt vor jede Anweisung `if (__cp(zeile)) { __v("x", x)…; __pause(); }` und klammert Rümpfe von
  Schleifen/if; `import static klonk.Debug.*;` kommt in Zeile 1. `robot.ts` = Java-Klassen `klonk.Klonk` + `klonk.Debug`, ruft per **JSO-Schnittstellen**
  `window.klonk` (Worker setzt `window = globalThis`). **Wichtig:** Dieser Browser-javac stürzt bei `@JSBody` und eigenen Annotationen
  ab („cyclic inheritance … Annotation“/Stack-Überlauf) – nur `@JSProperty` + JSO-Interfaces nutzen. Compiler als **Bytes** an den
  TeaVM-Loader geben (bei URL nimmt er wegen `process` im Vite-Worker Node an). Dateinamen beim Compiler flach (`Klonk.java`, nicht
  `klonk/Klonk.java`). Farben als `RED`…, `wait` ⇒ `sleep` (sonst verdeckt `Object.wait()` den statischen Import).
  Unit-Tests kompilieren echt in Node (`tests/java.test.ts`).
- **C#** (`packages/csharp/` = .NET-Projekt, `packages/runtime/src/csharp/run.ts`): Host (`Host.cs`, `[JSExport] Run`) kompiliert
  mit Roslyn, instrumentiert per **semantischem Modell** (Prüfpunkte wie Java, Variablen = `DefinitelyAssignedOnEntry` ∩
  `LookupSymbols` ∩ gleiche Methode, keine ref/ref-struct) und führt per `Assembly.Load` aus. Roboter-API `RobotApi.txt`
  (PascalCase, `Red`…) wird als Quelltext mitkompiliert und ruft über Delegaten in `AppDomain`-Daten → `[JSImport]`-Funktionen.
  Implizite Usings als eigene Datei mit `global using` (ohne `klonk` – das kommt per `using klonk;` im Nutzercode). Build: `node scripts/build-csharp.ts`
  ⇒ `packages/runtime/dotnet/` (**nicht im Git**; E2E baut es bei Bedarf, Docker in eigener SDK-Stage). Fallen:
  `concurrentBuild: false` (Single-Thread-WASM: „Cannot wait on monitors“); Ressource nicht `*.cs.txt` nennen (MSBuild hält
  `.cs` für eine Kultur ⇒ Satelliten-Assembly); CoreLib/System.Runtime/Console/Collections/Linq nicht trimmen (sonst
  MissingMethodException in Nutzercode); im Modul-Worker `importScripts` ausblenden + `window = globalThis` vor dem Laden von
  `dotnet.js` (sonst wartet es ewig auf `coreAssetsInMemory`); .NET bindet JSImport-Funktionen beim ersten Aufruf fest ⇒
  Weiterleitung über `bindImports()`. Unit-Tests laufen mit dem gebauten Host in Node (`tests/csharp.test.ts`).
- **Blöcke** (`apps/app/app/utils/blocks/`, `KlonkBlocks.vue`): Blockly 13 (zelos), Beschriftung aus den Klonk-Script-Tabellen
  (`spell()`), Generator ⇒ Klonk-Script; jede Anweisung markiert ihre erste Zeile mit ` #@<blockId>` (Kommentar, wird entfernt)
  ⇒ `lineToBlock` für Hervorhebung/Fehler/Haltepunkte. Haltepunkte in `block.data = 'breakpoint'` (mitgespeichert).
  Blockly-Medien liegen in `public/blockly-media` (externe Quelle wäre wegen COEP blockiert). Farben nur `#rrggbb`.
  Variablen-/Prozedurnamen behalten Umlaute (`safeName` überschrieben). Sprachen-Typ `ProgramLanguage = RunLanguage | 'blocks'`.
  Design: globale CSS-Overrides in `KlonkBlocks.vue` mit Nuxt-UI-Variablen (`--ui-bg`, `--ui-border` …); Kategorien haben
  `toolboxitemid` = Schlüssel aus `CATEGORY_COLORS` ⇒ CSS-Variable `--klonk-category`. Flyout `setAutoClose(false)` (bleibt
  beim Ziehen offen, erste Kategorie beim Start geöffnet – erneuter Klick auf die Kategorie schließt sie).
- **Projekte** (`utils/project-fs.ts`, `useProject.ts`, `ProjectPanel.vue`): gleiche Klasse `Project` für echte Ordner
  (`showDirectoryPicker`, Chrome/Edge) und Browser-Projekte (OPFS `klonk-projects/<name>`, alle Browser; E2E testet über OPFS).
  Zustand modulweit (Handles nicht serialisierbar), zuletzt geöffnete Ordner in IndexedDB, Autosave 400 ms. Dateiart aus der
  Endung (`.blocks`, `.klonk`, `.js`, `.ts`, `.py`, `.java`, `.cs`, `.klonkworld.json`). Ohne Projekt nutzt die IDE weiter `useProgram()` (localStorage).
  Reka-`SelectItem` erlaubt keinen leeren Wert ⇒ Platzhalterwerte verwenden. Blockly-Kontextmenü global ⇒ vor Neu-Registrierung abmelden.
  Bedienlogik gemeinsam in `useProjectExplorer()` (Seitenleiste `ProjectPanel` + Vollbild-Explorer `pages/projects.vue`),
  **Rechtsklick-Menüs** (`UContextMenu`, verschachtelt – innerer Trigger gewinnt): `fileContextItems`, `folderActions`, `areaContextItems`, gemeinsamer
  Teil `createItemsIn` (*Neue Datei ›*, *Neuer Ordner*, Packages). **Packages/Namespaces** (`createPackage`): Java/C# auf oberster Ebene unter `src`
  (bzw. `src/main/java`), Python mit `__init__.py` je Ebene; gemischte Projekte bieten die vorhandenen Sprachen an. E2E-Menüs per `exact: true` wählen
  („Java“ steckt auch in „Neues Java-Package“).
  Datei-Symbole `FileIcon` (simple-icons für JS/TS/…, Klonk-Script als eigener Ziegel), Namensdialog `ProjectNameDialog`.
  **Ordner:** `Project.scan()` liefert Dateien + (auch leere) Ordner; Ordner umbenennen/verschieben = rekursiv kopieren + löschen.
  Baumansicht (`tree`, zugeklappte Ordner modulweit) und Ziehen & Ablegen (`onDragStart/onDragOver/onDrop`, `''` = oberste Ebene)
  in `useProjectExplorer()`; Vollbild-Explorer navigiert per Pfadleiste, Suche durchsucht alles.
  IDE lädt die Projektwelt auch beim Mount (Projekt kann schon offen sein); `/world?load=1` lädt die gewählte Projektwelt.
- **IDE** (`apps/app/app/pages/index.vue`): Monaco (`utils/monaco.ts`: Monarch ohne `\p{L}` – Monarch kennt keine Unicode-Klassen;
  Themes `klonk-light/-dark`; `acceptSuggestionOnEnter: 'smart'`, `autoIndent: 'full'`), `KlonkEditor` (Breakpoints, aktive Zeile),
  Programme je Sprache + Breakpoints in localStorage (`klonk:program`: `{ language, programs }`). An Worker nur Plain-Daten senden (Vue-Proxys ⇒ DataCloneError).
  Befehlsreferenz der Docs: `node scripts/gen-script-docs.ts` nach Änderungen an `languages.ts`.
- **Sprachdienst (Vorschläge/Hover):** derselbe Worker (`check.ts`, Anfragen `check`/`complete`/`hover`, je Art+Sprache nur die
  neueste, Vorschläge vor Prüfung). C#: `Host.Complete/Hover` (Semantikmodell; ohne Punkt mit Platzhalter `_;` an der Cursorstelle,
  sonst sieht Roslyn am Dateiende keine lokalen Variablen; Rang lokal > eigener Code > Rest). Python: **Jedi 0.20.1 + Parso 0.8.7**
  (MIT, Wheels in `packages/runtime/pylibs`, `node scripts/fetch-jedi.ts`, Auslieferung `/pylibs/`), Stub `python/stub.ts` für `klonk`,
  Projektdateien unter `/klonk/project`. Java: `java/complete.ts` (Textanalyse ohne Parser: Deklarationen, Projektklassen, bekannte
  Typen; fehlender `import klonk.Klonk;` als `addImport`). Monaco-Provider in `utils/monaco.ts` (`registerApiLanguage`, Fallback auf
  statische Vorschläge), Projektkontext je Modell in `modelContexts`; Modelle liegen unter `file:///<n>/project/<pfad>`,
  JS/TS-Projektdateien als `addExtraLib` daneben (Importe zwischen Dateien).
- **Fehler im Editor:** Klonk-Script prüft `validate()` (Hauptthread), JS/TS der Monaco-TS-Worker (JS mit `checkJs`, nicht strict),
  Python/Java/C# ein eigener **Prüf-Worker** (`@klonk/runtime/check-worker?worker`, `src/check.ts`, Client `utils/checker.ts`):
  Pyodide `compile()`, javac (gleiche Dateien wie beim Lauf, Import-Präfix aus Positionen herausgerechnet; Compiler wird
  wiederverwendet, entfernte Dateien leer überschreiben), C# `[JSExport] Host.Check`. Marker-Owner `klonk-check`; Laufzeitfehler als
  Marker `klonk-runtime` mit Meldung, „Zur Zeile“ im Fehlerkasten (`KlonkEditor.revealLine`). Projekt-Bibliotheken gehen mit (Prop `files`).
- **Monaco-Modelle:** eines je Sprache mit Dateiendung (`file:///__klonk/<n>/program.ts`, im Projekt `file:///<pfad>`) – der TS-Dienst erkennt TS/JS an der Endung.
- **Code in voller Breite** (`focus`, vom User so gewünscht – kein Browser-Vollbild): Projekt/Welt aus, Ausgabe kompakt unter dem Editor.
  Rechts Tabs **Welt | Doku** (`LanguageDocs.vue`: Kurzreferenz je Sprache aus den Tabellen, Link `public.docsUrl`); Ausführen zeigt die Welt.
- **Navigation:** Projekte · Programmieren · Lernen (`/learn`) · Kleiderschrank (`/designs`, Designs des Projekts) · Welt.
- **Lernmodule** (vom User so festgelegt: Aufgabenmodus in der App, thematisch gegliedert, zuerst Grundkurs Klonk-Script; **Speicherung in der
  Klonk Cloud, Freigabe je Gruppe, Lernstand für die Gruppenleitung**): Daten in `@klonk/learn` (Texte de/en als Markdown im Paket, nicht in i18n),
  Seiten `/learn`, `/learn/<modul>`, `/learn/<modul>/<aufgabe>` (`key: fullPath`; `?project=<id>&name=…&back=…` = Programm einer anderen
  Person nur lesen), `/learn/groups/<id>` (Freigabe + Lernstand). Jedes gestartete Modul = **eigenes Cloud-Projekt** (`cloud_projects.learn_module`,
  eindeutig je Konto), Projektart Klonk-Script & Blöcke. **Je Aufgabe ein Ordner** (vom User so festgelegt) `1 Zur Marke/` mit `Aufgabe.md`,
  `Welt[ n].klonkworld.json` und `Programm.blocks|klonk` (`taskFolderFiles`, legt der Server beim Start an); Manifest `klonk.json`
  `{ language: 'klonk', learn: { module, tasks: { id: '<ordner>/Programm' }, languages, solved } }` (`packages/learn/src/project.ts`);
  Projekte ohne `tasks`-Eintrag (erste Fassung, Programme im Wurzelordner) zieht die Lernansicht beim Öffnen um (`ensureTaskFolder`).
  Freigabe in `group_learn_modules` mit **Sprachvorgabe je Gruppe und Modul** (`languages`: both|blocks|klonk; Lernende bekommen die Vereinigung
  ihrer Gruppen, `LearnStatus.languages`). Startbar (`klonk.can_start_learn_module`): Privatkonten und Lehrkräfte/Admins alle (beide Sprachen),
  Lernende nur in einer ihrer Gruppen freigegebene; **ohne Cloud keine Lernmodule** (`requireCloud`). Gruppenleitung liest
  Modulprojekte ihrer Mitglieder nur für freigegebene Module (`klonk.leads_learner` in `can_read_cloud_project` + Policy), `learn_module` lässt sich
  per UPDATE nicht ändern. Server: `apps/app/server/utils/learn.ts` (`/api/learn`, `/api/learn/modules/:id/start`, `/api/learn/groups/:id[/modules]`),
  Lernstand = aus `klonk.json` + Aufgabendateien (`progressFromFiles`). Prüfung im Browser (Status „gelöst“ ist nicht fälschungssicher).
  Zielzustand = Ergebnis der **Musterlösung** in jeder Startwelt (`expectedOutcomes`); geprüft wird je Aufgabe nur, was `check` verlangt
  (Position/Richtung/Felder/Zahlen der Ausgabe) + `requires` am Syntaxbaum. Nutzerprogramme laufen beim Prüfen headless im Runner-Worker mit
  `delay: 0` und 5-s-Zeitlimit (`utils/learn-check.ts`). Musterlösung sichtbar nach dem Lösen, für Rolle ≠ member, Betreiber und Privatkonten.
  Unit-Tests lösen jede Aufgabe mit der Musterlösung (de/en) in allen Welten. **Aufgaben, Lösungen und Lehrkraft-Hinweise nie in die öffentliche
  Doku** (vom User so festgelegt) – Hinweise für Lehrkräfte zeigt die Modulseite der App nur für Rolle ≠ member bzw. Betreiber.
  Ist das Modulprojekt in der IDE offen, nutzt die Lernansicht dieselbe `CloudProject`-Instanz (`useLearn().open`, sonst zwei Sync-Warteschlangen
  auf einer OPFS-Kopie). IDE: Datei in einem Aufgabenordner ⇒ Leiste „In der Lernansicht prüfen“ (`learnTask` in `pages/index.vue`).
  E2E `e2e/learn.spec.ts` (Konto tom, Gruppe 9c; Programme per Cloud-API in den Aufgabenordner geschrieben).
- **Projektarten** (vom User so festgelegt): Klonk-Script und Blöcke sind **eine** Projektart (`klonk.json` `language: 'klonk'`, alte `'blocks'` ⇒
  `projectLanguage()`), beide Dateiarten erlaubt (`projectAllows`), Name „Klonk-Script & Blöcke“ (`projectLanguageLabel`, `PROJECT_LANGUAGES`).
  Startdatei folgt der zuletzt in der IDE genutzten Sprache. **Programm in einem Ordner mit eigener Welt ⇒ diese Welt laden** (`useProject().select`).
  vue-i18n: `|` in Texten als `{'|'}` schreiben (sonst Pluralform).
- **Laufzeiten versioniert:** `/pyodide|teavm|pylibs|dotnet/<hash>/` (`assetVersion()` in `apps/app/nuxt.config.ts`, Vite-`define`
  `__KLONK_ASSETS__`, `runtime/src/assets.ts`) – sonst lieferten Browser-/PWA-Cache nach einem Neubau alte Dateien (z. B. alter C#-Host).
- **Ohne Lizenz + Projektdateien:** Runner bekommt die Dateien immer, nutzt sie nur mit `allowImports`; Java/C#/Python melden dann `feature_libraries` statt „package/namespace/module not found“.
- **IDE-Layout:** Trenner `SplitHandle` (Zeigen + Pfeiltasten) zwischen Projekt/Code/Welt/Ausgabe, Größen in `klonk:layout` (localStorage), nur ab `lg`. Blockly folgt per `ResizeObserver` (`svgResize`), Container `absolute inset-0`.
- **Einstellungen:** `SettingsForm` (core) unter `/settings` in app und admin (Kontomenü über „Abmelden“): Sprache + Hell/Dunkel/System.
  Angemeldet blendet der Kopf die Schnellschalter aus; Login-Seiten behalten sie. Nuxt-UI-Radius = Standard (kein `--ui-radius`).
- **3D:** `apps/app/app/utils/world-renderer.ts` rendert nur bei Bedarf (`invalidate()`) – Dauer-Rendern blockierte
  Monacos Hintergrund-Tokenizer (Leerlaufzeit) und kostet Akku.
- **3D (Details):** `apps/app/app/utils/world-renderer.ts` (three.js, InstancedMesh, animiert `WorldEvent`s aus `@klonk/world`),
  Komponente `KlonkWorld` nur in `<ClientOnly>` (`.client.vue` + Template-Ref funktionierte nicht).
- **PWA** (`@vite-pwa/nuxt`, nur `apps/app`): Logo/Favicon/Icons aus `assets/brand/*.svg` per `node scripts/gen-icons.ts`
  (rsvg-convert + ImageMagick ⇒ `packages/ui/public`, `apps/app/public/icons`, `apps/docs/public`). Workbox precacht alle
  Assets (Monaco, Modelle, Blockly-Medien, Schriften) + die SPA-Shell `/`; `/`, `/world`, `/projects` laufen mit `ssr: false`
  (Shell ohne Nutzerdaten, `navigateFallback: '/'` mit Allowlist – neue Lern-Seiten dort und in den routeRules ergänzen).
  Offline: `plugins/offline-session.client.ts` merkt den Nutzer (`klonk:offline-user`), `useLicense` die Lizenz
  (`klonk:license`); `useAuth().logout` löscht beides. Service Worker nur im Produktions-Build ⇒ `e2e/pwa.spec.ts` läuft nur
  gegen den Stack (Chromium mit `--ignore-certificate-errors`, sonst registriert sich der SW bei selbst signierten Zertifikaten nicht).
  Lokales Dateisystem über File System Access API (Projektordner öffnen).
- **Auth:** siehe „Konten & Anmeldung“. Schulen und Unternehmen wählen selbst OIDC, LDAP und/oder lokale Konten.
- **Docs-Gliederung** (vom User so festgelegt: die Docs erklären zuerst die Anwendung, Selbsthosten kommt zuletzt): `1.getting-started`
  (Was ist Klonk?, Das erste Programm), `2.world`, `3.klonk-script` (Navigation „Programmieren“; Slug bleibt, `LanguageDocs.vue` verlinkt
  dorthin), `4.teaching` (Übersicht, Lernmodule, Für Schulen, Länder), `5.administration`, `6.self-hosting` (Installation, Quelltext-Lizenz). Interne Links immer mit `/de/` bzw. `/en/`.
- **Unterricht (Docs):** `apps/docs/content/{de,en}/4.teaching/` gegliedert **Land → Bundesland → Schulform → Klasse**
  (`4.germany/3.bavaria/2.gymnasium/N.grade-X.md`, je Ebene `.navigation.yml` + `1.overview.md`). Je Klasse: Lernbereiche mit
  Eignung (★★★/★★/★/–), Link zum Lehrplan-Volltext, Unterrichtsideen; Codebeispiele müssen mit der echten API laufen.
  Ordner alphabetisch nummeriert (`2.baden-wuerttemberg`, `3.bavaria`, `4.hesse`, `5.lower-saxony`, `6.north-rhine-westphalia`,
  `7.saxony`), Stufenbündel als `grade-5-6.md`, Oberstufe `upper-secondary.md`. Bayern: Gymnasium, Realschule (IT modular ⇒
  Anfangs-/Aufbauunterricht), Mittelschule, FOS/BOS (KIT/KIWI ab 2026/27); übrige Länder bisher nur Gymnasium.
  Zielgruppe: Lehrkräfte, Schulleitungen, Kultusverwaltung (Sie-Form, sachlich, Lehrplanbegriffe, keine Werbesprache; vom User so festgelegt); Betrieb/Datenschutz/Lizenz für Schulen in `4.teaching/3.schools.md`.
  Lernmodule in der Doku nur als Übersicht `4.teaching/2.modules/1.overview.md` (Konzept, Modulliste, Lehrplan-Zuordnung – keine Aufgaben/Lösungen); Klassenseiten nennen passende Module (Abschnitt „Passende Lernmodule“).
  Neue Länder/Schulformen ⇒ Tabellen in `4.teaching/1.overview.md`, `4.germany/1.overview.md` (inkl. „Wie das Fach heißt“) und der Landesübersicht ergänzen.
  Marken gibt es nur in vier Farben (gelb/rot/blau/grün) – Beispiele dürfen keine anderen Markenfarben nutzen.
- **Klonk Cloud** (vom User so festgelegt; selbst gehostet immer frei, gehostet Lizenz-Feature `cloud`, `cloudEnabled()`): dritte Projektquelle
  `source: 'cloud'` – `CloudProject` (`utils/cloud-project.ts`) erweitert `Project` um eine lokale Kopie im OPFS (`klonk-cloud/<id>`,
  Zustand `.klonk-sync.json`: Revision, Revision je Datei, Warteschlange) ⇒ offline nutzbar. Schreiben lokal + vormerken, Upload nach 800 ms
  (`PUT /api/cloud/projects/:id/files` mit `baseRevision`), Abholen alle 15 s (`GET …/changes?since=`); Konflikt ⇒ Server gewinnt, eigene
  Fassung als „(Konflikt)“-Kopie. Server: `core/server/utils/cloud.ts` (`writeCloudEntry` sperrt das Projekt per Revision++), Tabellen
  `cloud_projects` (Konto **oder** Gruppe, `assignment_id` = Abgabe), `cloud_files` (Grabsteine für Löschungen), `cloud_assignments`.
  Kontingente `NUXT_CLOUD_USER_QUOTA_MB`/`GROUP_QUOTA_MB` (50/200), Datei ≤ 1 MB (`CLOUD_LIMITS`). Ohne Abo bleibt Lesen möglich.
  **Gruppen** (admin → Gruppen, `groups`/`group_members` mit Rolle `leader`|`member`): Lehrkräfte legen an und werden Leitung, Leitung/Admins
  verwalten, `membersCanWrite` steuert Schreibrecht im gemeinsamen Ordner. **Aufgaben:** Leitung markiert einen Ordner im Gruppenordner
  (`cloud_assignments`), Mitglieder „Aufgabe bearbeiten“ ⇒ eigene Kopie (`startAssignment`), Leitung sieht Abgaben (nur lesen).
  RLS über SECURITY-DEFINER-Helfer (`klonk.group_role`, `can_manage_group`, `leads_group`, `can_read/can_write_cloud_project`);
  Betreiber:innen sehen keine persönlichen Projekte/Abgaben. IDE: `useProject().readOnly` ⇒ Editoren schreibgeschützt.
  E2E: `e2e/cloud.spec.ts` (eigene Browser-Kontexte = eigene Geräte).
- **Datenbanken** (vom User so festgelegt: SQLite + PGlite, Welt ↔ SQL, auch komplexe Datenbanken ohne Welt, API in allen Objekt-Sprachen):
  Engines in `packages/runtime/src/db/` (`sqlite.ts` = `@sqlite.org/sqlite-wasm` oo1 im Speicher, `postgres.ts` = PGlite + `pg_dump`), gemeinsame
  Schnittstelle `SqlEngine` (`script` = mehrere Anweisungen, `query` = eine mit Parametern, `dump`, `tables`, SQLite `exportFile`). Alle laufen im
  **Datenbank-Worker** (`@klonk/runtime/db-worker?worker`, Client `DatabaseClient`/`DatabaseSession` in `db/client.ts`). Projektdatenbanken sind
  **SQL-Text**: `name.sqlite.sql` / `name.postgres.sql` (Dateiart `database`), `.sql` = Abfrage (Dateiart `sql`); `useDatabases()` lädt sie bei Bedarf,
  sichert nach Änderungen per Dump (600 ms, `proj.writeFile`, an das Projekt der Sitzung gebunden) und vergisst umbenannte/gelöschte Dateien.
  IDE: `DatabaseEditor` (Tabellen + Konsole), `SqlConsole` (Ziel: Projektdatenbank oder `world:sqlite|postgres`, Strg+Enter, Vorschläge über `sqlSchemas` in `utils/monaco.ts`).
  **Welt als Datenbank** (`db/world.ts`): Tabellen in UI-Sprache (`welt`, `figuren`, `ziegel(x, y, ebene, farbe)`, `marken`, `quader` bzw. englisch), 1-basiert,
  Werte lokalisiert, CHECK-Bedingungen; Änderungen ⇒ `sqlToWorld` (`WorldTableError`-Codes ⇒ `database.worldErrors.*`), „Als Startwelt speichern“.
  **Programme** (JS/TS/Python/Java/C#, nicht Klonk-Script/Blöcke): `Database.open(name)` / `Database.memory(engine)`, `query`, `queryOne`, `execute`, `tables`;
  synchron über `db/channel.ts` (Worker postet `{ type: 'db' }`, wartet per Atomics.wait auf JSON im eigenen SAB, `ProgramRunner.onDatabase` ⇒ `useDatabases().answer`).
  Python/Java/C# nutzen `api.db.json` (SQL-Fehler als `{ sqlError }` ⇒ eigene `DatabaseError`/`DatabaseException`), Java `klonk.Database/Row/DatabaseException`
  (`src/java/lib`), C# in `RobotApi.txt` (Newtonsoft). Fallen: sqlite-wasm `getColumnNames()` wirft ohne Spalten (⇒ `columnCount`); pg_dump setzt `search_path`
  leer (⇒ `RESET search_path`) und braucht `--inserts` (COPY ist nicht wieder einlesbar); Browser-javac kennt `Throwable.getMessage()` nicht (eigene Methode);
  C#-`switch`-Ausdruck mit JToken-Armen packt Werte implizit wieder ein (Arme nach `object` casten). Runtime-Tests beantworten Anfragen synchron
  (`tests/db-host.ts`, sonst blockiert Atomics.wait den einzigen Thread). PGlite/pg_dump (~15 MB) nicht im PWA-Precache, `CacheFirst` bei Bedarf.
  E2E: `e2e/databases.spec.ts`.
- **Diagramme** (vom User so festgelegt: automatisch aus dem Code bzw. der Datenbank): Paket `@klonk/diagrams` (ELv2) = Modell (`model.ts`),
  Auswertung je Sprache (`languages/*.ts`: Klonk-Script über den eigenen Parser, JS/TS/Python/Java mit **Lezer** – fehlertolerant, beim Tippen;
  C# über Roslyn `Host.Outline` in `packages/csharp/Outline.cs`, Anfrage `outline` an den Prüf-Worker, `outlineCSharp()`), Layout mit **dagre**,
  SVG-Ausgabe als Text (`render/*`, alle Texte per `escapeXml`, Elemente mit `data-line`/`data-class`/`data-path`/`data-table` für Klicks).
  **Struktogramm** (DIN 66261) für alle Sprachen, aktive Zeile hervorgehoben; **Klassendiagramm** (`classRelations()`: Vererbung, Implementierung,
  Assoziationen aus Attributtypen, `*` bei Listen, Klonk/Database als Bibliotheksklasse) je Datei oder Projekt; Typen ohne Angabe aus der
  Zuweisung geraten (`self.x = 0` ⇒ int). **Objektdiagramm** aus dem Speicherabbild `HeapSnapshot` im `paused`-Ereignis (`RunnerSnapshot.heap`):
  JS `jsHeap()` (`runtime/src/heap.ts`, Methoden bekommen `this` als Variable), Python `_klonk_heap(frame)` im Vorspann, Java ohne Reflection:
  Instrumentierer lässt eigene Klassen `__Inspect` implementieren (`__klonkInspect()` meldet `__cls`/`__f`, `super.…` bei eigenen Oberklassen,
  `javaClassNames()`), JSON aus `Debug.java` über `Klonk.API.heap`; C# per Reflection (`Heap.Build` in `RobotApi.txt`, Delegat `klonk.heap`,
  Instrumentierung setzt `this`). Grenzen `HEAP_LIMITS` (60 Objekte, 30 Felder). **ER-Diagramm** (`erModel()`): `SqlTable.foreignKeys` +
  `unique` aus `pragma_foreign_key_list`/`pg_constraint`; Fremdschlüssel ⇒ 1:n (UNIQUE ⇒ 1:1), Zwischentabelle (PK = zwei FKs) ⇒ n:m;
  Darstellungen Chen 1:n, Chen (min,max), Krähenfuß, Relationenschema. App: Tab **Diagramm** (`DiagramPanel.vue`, bleibt beim Ausführen offen),
  `DiagramView.vue` (Zoom, Export SVG/PNG immer hell, Farben aus `--ui-*` als feste Werte – SVG-Attribute kennen kein `var()`), `ErDiagram.vue`
  im `DatabaseEditor` (Tabs SQL | ER-Diagramm). Tests: `packages/diagrams/tests`, Heap-Tests in runtime (`heap.test.ts`, Python/Java mit
  „sofort weiter“ beim Anhalten), E2E `e2e/diagrams.spec.ts`. Docs `3.klonk-script/12.diagrams.md`.
- **KI-Assistent** (vom User so festgelegt): Tab **KI** neben Welt | Doku (`AiChat.vue`, `useAi()`), „Fehler erklären“
  im Fehlerkasten, Codeblöcke „Einfügen“/„Alles ersetzen“ (`KlonkEditor.insertText/replaceAll`, rückgängig machbar) nur bei voller Hilfe.
  **Tutor-Modus:** Lernende (`role member`) bekommen je nach Einstellung nur Hinweise, Lehrkräfte/Admins/Betreiber immer volle Hilfe.
  Einstellung pro Organisation (admin → KI-Assistent, Tabelle `organization_ai_settings`, Schlüssel AES-verschlüsselt, Mitglieder lesen,
  nur Admins ändern) oder `inherit` ⇒ Instanz-Standard `NUXT_AI_*` (`runtimeConfig.ai`, gilt auch für Privatkonten). Modi:
  - `webllm`: **immer kostenlos** (ohne Lizenz), `@mlc-ai/web-llm` nur im Worker `app/workers/webllm.ts` (~6 MB, nicht im PWA-Precache),
    Gewichte von Hugging Face, WebGPU nötig. Springt auch als Ersatz ein (`notice`: `license` | `quota` | `daily`).
  - `server` = **eigener Anbieter (BYOK)**, braucht Feature `ai`: `provider` `openai` (OpenAI-kompatibel: OpenAI, Gemini, Mistral, Ollama …,
    Vorlagen `AI_PROVIDER_PRESETS`) oder `anthropic` (nativ `/messages`). Mehrere Modelle (`models: {id, access: all|teachers}[]`).
  - `platform` = **Klonk-KI** (nur gehostete Plattform = Instanz-Feature `hosted`): Credits (1 Credit ≈ 1 Cent, intern Tausendstel,
    `aiCostMillicredits`). Monatskontingent = Lizenz-Claim `aiCredits` (Organisation bzw. Privat-Abo; `scripts/sign-license.ts --ai-credits`),
    dann nachgekaufte Credits (`ai_credit_grants`). **Hartes Limit** ⇒ danach WebLLM. Endpunkte/Schlüssel des Betreibers
    `NUXT_AI_PLATFORM_PROVIDERS` (JSON `{ key: { provider, baseUrl, apiKey } }`), Modelle + Preise per Abgleich von klonk.*
    (`instance_settings.ai_models`, Fallback `NUXT_AI_PLATFORM_MODELS`), `premium` ⇒ standardmäßig nur Lehrkräfte.
  - Tageslimits für Lernende (`studentDailyRequests`, `studentDailyCredits`), Verbrauch ohne Inhalte in `ai_usage` (schreibt nur der Server per
    `useSystemDb`, RLS: Admin sieht Organisation, Nutzer sich selbst), Übersicht `AiUsage.vue` + `/api/admin/organization/ai-usage`.
  `getAiConfig()` in `core/server/utils/ai.ts` entscheidet alles (Quelle, Lizenz, Limits, Modell); `/api/ai/chat` (app) setzt den Systemprompt
  (`aiSystemPrompt()`), streamt (`fetchAiChat` + `aiTextStream`, Verbrauch über `stream_options.include_usage` bzw. Anthropic-Events, sonst
  geschätzt) und speichert danach `recordAiUsage()`. **Abgleich mit klonk.*** (`core/server/utils/ai-sync.ts`, im Lizenzabgleich der Verwaltung):
  `GET /api/v1/platform/ai` ⇒ `{ models, grants }`, `POST /api/v1/platform/ai/usage` ⇒ Monats-Summen – die Endpunkte gehören ins private Repo.
  Kontext baut `aiContext()` in `pages/index.vue`; Antworten ohne `v-html` (`utils/ai-markdown.ts`).
  E2E: `e2e/editor-ai.spec.ts` mit `e2e/mock-llm.ts` (OpenAI + Anthropic, Schlüssel `test-key`, fester Verbrauch 1000/50 Tokens; Klonk-KI über
  `NUXT_AI_PLATFORM_*` in `playwright.config.ts`, schaltet die Instanz kurz auf `hosted`). Die App merkt sich die Lizenz 60 s ⇒ Tests pollen `/api/ai/config`.

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
- Produktiver Signierschlüssel gehört in den Secret-Store von klonk-web (`NUXT_LICENSE_SIGNING_KEY`), nie in dieses Repo.
  Tokens manuell ausstellen: Website → Betrieb (oder `node scripts/sign-license.ts --name … --features … --days …`).
- **Lizenzabgleich** (`server/utils/license-sync.ts`, Plugin `apps/admin/server/plugins/license-sync.ts`, alle 6 h, nur admin.*):
  Instanz-Token über `POST <Lizenzserver>/api/v1/license/refresh` verlängern (Lizenzserver = `NUXT_LICENSE_SERVER_URL` oder
  Origin von `NUXT_PUBLIC_SHOP_URL`; aus mit `NUXT_LICENSE_AUTO_REFRESH=false`). Token aus der Env ⇒ verlängertes Token in
  `instance_settings.license_refreshed`, `newerLicenseToken()` wählt (gleiche `sid`, später `exp`). Gehostete Plattform mit
  `NUXT_LICENSE_SERVER_API_KEY`: `GET /api/v1/platform/licenses` ⇒ `organizations.license_token` und `user_licenses`
  (Privat-Abos, nur Privatkonten); Token muss `organizationId` bzw. `userId` des Ziels enthalten.
  `getEffectiveLicense(orgId, userId)` wertet Privat-Lizenzen aus. `/api/session` liefert `organizationId` für den Shop.
- Proxy: Hauptdomain ⇒ Website, wenn `KLONK_WEBSITE_UPSTREAM` gesetzt (sonst Weiterleitung zur App); eigene Seiten
  des Betriebs als `docker/proxy/sites/*.caddy` (nicht eingecheckt).
- **Code-Lizenz (erledigt, vom User so festgelegt):** MIT für `packages/klonk-script` und `packages/world`, **Elastic License 2.0** für
  die Plattform (apps/*, core, ui, runtime, csharp; Rest des Repos ebenfalls ELv2). Root-`LICENSE` erklärt die Aufteilung, jedes Paket
  hat eine eigene `LICENSE`, `license`-Felder in den package.json (`MIT` / `Elastic-2.0`). Feature-Flags bleiben im selben Code (Schutz
  über ELv2: Umgehen der Token-Prüfung und Hosting für Dritte verboten). Fremdbibliotheken in `THIRD_PARTY_NOTICES.md` – **neue
  mitgelieferte Bibliotheken dort eintragen**. Docs-Seite `6.self-hosting/2.license.md`.
- **Lokaler Testmodus** (vom User so festgelegt): auf `localhost`/`*.localhost`/`127.0.0.1` alles frei (`LOCAL_LICENSE`, Plan `local`,
  Badge „Lokaler Testmodus“) – nur wenn Host-Header **und** der vom Browser gemeldete Hostname (`x-klonk-host`, Plugin
  `00.client-host.client.ts` für `$fetch`, `clientHostHeaders()` für `useFetch`) lokal sind (`isLocalTest(event)`). `getEffectiveLicense`,
  `requireFeature`, `assertUserCapacity` bekommen dafür `event`. Abschalten: `NUXT_LICENSE_LOCAL_MODE=off` bzw. Header `x-klonk-local: off`
  (Playwright setzt ihn global – Lizenztests prüfen echte Grenzen; `e2e/local-mode.spec.ts` testet den Modus).
- KI auf der gehosteten Plattform: KI-Paket mit monatlichen Credits + Nachkauf (siehe KI-Assistent); Preise/Pakete nur auf klonk.*.
- Offen: weitere Bezahlfunktionen.

## Roadmap (Status pflegen!)

1. [x] Monorepo-Gerüst: App, Docs, Postgres/Drizzle, Auto-Migration, Docker, i18n, E2E-Tests
2. [x] Layer `@klonk/ui` + `@klonk/core`, Admin-App, Organisationen, Rollen, RLS, lokale Konten, Passwort-Reset
2b. [x] OIDC + LDAP pro Organisation (Login-Flows, Verbindungstest, JIT-Provisionierung, Rollen aus Gruppen)
2c. [x] Privatkonten: OAuth-Anbieter (Google, Microsoft, GitHub, Apple); Klonk ID (Authentik) nur für Betreiber
2d. [x] Zentrale Anmeldung `auth.klonk.*` (Single Sign-on für app, admin, Website)
2e. [x] Mitgelieferter Proxy (Caddy, TLS: internal/HTTP-01/IONOS-DNS/off) + lokaler Komplett-Stack `*.klonk.localhost`
3. [x] Lizenz-Token-Prüfung + Free-Tier-Limits (Nutzergrenze, OIDC; Figuren/Modelle/Bibliotheken/KI als Flags für spätere Schritte)
4. [x] 3D-Welt (three.js): Boden, Ziegel, Marken, Quader, Figuren-Animation, Welt-Editor `/world` (Bearbeiten/Ausprobieren, JSON-Dateien)
5. [x] Blender-Modelle: Figuren (m/w/d) + Ziegel/Platte/Fliese, glTF (`assets/blender/build_models.py`)
5b. [ ] Advanced Mode: verschiedene Steintypen im 4×4-Raster (1×1, 1×2, 2×2, Platten, Schrägen …)
6. [x] Klonk-Script: Lexer/Parser/Interpreter (Worker), Monaco-Sprache, Autocomplete, Hover, Live-Fehler, Debugger (Breakpoints, Einzelschritt, Pause, Variablen), de/en + Übersetzen
7. [x] JS/TS-Ausführung im Worker mit Debugging (synchron via SharedArrayBuffer/Atomics, acorn-Instrumentierung, sucrase, Monaco-TS mit Roboter-API-.d.ts)
8. [x] Blöcke (Blockly ⇒ Klonk-Script, Debugger am Block, Haltepunkte per Rechtsklick, de/en)
9. [x] Lokales Dateisystem: Projektordner (File System Access API) + Browser-Projekte (OPFS), Explorer, Autosave, Welten, Bibliotheken
10. [x] PWA (Logo, Favicon, Offline)
11. [x] KI-Assistent (schuleigenes LLM / WebLLM, Tutor-Modus, Fehler erklären, Code übernehmen)
12. [x] Weitere Sprachen: Python (Pyodide), Java (TeaVM), C# (Roslyn/.NET-WASM)
13. [x] Klonk Cloud: Projekte synchronisieren (offline-fähig), Gruppen mit gemeinsamem Ordner, Aufgaben + Abgaben
14. [x] Datenbanken: SQLite + PostgreSQL (PGlite) im Browser, SQL-Konsole, Welt als Datenbank, Datenbank-API in JS/TS/Python/Java/C#
14b. [ ] ER-Modellierung (Diagramm zeichnen ⇒ Tabellen), MySQL-Dialekt
15. [x] Diagramme: Struktogramm, Klassen- und Objektdiagramm aus dem Code, ER-Diagramm aus der Datenbank
15. [x] Lernmodule: Grundkurs Klonk-Script (6 Module, 20 Aufgaben, automatische Prüfung, Cloud-Projekt je Modul, Freigabe je Gruppe, Lernstand)
15b. [ ] Lernmodule für Python/Java (Objekte, Klassen)
