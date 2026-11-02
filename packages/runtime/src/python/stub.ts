import { BUILTINS, type Builtin, type BuiltinName, type ScriptLanguage } from '@klonk/klonk-script'
import { ROBOT_METHODS } from '../js/api'

const snake = (name: string) => name.replace(/(?<=[a-z0-9])([A-Z])/g, m => `_${m.toLowerCase()}`)
const RETURNS: Partial<Record<BuiltinName, string>> = { brickCount: 'int', positionX: 'int', positionY: 'int', random: 'int' }
const doc = (text: string, indent: string) => `${indent}"""${text.replace(/"""/g, '\'\'\'').replace(/`/g, '')}"""`

/**
 * Python-Stub des Moduls `klonk` für Jedi (Vorschläge/Erklärungen im Editor) – gleiche Namen wie im
 * Vorspann (`prelude.ts`), Dokumentation aus den Klonk-Script-Tabellen in der UI-Sprache.
 */
export function pythonStub(lang: ScriptLanguage) {
  const de = lang === 'de'
  const lines = [
    doc(de ? 'Roboter-API von Klonk' : 'Klonk robot API', ''),
    '',
    'class Klonk:',
    doc(de ? 'Eine Figur der Welt: Klonk() ist die erste, Klonk("Klara") die mit diesem Namen, Klonk(2) die zweite.' : 'A character in the world: Klonk() is the first, Klonk("Klara") the one with this name, Klonk(2) the second.', '    '),
    '',
    '    name: str',
    doc(de ? 'Name der Figur' : 'Name of the character', '    '),
    '',
    '    def __init__(self, name: str | int | None = None) -> None:',
    '        self.name = ""',
    '',
    '    @staticmethod',
    '    def all() -> list["Klonk"]:',
    doc(de ? 'Alle Figuren der Welt' : 'All characters in the world', '        '),
    '        return []',
    '',
    '    @staticmethod',
    '    def create(name: str, look: str | None = None, x: int | None = None, y: int | None = None) -> "Klonk":',
    doc(BUILTINS.createCharacter.doc[lang], '        '),
    '        return Klonk()',
  ]
  for (const name of ROBOT_METHODS) {
    const builtin: Builtin = BUILTINS[name]
    const params = (builtin.params ?? []).map((p) => {
      const param = snake(p.name.en[0]!)
      if (p.type === 'number') return `${param}: int = 1`
      if (p.type === 'color' || p.type === 'markColor') return `${param}: str = ${p.type === 'color' ? '"red"' : '"yellow"'}`
      return `${param}: str`
    })
    const returns = builtin.kind === 'sensor' ? (RETURNS[name] ?? 'bool') : 'None'
    lines.push('', `    def ${snake(name)}(${['self', ...params].join(', ')}) -> ${returns}:`, doc(builtin.doc[lang], '        '), `        ${returns === 'None' ? 'pass' : `return ${returns}()`}`)
  }
  lines.push(
    '',
    'def load_design(name: str) -> dict:',
    doc(de ? 'Design des Projekts als dict (Lizenz)' : 'Design of the project as a dict (license)', '    '),
    '    return {}',
    '',
    'def save_design(name: str, design: dict | str) -> None:',
    doc(de ? 'Design ins Projekt speichern (Datei name.klonkdesign.json, Lizenz)' : 'Save a design to the project (file name.klonkdesign.json, license)', '    '),
    '    pass',
    '',
  )
  for (const name of Object.keys(BUILTINS) as BuiltinName[]) {
    const builtin: Builtin = BUILTINS[name]
    if (builtin.kind === 'constant') lines.push(`${name} = ${JSON.stringify(name)}`, doc(builtin.doc[lang], ''))
    else if (name === 'wait') lines.push('', 'def wait(seconds: float = 1) -> None:', doc(builtin.doc[lang], '    '), '    pass')
  }
  return `${lines.join('\n')}\n`
}
