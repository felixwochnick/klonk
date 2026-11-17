import { spell, type ScriptLanguage } from '@klonk/klonk-script'
import { defaultStartWorld } from '@klonk/runtime/live'
import { World } from '@klonk/world'

// Sprachen und Beispielprogramme – gemeinsam für die App und den Server (MCP legt Untergruppen mit denselben Startdateien an)

/** Sprachen in der IDE – Blöcke werden zu Klonk-Script */
export type ProgramLanguage = 'blocks' | 'klonk' | 'javascript' | 'typescript' | 'python' | 'java' | 'csharp'
export const PROGRAM_LANGUAGES: ProgramLanguage[] = ['blocks', 'klonk', 'javascript', 'typescript', 'python', 'java', 'csharp']

/** Projektarten (`klonk.json`): Klonk-Script und Blöcke sind eine Art – beide Dateiarten sind darin erlaubt */
export const PROJECT_LANGUAGES: ProgramLanguage[] = PROGRAM_LANGUAGES.filter(l => l !== 'blocks')

/** Projektart aus `klonk.json` (frühere Blöcke-Projekte gehören zu Klonk-Script & Blöcke) */
export const projectLanguage = (value: ProgramLanguage): ProgramLanguage => (value === 'blocks' ? 'klonk' : value)

/** Beispiel für Blöcke: bis zur Wand laufen und markieren (Blockly-JSON) */
const BLOCKS_SAMPLE = JSON.stringify({
  blocks: {
    languageVersion: 0,
    blocks: [{
      type: 'klonk_repeat_while',
      x: 40,
      y: 40,
      fields: { MODE: 'while' },
      inputs: {
        COND: { block: { type: 'logic_negate', inputs: { BOOL: { block: { type: 'klonk_is_wall' } } } } },
        DO: { block: { type: 'klonk_step' } },
      },
      next: { block: { type: 'klonk_mark', fields: { COLOR: 'yellow' } } },
    }],
  },
})

/** Beispielprogramm je Sprache (auch für neue Projektdateien) */
export function programSample(language: ProgramLanguage, lang: ScriptLanguage) {
  const k = (name: Parameters<typeof spell>[0]) => spell(name, lang)
  const de = lang === 'de'
  if (language === 'blocks') return BLOCKS_SAMPLE
  if (language === 'klonk') {
    return `${de ? '// Läuft bis zur Wand und legt links davon Ziegel' : '// Walks to the wall and places bricks on its left'}
${k('repeat')} ${k('while')} ${k('not')} ${k('isWall')}
  ${k('turnLeft')}
  ${k('placeBrick')}(${k('blue')})
  ${k('turnRight')}
  ${k('step')}
${k('end')}
${k('setMark')}
`
  }
  // JS/TS/Python/Java/C#: Schlüsselwörter sind englisch ⇒ Roboter-API und Beispiel ebenfalls nur englisch
  return codeSample(language)
}

