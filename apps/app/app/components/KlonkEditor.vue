<script setup lang="ts">
import { spell } from '@klonk/klonk-script'
import type { editor as MonacoEditor } from 'monaco-editor'
import type { CheckLanguage, SqlTable } from '@klonk/runtime'
import { CHECKED_LANGUAGES, checkProgram, modelContexts } from '~/utils/checker'
import { KLONK_LANGUAGE, loadMonaco, sqlSchemas, updateRobotApi, validate, type Monaco } from '~/utils/monaco'

const monacoLanguage = (language: string) => (language === 'klonk' ? KLONK_LANGUAGE : language)
const EXTENSION: Record<string, string> = { klonk: 'klonk', javascript: 'js', typescript: 'ts', python: 'py', java: 'java', csharp: 'cs', sql: 'sql', pgsql: 'sql' }
/** SQL (SQLite bzw. PostgreSQL): keine Haltepunkte, Strg+Enter führt aus */
const isSql = (language: string) => language === 'sql' || language === 'pgsql'
let modelCounter = 0
/** Cursor, Auswahl und Scrollposition je Projektdatei – beim Wechsel zwischen Tabs wiederherstellen */
const viewStates = new Map<string, MonacoEditor.ICodeEditorViewState>()

// Code-Editor (Monaco) für Klonk-Script mit Breakpoints und Hervorhebung der aktuellen Zeile.
// Nur im Browser verwenden (<ClientOnly>).
const props = withDefaults(defineProps<{
  /** Programmiersprache des Editors */
  language?: 'klonk' | 'javascript' | 'typescript' | 'python' | 'java' | 'csharp' | 'sql' | 'pgsql'
  readOnly?: boolean
  /** Zeile, die gerade läuft */
  activeLine?: number | null
  /** Zeile mit Laufzeitfehler */
  errorLine?: number | null
  /** Meldung zum Laufzeitfehler (als Markierung in der Zeile) */
  errorMessage?: string | null
  /** Weitere Projektdateien, die der Compiler beim Prüfen kennen soll (Bibliotheken) */
  files?: Record<string, string>
  /** Pfad der Datei im Projekt (Importe relativ dazu, Vorschläge aus anderen Dateien) */
  path?: string | null
  /** SQL: Tabellen und Spalten für Vorschläge */
  sqlTables?: SqlTable[]
}>(), { path: null, language: 'klonk', readOnly: false, activeLine: null, errorLine: null, errorMessage: null, files: () => ({}), sqlTables: () => [] })

