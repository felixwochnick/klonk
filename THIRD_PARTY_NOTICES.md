# Drittanbieter-Hinweise / Third-party notices

Klonk liefert die folgenden Fremdbibliotheken mit bzw. lädt sie im Browser von der eigenen Origin.
Ihre Lizenzen gelten unverändert; die Lizenztexte liegen den Paketen bei (`node_modules/<paket>/LICENSE`,
`packages/runtime/teavm`, `packages/runtime/pylibs`, NuGet-Pakete) bzw. unter den angegebenen Adressen.

Klonk ships the following third-party software or serves it to the browser from its own origin.
Their licenses apply unchanged; the license texts are included with the packages or available at the given addresses.

## Im Browser ausgeliefert / served to the browser

| Komponente / component | Version | Lizenz / license | Quelle / source |
|---|---|---|---|
| Vue, Nuxt | 3 / 4.6 | MIT | https://github.com/nuxt/nuxt |
| Nuxt UI | 4.12 | MIT | https://github.com/nuxt/ui |
| @nuxtjs/i18n | 10.6 | MIT | https://github.com/nuxt-modules/i18n |
| Tailwind CSS | 4.3 | MIT | https://github.com/tailwindlabs/tailwindcss |
| Monaco Editor | 0.57 | MIT | https://github.com/microsoft/monaco-editor |
| TypeScript (in Monaco) | – | Apache-2.0 | https://github.com/microsoft/TypeScript |
| Blockly | 13.4 | Apache-2.0 | https://github.com/google/blockly |
| three.js | 0.187 | MIT | https://github.com/mrdoob/three.js |
| acorn | 8.19 | MIT | https://github.com/acornjs/acorn |
| magic-string | 1.4 | MIT | https://github.com/rich-harris/magic-string |
| sucrase | 3.35 | MIT | https://github.com/alangpierce/sucrase |
| java-parser | 3.0 | Apache-2.0 | https://github.com/jhipster/prettier-java |
| zod | 4.6 | MIT | https://github.com/colinhacks/zod |
| Pyodide (inkl. CPython) | 314.0.7 | MPL-2.0 (CPython: PSF-2.0) | https://github.com/pyodide/pyodide |
| Jedi | 0.20.1 | MIT | https://github.com/davidhalter/jedi |
| typeshed (in Jedi) | – | Apache-2.0 | https://github.com/python/typeshed |
| Parso | 0.8.7 | MIT | https://github.com/davidhalter/parso |
| teavm-javac (TeaVM) | playground 3 | Apache-2.0 | https://github.com/konsoletyper/teavm-javac |
| OpenJDK javac (in teavm-javac) | – | GPL-2.0 with Classpath Exception | https://openjdk.org |
| .NET Runtime (WebAssembly) | 10 | MIT | https://github.com/dotnet/runtime |
| Roslyn (Microsoft.CodeAnalysis.CSharp) | 4.14 | MIT | https://github.com/dotnet/roslyn |
| Workbox (über @vite-pwa/nuxt) | 7 | MIT | https://github.com/GoogleChrome/workbox |
| Lucide Icons | – | ISC | https://github.com/lucide-icons/lucide |
| Simple Icons | – | CC0-1.0 | https://github.com/simple-icons/simple-icons |
| Nunito (Schrift / font) | – | SIL OFL-1.1 | https://github.com/googlefonts/nunito |

## Server

| Komponente / component | Version | Lizenz / license | Quelle / source |
|---|---|---|---|
| Nitro / h3 | – | MIT | https://github.com/nitrojs/nitro |
| nuxt-auth-utils | 0.6 | MIT | https://github.com/atinux/nuxt-auth-utils |
| drizzle-orm | 0.45 | Apache-2.0 | https://github.com/drizzle-team/drizzle-orm |
| postgres (postgres.js) | 4.0 | Unlicense | https://github.com/porsager/postgres |
| openid-client | 6.8 | MIT | https://github.com/panva/openid-client |
| jose | 6.2 | MIT | https://github.com/panva/jose |
| ldapts | 9.2 | MIT | https://github.com/ldapts/ldapts |
| Docus (Docs) | 5.15 | MIT | https://github.com/nuxt-content/docus |
| better-sqlite3 (Docs) | 13.0 | MIT | https://github.com/WiseLibs/better-sqlite3 |
| Caddy (Proxy-Image) | 2 | Apache-2.0 | https://github.com/caddyserver/caddy |
| PostgreSQL (Image) | – | PostgreSQL License | https://www.postgresql.org |

Indirekte Abhängigkeiten der npm-Pakete stehen mit ihren Lizenzen in `node_modules` (z. B. `pnpm licenses list`).
Transitive npm dependencies and their licenses are listed in `node_modules` (e.g. `pnpm licenses list`).