function codeSample(language: 'javascript' | 'typescript' | 'python' | 'java' | 'csharp') {
  const k = (name: Parameters<typeof spell>[0]) => spell(name, 'en')
  if (language === 'csharp') {
    const c = (name: Parameters<typeof spell>[0]) => csharpName(spell(name, 'en'))
    return `// Klonk walks to the wall and places bricks on its left
using klonk;
using static klonk.Klonk;

var klonk = new Klonk();

int Row(Klonk robot, string color)
{
    var count = 0;
    while (!robot.${c('isWall')}())
    {
        robot.${c('turnLeft')}();
        robot.${c('placeBrick')}(color);
        robot.${c('turnRight')}();
        robot.${c('step')}();
        count++;
    }
    return count;
}

var placed = Row(klonk, ${c('blue')});
klonk.${c('setMark')}();
Console.WriteLine($"{klonk.Name} placed {placed} bricks");
`
  }
  if (language === 'java') {
    return `// Klonk walks to the wall and places bricks on its left
import klonk.Klonk;
import static klonk.Klonk.*;

public class Main {
    static int row(Klonk robot, String color) {
        int count = 0;
        while (!robot.${k('isWall')}()) {
            robot.${k('turnLeft')}();
            robot.${k('placeBrick')}(color);
            robot.${k('turnRight')}();
            robot.${k('step')}();
            count++;
        }
        return count;
    }

    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        int placed = row(klonk, ${k('blue').toUpperCase()});
        klonk.${k('setMark')}();
        System.out.println(klonk.name + " placed " + placed + " bricks");
    }
}
`
  }
  if (language === 'python') {
    const p = (name: Parameters<typeof spell>[0]) => pythonName(spell(name, 'en'))
    return `# Klonk walks to the wall and places bricks on its left
from klonk import Klonk, ${p('blue')}

klonk = Klonk()


def row(robot, color):
    count = 0
    while not robot.${p('isWall')}():
        robot.${p('turnLeft')}()
        robot.${p('placeBrick')}(color)
        robot.${p('turnRight')}()
        robot.${p('step')}()
        count += 1
    return count


placed = row(klonk, ${p('blue')})
klonk.${p('setMark')}()
print(klonk.name, "placed", placed, "bricks")
`
  }
  const ts = language === 'typescript'
  return `// Klonk walks to the wall and places bricks on its left
import { Klonk, ${k('blue')}${ts ? ', type KlonkColor' : ''} } from 'klonk'

const klonk = new Klonk()

function row(robot${ts ? ': Klonk' : ''}, color${ts ? ': KlonkColor' : ''})${ts ? ': number' : ''} {
  let count = 0
  while (!robot.${k('isWall')}()) {
    robot.${k('turnLeft')}()
    robot.${k('placeBrick')}(color)
    robot.${k('turnRight')}()
    robot.${k('step')}()
    count++
  }
  return count
}

const placed = row(klonk, ${k('blue')})
klonk.${k('setMark')}()
console.log(klonk.name, "placed", placed, "bricks")
`
}

/** Python-Schreibweise der Roboter-API (`istWand` ⇒ `ist_wand`, wie im Python-Vorspann der Laufzeit) */
export function pythonName(name: string) {
  return name.replace(/(?<=[a-zäöüß0-9])([A-ZÄÖÜ])/g, m => `_${m.toLowerCase()}`)
}

/** C#-Schreibweise der Roboter-API (`isWall` ⇒ `IsWall`, `red` ⇒ `Red`, wie in packages/csharp/RobotApi.txt) */
export function csharpName(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Dateiendungen der Programmsprachen */
export const PROGRAM_EXTENSIONS: Record<ProgramLanguage, string> = {
  blocks: '.blocks',
  klonk: '.klonk',
  javascript: '.js',
  typescript: '.ts',
  python: '.py',
  java: '.java',
  csharp: '.cs',
}

/**
 * Startdateien des gemeinsamen Ordners einer Untergruppe: Projekt (klonk.json, Welt, Beispielprogramm) bzw. Startwelt mit
 * vier Startplätzen. `names` = Dateinamen ohne Endung in der UI-Sprache (`project.defaultName.*`).
 */
export function collabStarterFiles(mode: CollabMode, language: ProgramLanguage, lang: ScriptLanguage, names: { world: string, program: string }) {
  const world = `${names.world}.klonkworld.json`
  if (mode === 'world') return [{ path: world, content: `${JSON.stringify(defaultStartWorld(), null, 2)}\n` }]
  const program = language === 'java' ? 'src/Main.java' : `${names.program}${PROGRAM_EXTENSIONS[language]}`
  return [
    { path: 'klonk.json', content: `${JSON.stringify({ language: projectLanguage(language) }, null, 2)}\n` },
    { path: world, content: `${JSON.stringify(World.empty().toJSON(), null, 2)}\n` },
    { path: program, content: programSample(language, lang) },
  ]
}
