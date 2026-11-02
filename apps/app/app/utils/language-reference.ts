import { BUILTINS, KEYWORDS, spell, type Builtin, type BuiltinName, type Keyword } from '@klonk/klonk-script'

// Kurzreferenz einer Sprache (Doku-Tab, Kontext für den KI-Assistenten): Import, Figuren, Befehle, Farben, Ausgabe.
// Erzeugt aus denselben Tabellen wie Klonk-Script und die Vorschläge im Editor.

export type LanguageStyle = { method: (name: string) => string, color: (name: string) => string, wait: string, create: string, all: string, newKlonk: string, imports: string, output: string, name: string }

const camel = (name: string) => name
const STYLES: Partial<Record<ProgramLanguage, LanguageStyle>> = {
  javascript: { method: camel, color: camel, wait: 'wait(seconds)', create: 'Klonk.create("Kim", "female", x, y)', all: 'Klonk.all()', newKlonk: 'new Klonk("Klara")', imports: 'import { Klonk, red, wait } from \'klonk\'', output: 'console.log(…)', name: 'klonk.name' },
  typescript: { method: camel, color: camel, wait: 'wait(seconds)', create: 'Klonk.create("Kim", "female", x, y)', all: 'Klonk.all()', newKlonk: 'new Klonk("Klara")', imports: 'import { Klonk, red, type KlonkColor } from \'klonk\'', output: 'console.log(…)', name: 'klonk.name' },
  python: { method: pythonName, color: camel, wait: 'wait(seconds)', create: 'Klonk.create("Kim", "female", x, y)', all: 'Klonk.all()', newKlonk: 'Klonk("Klara")', imports: 'from klonk import Klonk, red, wait', output: 'print(…)', name: 'klonk.name' },
  java: { method: camel, color: n => n.toUpperCase(), wait: 'sleep(seconds)', create: 'Klonk.create("Kim", "female", x, y)', all: 'Klonk.all()', newKlonk: 'new Klonk("Klara")', imports: 'import klonk.Klonk;\nimport static klonk.Klonk.*;', output: 'System.out.println(…)', name: 'klonk.name' },
  csharp: { method: csharpName, color: csharpName, wait: 'Wait(seconds)', create: 'Klonk.Create("Kim", "female", x, y)', all: 'Klonk.All()', newKlonk: 'new Klonk("Klara")', imports: 'using klonk;\nusing static klonk.Klonk;', output: 'Console.WriteLine(…)', name: 'klonk.Name' },
}

const SCRIPT_KEYWORDS: Keyword[] = ['repeat', 'times', 'while', 'until', 'if', 'then', 'else', 'end', 'procedure', 'function', 'return', 'var', 'import']

export function languageReference(language: ProgramLanguage, lang: 'de' | 'en') {
  const style = STYLES[language]
  const isScript = language === 'klonk' || language === 'blocks'

  /** Befehle und Sensoren mit Parametern in der Schreibweise der Sprache */
  const commands = (Object.entries(BUILTINS) as [BuiltinName, Builtin][])
    .filter(([, b]) => b.kind === 'command' || b.kind === 'sensor' || (isScript && b.kind === 'function'))
    .filter(([name]) => isScript || (name !== 'selectCharacter' && name !== 'createCharacter'))
    .map(([name, b]) => {
      const params = (b.params ?? []).map(p => `${isScript ? p.name[lang][0] : style!.method(p.name.en[0]!)}${p.optional ? '?' : ''}`)
      const label = isScript ? spell(name, lang) : style!.method(spell(name, 'en'))
      const call = isScript && !params.length ? label : `${label}(${params.join(', ')})`
      return { name, call: isScript ? call : `klonk.${call}`, doc: b.doc[lang], kind: b.kind }
    })
  const colors = (Object.entries(BUILTINS) as [BuiltinName, Builtin][])
    .filter(([, b]) => b.kind === 'constant')
    .map(([name]) => (isScript ? spell(name, lang) : style!.color(spell(name, 'en'))))
  const keywords = SCRIPT_KEYWORDS.map(k => KEYWORDS[k][lang][0])

  return { style, isScript, commands, colors, keywords }
}

/** Dieselbe Referenz als Text (für den KI-Assistenten) */
export function languageReferenceText(language: ProgramLanguage, lang: 'de' | 'en') {
  const { style, isScript, commands, colors, keywords } = languageReference(language, lang)
  const lines: string[] = []
  if (style) {
    lines.push(`Import:\n${style.imports}`)
    lines.push(`Characters: ${style.newKlonk.replace('"Klara"', '')} (first), ${style.newKlonk} (by name), ${style.all}, ${style.create}, ${style.name}`)
  }
  else {
    lines.push(`Klonk-Script (${lang}), keywords: ${keywords.join(', ')}. No imports; controls one character at a time.`)
  }
  lines.push(`${isScript ? 'Commands' : 'Methods'}:\n${commands.map(c => `- ${c.call}: ${c.doc}`).join('\n')}`)
  lines.push(`Colors: ${colors.join(', ')}`)
  if (style) lines.push(`Wait: ${style.wait}; output: ${style.output}`)
  return lines.join('\n\n')
}
