# teavm-javac (Java-Compiler im Browser)

Diese Dateien stammen aus [teavm-javac](https://github.com/konsoletyper/teavm-javac) von Alexey Andreev
(Build der TeaVM-Playground-Seite `https://teavm.org/playground/3/`), Lizenz **Apache 2.0**.
Sie enthalten den Java-Compiler aus OpenJDK (GPLv2 mit Classpath Exception, unverändert als Bytecode
mitkompiliert) und TeaVM.

Laden/Aktualisieren mit Prüfsummen: `node scripts/fetch-teavm-javac.ts`.
Die App liefert sie unter `/teavm/` aus (`apps/app/nuxt.config.ts`), geladen im Worker (`src/java/run.ts`).
