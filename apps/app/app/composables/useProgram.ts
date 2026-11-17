import { translate, type ScriptLanguage } from '@klonk/klonk-script'

const STORAGE_KEY = 'klonk:program'

/** Darf ein Projekt dieser Art Dateien dieser Sprache enthalten? (ohne Art: alles) */
export function projectAllows(project: ProgramLanguage | null, kind: ProgramLanguage) {
  return !project || projectLanguage(project) === projectLanguage(kind)
}

/** Name der Projektart („Klonk-Script & Blöcke“ statt nur „Klonk-Script“) */
export function projectLanguageLabel(t: (key: string) => string, value: ProgramLanguage) {
  return projectLanguage(value) === 'klonk' ? t('project.klonkAndBlocks') : t(`editor.languages.${value}`)
}

type Program = { source: string, breakpoints: number[] }

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
