import { spell, translate, type ScriptLanguage } from '@klonk/klonk-script'
import type { RunLanguage } from '@klonk/runtime'

const STORAGE_KEY = 'klonk:program'

export const PROGRAM_LANGUAGES: RunLanguage[] = ['klonk', 'javascript', 'typescript']

type Program = { source: string, breakpoints: number[] }

function sample(language: RunLanguage, lang: ScriptLanguage) {
  const k = (name: Parameters<typeof spell>[0]) => spell(name, lang)
  const de = lang === 'de'
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
  const ts = language === 'typescript'
  return `${de ? '// Läuft bis zur Wand und legt links davon Ziegel' : '// Walks to the wall and places bricks on its left'}
function ${de ? 'reihe' : 'row'}(${de ? 'farbe' : 'color'}${ts ? ': KlonkColor' : ''})${ts ? ': number' : ''} {
  let ${de ? 'anzahl' : 'count'} = 0
  while (!${k('isWall')}()) {
    ${k('turnLeft')}()
    ${k('placeBrick')}(${de ? 'farbe' : 'color'})
    ${k('turnRight')}()
    ${k('step')}()
    ${de ? 'anzahl' : 'count'}++
  }
  return ${de ? 'anzahl' : 'count'}
}

const ${de ? 'gelegt' : 'placed'} = ${de ? 'reihe' : 'row'}(${k('blue')})
${k('setMark')}()
${k('print')}(${de ? '"Ziegel gelegt:"' : '"Bricks placed:"'}, ${de ? 'gelegt' : 'placed'})
`
}

/** Aktuelles Programm je Sprache (im Browser gespeichert) samt Breakpoints */
export function useProgram() {
  const { locale } = useI18n()
  const lang = computed<ScriptLanguage>(() => (locale.value === 'en' ? 'en' : 'de'))

  const language = useState<RunLanguage>('program-language', () => 'klonk')
  const programs = useState<Partial<Record<RunLanguage, Program>>>('programs', () => ({}))

  const current = (): Program => (programs.value[language.value] ??= { source: sample(language.value, lang.value), breakpoints: [] })

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
      if (stored && 'source' in stored) programs.value = { klonk: { source: stored.source, breakpoints: stored.breakpoints ?? [] } }
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

  return { language, source, breakpoints, lang, translateTo, reset: () => (source.value = sample(language.value, lang.value)) }
}
