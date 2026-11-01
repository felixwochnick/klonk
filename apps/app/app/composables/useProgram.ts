import { spell, translate, type ScriptLanguage } from '@klonk/klonk-script'

const STORAGE_KEY = 'klonk:program'

function sample(lang: ScriptLanguage) {
  const k = (name: Parameters<typeof spell>[0]) => spell(name, lang)
  const comment = lang === 'de' ? '// Läuft bis zur Wand und legt links davon Ziegel' : '// Walks to the wall and places bricks on its left'
  return `${comment}
${k('repeat')} ${k('while')} ${k('not')} ${k('isWall')}
  ${k('turnLeft')}
  ${k('placeBrick')}(${k('blue')})
  ${k('turnRight')}
  ${k('step')}
${k('end')}
${k('setMark')}
`
}

/** Aktuelles Programm (im Browser gespeichert) samt Breakpoints */
export function useProgram() {
  const { locale } = useI18n()
  const lang = computed<ScriptLanguage>(() => (locale.value === 'en' ? 'en' : 'de'))

  const source = useState('program-source', () => '')
  const breakpoints = useState<number[]>('program-breakpoints', () => [])

  onMounted(() => {
    if (source.value) return
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      source.value = stored?.source ?? sample(lang.value)
      breakpoints.value = stored?.breakpoints ?? []
    }
    catch {
      source.value = sample(lang.value)
    }
  })

  watch([source, breakpoints], () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ source: source.value, breakpoints: breakpoints.value }))
    }
    catch {
      // Speicher voll/gesperrt
    }
  })

  /** Programm in eine andere Sprache übersetzen (Schlüsselwörter und Befehle) */
  function translateTo(target: ScriptLanguage) {
    try {
      source.value = translate(source.value, target)
      return true
    }
    catch {
      return false
    }
  }

  return { source, breakpoints, lang, translateTo, reset: () => (source.value = sample(lang.value)) }
}
