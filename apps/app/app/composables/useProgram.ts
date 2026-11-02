import { spell, translate, type ScriptLanguage } from '@klonk/klonk-script'
import type { RunLanguage } from '@klonk/runtime'

const STORAGE_KEY = 'klonk:program'

/** Sprachen in der IDE – Blöcke werden zu Klonk-Script */
export type ProgramLanguage = RunLanguage | 'blocks'
export const PROGRAM_LANGUAGES: ProgramLanguage[] = ['blocks', 'klonk', 'javascript', 'typescript', 'python', 'java', 'csharp']

type Program = { source: string, breakpoints: number[] }

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
import { Klonk, ${k('blue')}, ${k('print')}${ts ? ', type KlonkColor' : ''} } from 'klonk'

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
${k('print')}(klonk.name, "placed", placed, "bricks")
`
}

/** Aktuelles Programm je Sprache (im Browser gespeichert) samt Breakpoints */
export function useProgram() {
  const { locale } = useI18n()
  const lang = computed<ScriptLanguage>(() => (locale.value === 'en' ? 'en' : 'de'))

  const language = useState<ProgramLanguage>('program-language', () => 'blocks')
  const programs = useState<Partial<Record<ProgramLanguage, Program>>>('programs', () => ({}))

  const current = (): Program => (programs.value[language.value] ??= { source: programSample(language.value, lang.value), breakpoints: [] })

  const source = computed({
    get: () => programs.value[language.value]?.source ?? '',
    set: value => (current().source = value),
  })
  const breakpoints = computed({
    get: () => programs.value[language.value]?.breakpoints ?? [],
    set: value => (current().breakpoints = value),
  })

  onMounted(() => {
    if (Object.keys(programs.value).length) return
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      // Älteres Format: nur ein Klonk-Script-Programm
      if (stored && 'source' in stored) {
        programs.value = { klonk: { source: stored.source, breakpoints: stored.breakpoints ?? [] } }
        language.value = 'klonk'
      }
      else if (stored?.programs) {
        programs.value = stored.programs
        if (PROGRAM_LANGUAGES.includes(stored.language)) language.value = stored.language
      }
    }
    catch {
      // ungültiger Speicherinhalt – mit Beispiel starten
    }
    current()
  })

  watch(language, () => current())

  watch([language, programs], () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ language: language.value, programs: programs.value }))
    }
    catch {
      // Speicher voll/gesperrt
    }
  }, { deep: true })

  /** Klonk-Script in eine andere Sprache übersetzen (Schlüsselwörter und Befehle) */
  function translateTo(target: ScriptLanguage) {
    try {
      source.value = translate(source.value, target)
      return true
    }
    catch {
      return false
    }
  }

  return { language, source, breakpoints, lang, translateTo, reset: () => (source.value = programSample(language.value, lang.value)) }
}

/** Python-Schreibweise der Roboter-API (`istWand` ⇒ `ist_wand`, wie im Python-Vorspann der Laufzeit) */
export function pythonName(name: string) {
  return name.replace(/(?<=[a-zäöüß0-9])([A-ZÄÖÜ])/g, m => `_${m.toLowerCase()}`)
}

/** C#-Schreibweise der Roboter-API (`isWall` ⇒ `IsWall`, `red` ⇒ `Red`, wie in packages/csharp/RobotApi.txt) */
export function csharpName(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Package aus dem Ordner einer Java-Datei (`src/de/app/X.java` ⇒ `de.app`; Maven-Layout wird erkannt) */
export function javaPackage(folder: string) {
  const parts = folder.replace(/^(src\/main\/java|src)(\/|$)/, '').split('/').filter(Boolean)
  return parts.length && parts.every(p => /^[a-z_]\w*$/i.test(p)) ? parts.join('.') : null
}

/** Neue Java-Datei: Klasse heißt wie die Datei, Package passend zum Ordner */
export function javaClassSource(className: string, pkg: string | null) {
  return `${pkg ? `package ${pkg};\n\n` : ''}import klonk.Klonk;

public class ${className} {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        klonk.step();
    }
}
`
}

/** Namespace aus dem Ordner einer C#-Datei (`Werkzeuge/Bewegung/X.cs` ⇒ `Werkzeuge.Bewegung`) */
export function csharpNamespace(folder: string) {
  const parts = folder.replace(/^src(\/|$)/, '').split('/').filter(Boolean)
  return parts.length && parts.every(p => /^[A-Za-z_]\w*$/.test(p)) ? parts.join('.') : null
}

/** Neue C#-Datei neben Program.cs: statische Klasse (Name wie die Datei) im Namespace des Ordners */
export function csharpClassSource(className: string, namespace: string | null) {
  return `using klonk;
${namespace ? `\nnamespace ${namespace};\n` : ''}
public static class ${className}
{
    public static void TwoSteps(Klonk robot)
    {
        robot.Step();
        robot.Step();
    }
}
`
}
