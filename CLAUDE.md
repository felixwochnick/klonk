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
| `packages/runtime` | `@klonk/runtime` | **Ausführung**: Worker (`@klonk/runtime/worker?worker`), sprachunabhängiges Protokoll (`protocol.ts`), `ProgramRunner` (Hauptthread, spielt Roboterbefehle auf der angezeigten Welt nach); JS/TS in `src/js/` | – |
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
  Sensoren sind Methoden; dazu `print`, `wait` (Java `sleep`), `random` und Farben. **Alles nur per Import** (vom User so festgelegt):
  JS/TS `import { Klonk } from 'klonk'`, Python `from klonk import Klonk`, Java `import klonk.Klonk;` (+ `import static klonk.Klonk.*;`),
  C# `using klonk;` (+ `using static klonk.Klonk;`). **Klonk-Script und Blöcke steuern immer nur eine Figur** (`wähleFigur`), ohne Import.
  Gemeinsame Basis `createApi()` in `runtime/src/js/api.ts` (`robot()`, `names()`, `globals`, `ROBOT_METHODS`, `onError`).
  - JS/TS: `js/modules.ts` schreibt `import`/`export` zeilentreu in `__klonk_import`/`__klonk_export` um (Exporte als Getter vorne,
    `export *` über Proxy-Namespace); `"klonk"` = API-Modul, relative Pfade = Projektdateien (Lizenz `libraries`, ohne Prüfpunkte).
    Monaco: `declare module 'klonk'` in `js-api-types.ts`.
  - Python: Modul `klonk` per `sys.modules` im Vorspann (JS-Brücke `_klonk_js`), Projektdateien mit Ordnern (Pakete), Ordner der Hauptdatei in `sys.path`.
  - Java: `klonk.Klonk` + Debugger-Klasse `klonk.Debug` (unsichtbarer Import `import static klonk.Debug.*;` in Zeile 1, `__cp` unqualifiziert –
    eine Variable `klonk` würde `klonk.X` verdecken). Browser-javac kann **keine Unterordner** in Dateinamen ⇒ alle Dateien flach nach Klassenname;
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
  Variablen erst beim Anhalten (`repr`). Roboter-API aus `createApi()` als **Builtins** nur in snake_case
  (`is_wall`, `turn_left`; gleiche Regel wie `pythonName()` in `useProgram.ts`), `print` bleibt Pythons eigenes.
  API-Fehler kommen in Python als `JsException` an ⇒ zuletzt geworfener `ApiError` wird gemerkt und übersetzt. Projekt-`.py`-Dateien
  nur mit Lizenz (`libraries`) importierbar. Unit-Tests laufen mit Pyodide in Node (`tests/python.test.ts`, Loader injizierbar).
  Monaco: Python-Syntax eingebaut, Vervollständigung/Hover der API in `utils/monaco.ts` (`registerPython`).
- **Java** (`packages/runtime/src/java/`): [teavm-javac](https://github.com/konsoletyper/teavm-javac) (javac + TeaVM als WebAssembly,
  Apache 2.0) liegt mit Prüfsummen in `packages/runtime/teavm/` (`node scripts/fetch-teavm-javac.ts`, Quelle teavm.org/playground/3/),
  Auslieferung per Nitro-`publicAssets` unter `/teavm/`, PWA-Cache bei Bedarf. Ablauf im Worker: `instrument.ts` (java-parser-CST,
  nur Einfügungen) setzt vor jede Anweisung `if (klonk.Robot.__cp(zeile)) { __v("x", x)…; __pause(); }` und klammert Rümpfe von
  Schleifen/if; `import static klonk.Robot.*;` kommt in Zeile 1. `robot.ts` = Java-Klasse `klonk.Robot`, ruft per **JSO-Schnittstellen**
  `window.klonk` (Worker setzt `window = globalThis`). **Wichtig:** Dieser Browser-javac stürzt bei `@JSBody` und eigenen Annotationen
  ab („cyclic inheritance … Annotation“/Stack-Überlauf) – nur `@JSProperty` + JSO-Interfaces nutzen. Compiler als **Bytes** an den
  TeaVM-Loader geben (bei URL nimmt er wegen `process` im Vite-Worker Node an). Dateinamen beim Compiler flach (`Robot.java`, nicht
  `klonk/Robot.java`). Farben als `RED`…, `wait` ⇒ `sleep` (sonst verdeckt `Object.wait()` den statischen Import).
  Unit-Tests kompilieren echt in Node (`tests/java.test.ts`).
- **C#** (`packages/csharp/` = .NET-Projekt, `packages/runtime/src/csharp/run.ts`): Host (`Host.cs`, `[JSExport] Run`) kompiliert
  mit Roslyn, instrumentiert per **semantischem Modell** (Prüfpunkte wie Java, Variablen = `DefinitelyAssignedOnEntry` ∩
  `LookupSymbols` ∩ gleiche Methode, keine ref/ref-struct) und führt per `Assembly.Load` aus. Roboter-API `RobotApi.txt`
  (PascalCase, `Red`…) wird als Quelltext mitkompiliert und ruft über Delegaten in `AppDomain`-Daten → `[JSImport]`-Funktionen.
  Implizite Usings + `using static Klonk.Robot` als eigene Datei mit `global using`. Build: `node scripts/build-csharp.ts`
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
- **Monaco-Modelle:** eines je Sprache mit Dateiendung (`file:///klonk/<n>/program.ts` …) – der TS-Dienst erkennt TS/JS an der Endung.
- **Vollbild-Code:** `focus` in `index.vue` (fixed über dem Kopf + Browser-Fullscreen-API), Ausgabe kompakt unter dem Editor.
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
- **Code-Lizenz (erledigt, vom User so festgelegt):** MIT für `packages/klonk-script` und `packages/world`, **Elastic License 2.0** für
  die Plattform (apps/*, core, ui, runtime, csharp; Rest des Repos ebenfalls ELv2). Root-`LICENSE` erklärt die Aufteilung, jedes Paket
  hat eine eigene `LICENSE`, `license`-Felder in den package.json (`MIT` / `Elastic-2.0`). Feature-Flags bleiben im selben Code (Schutz
  über ELv2: Umgehen der Token-Prüfung und Hosting für Dritte verboten). Fremdbibliotheken in `THIRD_PARTY_NOTICES.md` – **neue
  mitgelieferte Bibliotheken dort eintragen**. Docs-Seite `1.getting-started/2.license.md`.
- Offen: weitere Bezahlfunktionen, Abos für Privatkonten auf der gehosteten Plattform.

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
11. [ ] KI-Assistent (schuleigenes LLM / WebLLM)
12. [x] Weitere Sprachen: Python (Pyodide), Java (TeaVM), C# (Roslyn/.NET-WASM)