/** Strg+Enter (SQL ausführen) */
const emit = defineEmits<{ run: [] }>()

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
let stopFilesWatch: (() => void) | undefined
/** Marker-Quellen: Prüf-Worker (Python/Java/C#) und Laufzeitfehler */
const CHECK_OWNER = 'klonk-check'
const RUNTIME_OWNER = 'klonk-runtime'

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
  // Schon wieder entfernt (z. B. schneller Dateiwechsel), während Monaco lud
  if (!container.value) return
  // Eigenes Modell je Sprache mit passender Endung: der TypeScript-Dienst erkennt TS/JS an der Dateiendung
  // (ein gemeinsames Modell ohne Endung prüfte TypeScript als JavaScript ⇒ falsche Fehler bis zum Neuladen)
  // Im Projekt liegt das Modell unter seinem Pfad ab der Wurzel (file:///src/x.ts) – TypeScript löst `./andere` und
  // `/src/andere` dann wie zur Laufzeit auf; ohne Projekt ein eigener Ordner je Modell
  const createModel = (value: string, language: string) => {
    const inProject = !!props.path && props.path.endsWith(`.${EXTENSION[language]}`)
    const uri = monaco!.Uri.parse(inProject ? `file:///${props.path}` : `file:///__klonk/${++modelCounter}/program.${EXTENSION[language] ?? 'txt'}`)
    monaco!.editor.getModel(uri)?.dispose()
    const created = monaco!.editor.createModel(value, monacoLanguage(language), uri)
    modelContexts.set(created.uri.toString(), { path: props.path ?? undefined, files: props.files })
    sqlSchemas.set(created.uri.toString(), props.sqlTables)
    created.onWillDispose(() => {
      modelContexts.delete(created.uri.toString())
      sqlSchemas.delete(created.uri.toString())
    })
    return created
  }
  editor = monaco.editor.create(container.value!, {
    model: createModel(source.value, props.language),
    theme: colorMode.value === 'dark' ? 'klonk-dark' : 'klonk-light',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 15,
    tabSize: 2,
    insertSpaces: true,
    autoIndent: 'full',
    // Enter übernimmt Vorschläge nur, wenn sie etwas ändern – „ende“ + Enter macht eine neue Zeile
    acceptSuggestionOnEnter: 'smart',
    glyphMargin: !isSql(props.language),
    lineNumbersMinChars: 3,
    scrollBeyondLastLine: false,
    readOnly: props.readOnly,
    fixedOverflowWidgets: true,
    ariaLabel: t('editor.ariaLabel'),
  })
  decorations = editor.createDecorationsCollection()
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => emit('run'))

  let model = editor.getModel()!
  const initialState = viewStates.get(model.uri.toString())
  if (initialState) editor.restoreViewState(initialState)
  const check = async () => {
    if (!monaco) return
    // JS/TS prüft der TypeScript-Worker von Monaco selbst, Klonk-Script der eigene Parser
    if (props.language === 'klonk') return validate(monaco, model)
    if (!CHECKED_LANGUAGES.includes(props.language)) return
    // Python/Java/C#: Compiler im Prüf-Worker; veraltete Antworten verwerfen
    const version = model.getVersionId()
    const language = props.language
    const diagnostics = await checkProgram(language as CheckLanguage, model.getValue(), props.files)
    if (!diagnostics || model.isDisposed() || model.getVersionId() !== version || props.language !== language) return
    monaco.editor.setModelMarkers(model, CHECK_OWNER, diagnostics.map(d => ({
      severity: d.severity === 'error' ? monaco!.MarkerSeverity.Error : monaco!.MarkerSeverity.Warning,
      message: d.message,
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.endLine,
      endColumn: d.endLine === d.line && d.endColumn <= d.column ? d.column + 1 : d.endColumn,
    })))
  }
  void check()
  let timer: ReturnType<typeof setTimeout> | undefined
  editor.onDidChangeModelContent(() => {
    source.value = editor!.getValue()
    clearTimeout(timer)
    timer = setTimeout(check, props.language === 'klonk' ? 250 : 600)
  })
  stopLanguageWatch = watch([() => props.language, () => props.path], ([language]) => {
    const previous = model
    saveViewState()
    // Gleicher Pfad (z. B. nach Umbenennen zurück) ⇒ altes Modell zuerst freigeben
    if (previous.uri.toString() === `file:///${props.path}`) previous.dispose()
    model = createModel(source.value, language)
    editor!.setModel(model)
    const state = viewStates.get(model.uri.toString())
    if (state) editor!.restoreViewState(state)
    editor!.updateOptions({ glyphMargin: !isSql(language) })
    if (!previous.isDisposed()) previous.dispose()
    updateDecorations()
    updateRuntimeMarker()
    updateProjectLibs()
    void check()
  })
  stopFilesWatch = watch(() => props.files, (files) => {
    const context = modelContexts.get(model.uri.toString())
    if (context) context.files = files
    updateProjectLibs()
    void check()
  })
  updateProjectLibs()

  // Klick auf den Rand setzt/entfernt Breakpoints
  editor.onMouseDown((event) => {
    if (isSql(props.language)) return
    const { GUTTER_GLYPH_MARGIN, GUTTER_LINE_NUMBERS } = monaco!.editor.MouseTargetType
    if (event.target.type !== GUTTER_GLYPH_MARGIN && event.target.type !== GUTTER_LINE_NUMBERS) return
    const line = event.target.position?.lineNumber
    if (!line) return
    breakpoints.value = breakpoints.value.includes(line)
      ? breakpoints.value.filter(l => l !== line)
      : [...breakpoints.value, line].sort((a, b) => a - b)
  })

  updateDecorations()
  updateRuntimeMarker()
  ready.value = true
})

/** Ansicht der Projektdatei merken (Modelle ohne Projekt haben jedes Mal eine neue Adresse) */
function saveViewState() {
  const model = editor?.getModel()
  const state = editor?.saveViewState()
  if (model && state && !model.uri.path.startsWith('/__klonk/')) viewStates.set(model.uri.toString(), state)
}

