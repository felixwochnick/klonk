<script setup lang="ts">
import { spell } from '@klonk/klonk-script'
import type { editor as MonacoEditor } from 'monaco-editor'
import { KLONK_LANGUAGE, loadMonaco, updateRobotApi, validate, type Monaco } from '~/utils/monaco'

const monacoLanguage = (language: string) => (language === 'klonk' ? KLONK_LANGUAGE : language)

// Code-Editor (Monaco) für Klonk-Script mit Breakpoints und Hervorhebung der aktuellen Zeile.
// Nur im Browser verwenden (<ClientOnly>).
const props = withDefaults(defineProps<{
  /** Programmiersprache des Editors */
  language?: 'klonk' | 'javascript' | 'typescript' | 'python' | 'java' | 'csharp'
  readOnly?: boolean
  /** Zeile, die gerade läuft */
  activeLine?: number | null
  /** Zeile mit Laufzeitfehler */
  errorLine?: number | null
}>(), { language: 'klonk', readOnly: false, activeLine: null, errorLine: null })

const source = defineModel<string>({ required: true })
const breakpoints = defineModel<number[]>('breakpoints', { default: () => [] })

const { t, te, locale } = useI18n()
const colorMode = useColorMode()

const container = ref<HTMLDivElement>()
const ready = ref(false)
let editor: MonacoEditor.IStandaloneCodeEditor | undefined
let monaco: Monaco | undefined
let decorations: MonacoEditor.IEditorDecorationsCollection | undefined
let stopLanguageWatch: (() => void) | undefined

const translator = {
  lang: () => (locale.value === 'en' ? 'en' : 'de') as 'de' | 'en',
  error: (code: string, params: Record<string, string | number>) => scriptErrorMessage(t, te, code, params),
  snippets: () => {
    const lang = translator.lang()
    const k = (name: Parameters<typeof spell>[0]) => spell(name, lang)
    return {
      [`${k('repeat')} … ${k('times')}`]: `${k('repeat')} \${1:3} ${k('times')}\n\t$0\n${k('end')}`,
      [`${k('repeat')} ${k('while')} …`]: `${k('repeat')} ${k('while')} \${1:${k('not')} ${k('isWall')}}\n\t$0\n${k('end')}`,
      [`${k('if')} … ${k('then')}`]: `${k('if')} \${1:${k('isBrick')}} ${k('then')}\n\t$0\n${k('end')}`,
      [`${k('if')} … ${k('else')}`]: `${k('if')} \${1:${k('isBrick')}} ${k('then')}\n\t$2\n${k('else')}\n\t$0\n${k('end')}`,
      [`${k('procedure')} …`]: `${k('procedure')} \${1:name}\n\t$0\n${k('end')}`,
      [`${k('function')} …`]: `${k('function')} \${1:name}(\${2:x})\n\t$0\n\t${k('return')} \${3:x}\n${k('end')}`,
    }
  },
}

onMounted(async () => {
  monaco = await loadMonaco(translator)
  editor = monaco.editor.create(container.value!, {
    value: source.value,
    language: monacoLanguage(props.language),
    theme: colorMode.value === 'dark' ? 'klonk-dark' : 'klonk-light',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 15,
    tabSize: 2,
    insertSpaces: true,
    autoIndent: 'full',
    // Enter übernimmt Vorschläge nur, wenn sie etwas ändern – „ende“ + Enter macht eine neue Zeile
    acceptSuggestionOnEnter: 'smart',
    glyphMargin: true,
    lineNumbersMinChars: 3,
    scrollBeyondLastLine: false,
    readOnly: props.readOnly,
    fixedOverflowWidgets: true,
    ariaLabel: t('editor.ariaLabel'),
  })
  decorations = editor.createDecorationsCollection()

  const model = editor.getModel()!
  const check = () => {
    // JS/TS prüft der TypeScript-Worker von Monaco selbst
    if (props.language === 'klonk' && monaco) validate(monaco, model)
  }
  check()
  let timer: ReturnType<typeof setTimeout> | undefined
  editor.onDidChangeModelContent(() => {
    source.value = editor!.getValue()
    clearTimeout(timer)
    timer = setTimeout(check, 250)
  })
  stopLanguageWatch = watch(() => props.language, (language) => {
    monaco!.editor.setModelMarkers(model, KLONK_LANGUAGE, [])
    monaco!.editor.setModelLanguage(model, monacoLanguage(language))
    check()
  })

  // Klick auf den Rand setzt/entfernt Breakpoints
  editor.onMouseDown((event) => {
    const { GUTTER_GLYPH_MARGIN, GUTTER_LINE_NUMBERS } = monaco!.editor.MouseTargetType
    if (event.target.type !== GUTTER_GLYPH_MARGIN && event.target.type !== GUTTER_LINE_NUMBERS) return
    const line = event.target.position?.lineNumber
    if (!line) return
    breakpoints.value = breakpoints.value.includes(line)
      ? breakpoints.value.filter(l => l !== line)
      : [...breakpoints.value, line].sort((a, b) => a - b)
  })

  updateDecorations()
  ready.value = true
})

onBeforeUnmount(() => {
  stopLanguageWatch?.()
  editor?.dispose()
})

watch(source, (value) => {
  if (editor && value !== editor.getValue()) editor.setValue(value)
})
watch(() => props.readOnly, readOnly => editor?.updateOptions({ readOnly }))
watch(() => colorMode.value, mode => monaco?.editor.setTheme(mode === 'dark' ? 'klonk-dark' : 'klonk-light'))
watch(locale, () => {
  const model = editor?.getModel()
  if (!monaco || !model) return
  if (props.language === 'klonk') validate(monaco, model)
  updateRobotApi(monaco)
})
watch([breakpoints, () => props.activeLine, () => props.errorLine], updateDecorations)

function updateDecorations() {
  if (!editor || !monaco) return
  const items: MonacoEditor.IModelDeltaDecoration[] = breakpoints.value.map(line => ({
    range: new monaco!.Range(line, 1, line, 1),
    options: { glyphMarginClassName: 'klonk-breakpoint', glyphMarginHoverMessage: { value: t('editor.breakpoint') } },
  }))
  if (props.activeLine) {
    items.push({ range: new monaco.Range(props.activeLine, 1, props.activeLine, 1), options: { isWholeLine: true, className: 'klonk-active-line', glyphMarginClassName: 'klonk-active-arrow' } })
    editor.revealLineInCenterIfOutsideViewport(props.activeLine)
  }
  if (props.errorLine) {
    items.push({ range: new monaco.Range(props.errorLine, 1, props.errorLine, 1), options: { isWholeLine: true, className: 'klonk-error-line' } })
    editor.revealLineInCenterIfOutsideViewport(props.errorLine)
  }
  decorations?.set(items)
}

defineExpose({ focus: () => editor?.focus() })
</script>

<template>
  <div
    ref="container"
    class="h-full w-full"
    data-testid="code-editor"
    :data-ready="ready"
  />
</template>

<style>
.klonk-breakpoint {
  background: #e5484d;
  border-radius: 9999px;
  margin-left: 6px;
  width: 10px !important;
  height: 10px !important;
  margin-top: 5px;
}
.klonk-active-line {
  background: rgb(242 205 55 / 0.3);
}
.klonk-active-arrow::before {
  content: '▶';
  color: #f59e0b;
  font-size: 12px;
  margin-left: 4px;
}
.klonk-error-line {
  background: rgb(229 72 77 / 0.18);
}
</style>
