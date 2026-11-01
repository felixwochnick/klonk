// Erzeugt die Befehlsreferenz von Klonk-Script für die Docs aus den Sprachtabellen.
//   node scripts/gen-script-docs.ts
import { writeFileSync } from 'node:fs'
import { BUILTINS, KEYWORDS } from '../packages/klonk-script/src/languages.ts'

type Lang = 'de' | 'en'
const other: Record<Lang, Lang> = { de: 'en', en: 'de' }
const text = {
  de: { title: 'Befehlsreferenz', description: 'Alle Schlüsselwörter und eingebauten Befehle von Klonk-Script.', keywords: 'Schlüsselwörter', command: 'Befehl', keyword: 'Schlüsselwort', also: 'Englisch', meaning: 'Bedeutung', kinds: { command: 'Befehle der Figur', sensor: 'Sensoren (liefern einen Wert)', function: 'Allgemeine Funktionen', constant: 'Farben' }, generated: 'Diese Seite wird aus den Sprachtabellen erzeugt (`scripts/gen-script-docs.ts`).' },
  en: { title: 'Command reference', description: 'All keywords and built-in commands of Klonk-Script.', keywords: 'Keywords', command: 'Command', keyword: 'Keyword', also: 'German', meaning: 'Meaning', kinds: { command: 'Character commands', sensor: 'Sensors (return a value)', function: 'General functions', constant: 'Colors' }, generated: 'This page is generated from the language tables (`scripts/gen-script-docs.ts`).' },
}

const keywordMeaning: Record<string, Record<Lang, string>> = {
  repeat: { de: 'Schleife', en: 'Loop' }, times: { de: 'Anzahl (`wiederhole 3 mal`)', en: 'Count (`repeat 3 times`)' },
  while: { de: 'solange die Bedingung gilt', en: 'while the condition holds' }, until: { de: 'bis die Bedingung gilt', en: 'until the condition holds' },
  forever: { de: 'Endlosschleife', en: 'Endless loop' }, if: { de: 'Bedingung', en: 'Condition' }, then: { de: 'optional nach der Bedingung', en: 'optional after the condition' },
  else: { de: 'Alternative (auch `sonst wenn`)', en: 'Alternative (also `else if`)' }, end: { de: 'Schließt jeden Block', en: 'Closes every block' },
  procedure: { de: 'Eigene Anweisung', en: 'Own procedure' }, function: { de: 'Eigene Funktion mit Rückgabewert', en: 'Own function with return value' },
  return: { de: 'Wert zurückgeben', en: 'Return a value' }, break: { de: 'Schleife verlassen', en: 'Leave the loop' }, continue: { de: 'Nächster Schleifendurchlauf', en: 'Next loop iteration' },
  var: { de: 'Variable anlegen', en: 'Create a variable' }, import: { de: 'Bibliothek einbinden (Lizenz)', en: 'Include a library (license)' },
  and: { de: 'und', en: 'and' }, or: { de: 'oder', en: 'or' }, not: { de: 'nicht', en: 'not' }, true: { de: 'wahr', en: 'true' }, false: { de: 'falsch', en: 'false' },
  stop: { de: 'Programm beenden', en: 'End the program' },
}

for (const lang of ['de', 'en'] as Lang[]) {
  const t = text[lang]
  let md = `---\ntitle: ${t.title}\ndescription: ${t.description}\n---\n\n<!-- ${t.generated} -->\n\n## ${t.keywords}\n\n| ${t.keyword} | ${t.also} | ${t.meaning} |\n|---|---|---|\n`
  for (const [name, spellings] of Object.entries(KEYWORDS)) {
    md += `| \`${spellings[lang].join('` / `')}\` | \`${spellings[other[lang]][0]}\` | ${keywordMeaning[name]![lang]} |\n`
  }
  for (const kind of ['command', 'sensor', 'function', 'constant'] as const) {
    md += `\n## ${t.kinds[kind]}\n\n| ${t.command} | ${t.also} | ${t.meaning} |\n|---|---|---|\n`
    for (const builtin of Object.values(BUILTINS)) {
      if (builtin.kind !== kind) continue
      const params = 'params' in builtin ? builtin.params : []
      const sig = (l: Lang) => params.length ? `${builtin.names[l][0]}(${params.map(p => (p.optional ? `${p.name[l][0]}?` : p.name[l][0])).join(', ')})` : builtin.names[l][0]
      md += `| \`${sig(lang)}\` | \`${sig(other[lang])}\` | ${builtin.doc[lang]} |\n`
    }
  }
  md += `\n::note\n${t.generated}\n::\n`
  writeFileSync(new URL(`../apps/docs/content/${lang}/4.klonk-script/2.reference.md`, import.meta.url), md)
}
console.log('Referenz erzeugt')