onBeforeUnmount(() => {
  saveViewState()
  stopLanguageWatch?.()
  stopFilesWatch?.()
  for (const lib of projectLibs) lib.dispose()
  editor?.getModel()?.dispose()
  editor?.dispose()
})

watch(source, (value) => {
  if (editor && value !== editor.getValue()) editor.setValue(value)
})
watch(() => props.readOnly, readOnly => editor?.updateOptions({ readOnly }))
watch(() => props.sqlTables, (tables) => {
  const model = editor?.getModel()
  if (model) sqlSchemas.set(model.uri.toString(), tables)
})
watch(() => colorMode.value, mode => monaco?.editor.setTheme(mode === 'dark' ? 'klonk-dark' : 'klonk-light'))
watch(locale, () => {
  const model = editor?.getModel()
  if (!monaco || !model) return
  if (props.language === 'klonk') validate(monaco, model)
  updateRobotApi(monaco)
})
watch([breakpoints, () => props.activeLine, () => props.errorLine], updateDecorations)
watch([() => props.errorLine, () => props.errorMessage], updateRuntimeMarker)

// JS/TS: andere Projektdateien als Extra-Libs unter file:///<pfad> – der TypeScript-Worker behält sie dauerhaft
// (Modelle verwirft er nach einer Weile). `./x` löst er relativ auf, `/src/x` über `paths` in monaco.ts.
let projectLibs: { dispose: () => void }[] = []
function updateProjectLibs() {
  for (const lib of projectLibs) lib.dispose()
  projectLibs = []
  if (!monaco || !props.path) return
  for (const [path, text] of Object.entries(props.files)) {
    if (!/\.(ts|js)$/.test(path) || path === props.path) continue
    const uri = `file:///${path}`
    projectLibs.push(monaco.typescript.typescriptDefaults.addExtraLib(text, uri), monaco.typescript.javascriptDefaults.addExtraLib(text, uri))
  }
}

/** Laufzeitfehler als Markierung mit Meldung (Hover) in der betroffenen Zeile */
function updateRuntimeMarker() {
  const model = editor?.getModel()
  if (!monaco || !model) return
  const line = props.errorLine
  if (!line || line > model.getLineCount()) return monaco.editor.setModelMarkers(model, RUNTIME_OWNER, [])
  const text = model.getLineContent(line)
  const first = text.length - text.trimStart().length + 1
  monaco.editor.setModelMarkers(model, RUNTIME_OWNER, [{
    severity: monaco.MarkerSeverity.Error,
    message: props.errorMessage ?? t('editor.error'),
    startLineNumber: line,
    startColumn: first,
    endLineNumber: line,
    endColumn: Math.max(first + 1, text.length + 1),
  }])
}

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

defineExpose({
  focus: () => editor?.focus(),
  /** Markierter Text (SQL: nur die Auswahl ausführen) */
  selectedText: () => {
    const selection = editor?.getSelection()
    return selection && !selection.isEmpty() ? editor!.getModel()!.getValueInRange(selection) : ''
  },
  /** Zeile zeigen und Cursor dorthin setzen (z. B. Klick auf „Fehler in Zeile …“) */
  revealLine: (line: number) => {
    if (!editor) return
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column: 1 })
    editor.focus()
  },
  /** Text an der Cursorstelle einfügen bzw. die Auswahl ersetzen (KI-Assistent, rückgängig machbar) */
  insertText: (text: string) => {
    const selection = editor?.getSelection()
    if (!editor || !selection) return
    editor.executeEdits('klonk-ai', [{ range: selection, text, forceMoveMarkers: true }])
    editor.pushUndoStop()
    editor.focus()
  },
  /** Ganzes Programm ersetzen (rückgängig machbar, anders als ein neuer v-model-Wert) */
  replaceAll: (text: string) => {
    const model = editor?.getModel()
    if (!editor || !model) return
    editor.pushUndoStop()
    editor.executeEdits('klonk-ai', [{ range: model.getFullModelRange(), text }])
    editor.pushUndoStop()
    editor.focus()
  },
})
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
