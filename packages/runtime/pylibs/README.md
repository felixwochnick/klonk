# Python-Bibliotheken für den Editor

- [Jedi](https://github.com/davidhalter/jedi) 0.20.1 – Autovervollständigung und Erklärungen für Python, Lizenz **MIT**
  (enthält Typeshed-Stubs, Apache 2.0).
- [Parso](https://github.com/davidhalter/parso) 0.8.7 – Python-Parser für Jedi, Lizenz **MIT**.

Reine Python-Wheels von PyPI, geladen mit Prüfsummen: `node scripts/fetch-jedi.ts`.
Die App liefert sie unter `/pylibs/` aus (`apps/app/nuxt.config.ts`); der Prüf-Worker (`src/check.ts`) entpackt sie
in sein Pyodide. Ausgeführte Programme nutzen sie nicht.
