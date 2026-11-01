import { robotApiDeclarations } from './js-api-types'
import { BUILTINS, KEYWORDS, check, spell, tokenize, type Builtin, type BuiltinName, type ScriptLanguage } from '@klonk/klonk-script'

export type Monaco = typeof import('monaco-editor')

export const KLONK_LANGUAGE = 'klonk'

type Translator = { lang: () => ScriptLanguage, error: (code: string, params: Record<string, string | number>) => string, snippets: () => Record<string, string> }

let monacoPromise: Promise<Monaco> | undefined
let translator: Translator | undefined

/** Monaco nur im Browser und nur einmal laden; Klonk-Script registrieren */
export function loadMonaco(t: Translator): Promise<Monaco> {
  translator = t
  monacoPromise ??= (async () => {
    const [monaco, { default: EditorWorker }, { default: TsWorker }] = await Promise.all([
      import('monaco-editor'),
      import('monaco-editor/editor/editor.worker?worker'),
      import('monaco-editor/language/typescript/ts.worker?worker'),
    ])
    self.MonacoEnvironment = {
      getWorker: (_id: string, label: string) => (label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker()),
    }
    registerKlonk(monaco)
    registerPython(monaco)
    configureTypeScript(monaco)
    return monaco
  })()
  return monacoPromise
}

const allSpellings = (entries: Record<string, { de: string[], en: string[] } | { names: { de: string[], en: string[] } }>) =>
  Object.values(entries).flatMap(e => ('names' in e ? [...e.names.de, ...e.names.en] : [...e.de, ...e.en]))

function registerKlonk(monaco: Monaco) {
  monaco.languages.register({ id: KLONK_LANGUAGE, extensions: ['.klonk'], aliases: ['Klonk-Script'] })

  // Eigene Farben: Schlüsselwörter fett, eingebaute Befehle lila
  monaco.editor.defineTheme('klonk-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '0055bf', fontStyle: 'bold' },
      { token: 'predefined', foreground: '8b2fc9' },
      { token: 'number', foreground: '237841' },
      { token: 'string', foreground: 'c91a09' },
    ],
    colors: {},
  })
  monaco.editor.defineTheme('klonk-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '6cb6ff', fontStyle: 'bold' },
      { token: 'predefined', foreground: 'd2a8ff' },
      { token: 'number', foreground: '7ee787' },
      { token: 'string', foreground: 'ffa198' },
    ],
    colors: {},
  })

  const keywords = allSpellings(KEYWORDS)
  const builtins = allSpellings(BUILTINS)
  const blockStart = [...KEYWORDS.repeat.de, ...KEYWORDS.repeat.en, ...KEYWORDS.if.de, ...KEYWORDS.if.en, ...KEYWORDS.procedure.de, ...KEYWORDS.procedure.en, ...KEYWORDS.function.de, ...KEYWORDS.function.en]
  const middle = [...KEYWORDS.else.de, ...KEYWORDS.else.en]
  const end = [...KEYWORDS.end.de, ...KEYWORDS.end.en]

  monaco.languages.setMonarchTokensProvider(KLONK_LANGUAGE, {
    ignoreCase: true,
    keywords,
    builtins,
    tokenizer: {
      root: [
        [/(\/\/|#).*$/, 'comment'],
        // Monarch kennt keine Unicode-Klassen – Umlaute & Co. ausdrücklich zulassen
        [/[a-zA-Z_À-ÖØ-öø-ÿ][\w_À-ÖØ-öø-ÿ]*/, { cases: { '@keywords': 'keyword', '@builtins': 'predefined', '@default': 'identifier' } }],
        [/\d+(\.\d+)?/, 'number'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/[=<>!+\-*/%]+/, 'operator'],
        [/[(),;]/, 'delimiter'],
      ],
    },
  } as Parameters<typeof monaco.languages.setMonarchTokensProvider>[1])

  const words = (list: string[]) => list.join('|')
  monaco.languages.setLanguageConfiguration(KLONK_LANGUAGE, {
    comments: { lineComment: '//' },
    brackets: [['(', ')']],
    autoClosingPairs: [{ open: '(', close: ')' }, { open: '"', close: '"' }],
    wordPattern: /[\p{L}_][\p{L}\p{N}_]*|\d+(\.\d+)?/u,
    indentationRules: {
      increaseIndentPattern: new RegExp(`^\\s*(${words([...blockStart, ...middle])})\\b`, 'i'),
      decreaseIndentPattern: new RegExp(`^\\s*(${words([...end, ...middle])})\\b`, 'i'),
    },
    onEnterRules: [{
      beforeText: new RegExp(`^\\s*(${words([...blockStart, ...middle])})\\b.*$`, 'i'),
      action: { indentAction: monaco.languages.IndentAction.Indent },
    }],
  })

  monaco.languages.registerCompletionItemProvider(KLONK_LANGUAGE, {
    provideCompletionItems(model, position) {
      const lang = translator?.lang() ?? 'de'
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const { CompletionItemKind: Kind, CompletionItemInsertTextRule: Rule } = monaco.languages
      const suggestions: import('monaco-editor').languages.CompletionItem[] = []

      // Blöcke als Snippets
      for (const [label, body] of Object.entries(translator?.snippets() ?? {})) {
        suggestions.push({ label, kind: Kind.Snippet, insertText: body, insertTextRules: Rule.InsertAsSnippet, range, sortText: `0${label}` })
      }
      for (const name of Object.keys(KEYWORDS) as (keyof typeof KEYWORDS)[]) {
        suggestions.push({ label: spell(name, lang), kind: Kind.Keyword, insertText: spell(name, lang), range, sortText: `2${name}` })
      }
      for (const [name, builtin] of Object.entries(BUILTINS) as [BuiltinName, Builtin][]) {
        const label = spell(name, lang)
        const params = builtin.params ?? []
        const required = params.filter(p => !p.optional)
        suggestions.push({
          label,
          kind: builtin.kind === 'constant' ? Kind.Constant : builtin.kind === 'sensor' ? Kind.Property : Kind.Function,
          detail: signature(name, lang),
          documentation: { value: builtin.doc[lang] },
          insertText: required.length ? `${label}(${required.map((p, i) => `\${${i + 1}:${p.name[lang][0]}}`).join(', ')})` : label,
          insertTextRules: Rule.InsertAsSnippet,
          range,
          sortText: `1${label}`,
        })
      }
      // Eigene Anweisungen, Funktionen und Variablen
      for (const user of userSymbols(model.getValue())) {
        suggestions.push({ label: user.name, kind: user.kind === 'variable' ? Kind.Variable : Kind.Method, insertText: user.name, range, sortText: `0${user.name}` })
      }
      return { suggestions }
    },
  })

  monaco.languages.registerHoverProvider(KLONK_LANGUAGE, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position)
      if (!word) return null
      const lang = translator?.lang() ?? 'de'
      const entry = Object.entries(BUILTINS).find(([, b]) => [...b.names.de, ...b.names.en].some(n => n.toLowerCase() === word.word.toLowerCase()))
      if (!entry) return null
      const [name, builtin] = entry as [BuiltinName, Builtin]
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [{ value: `\`${signature(name, lang)}\`` }, { value: builtin.doc[lang] }],
      }
    },
  })
}

const PYTHON_KEYWORDS = ['if', 'elif', 'else', 'while', 'for', 'in', 'range', 'def', 'return', 'break', 'continue', 'pass', 'and', 'or', 'not', 'True', 'False', 'None', 'import', 'from', 'print', 'len', 'int', 'str']

/** Python (Monaco bringt die Syntaxfarben mit): Roboter-API (englisch, snake_case) vervollständigen und erklären */
function registerPython(monaco: Monaco) {
  const { CompletionItemKind: Kind, CompletionItemInsertTextRule: Rule } = monaco.languages
  monaco.languages.registerCompletionItemProvider('python', {
    provideCompletionItems(model, position) {
      const lang = translator?.lang() ?? 'de'
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const suggestions: import('monaco-editor').languages.CompletionItem[] = PYTHON_KEYWORDS.map(k => ({
        label: k, kind: Kind.Keyword, insertText: k, range, sortText: `2${k}`,
      }))
      for (const [name, builtin] of Object.entries(BUILTINS) as [BuiltinName, Builtin][]) {
        if (name === 'print') continue
        const label = pythonName(spell(name, 'en'))
        const params = (builtin.params ?? []).filter(p => !p.optional)
        suggestions.push({
          label,
          kind: builtin.kind === 'constant' ? Kind.Constant : builtin.kind === 'sensor' ? Kind.Property : Kind.Function,
          detail: pythonSignature(name),
          documentation: { value: builtin.doc[lang] },
          insertText: builtin.kind === 'constant' ? label : `${label}(${params.map((p, i) => `\${${i + 1}:${pythonName(p.name.en[0]!)}}`).join(', ')})`,
          insertTextRules: Rule.InsertAsSnippet,
          range,
          sortText: `1${label}`,
        })
      }
      return { suggestions }
    },
  })
  monaco.languages.registerHoverProvider('python', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position)
      if (!word) return null
      const lang = translator?.lang() ?? 'de'
      const entry = Object.entries(BUILTINS).find(([, b]) => b.names.en.some(n => pythonName(n) === word.word))
      if (!entry || entry[0] === 'print') return null
      const [name, builtin] = entry as [BuiltinName, Builtin]
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [{ value: `\`${pythonSignature(name)}\`` }, { value: builtin.doc[lang] }],
      }
    },
  })
}

function pythonSignature(name: BuiltinName) {
  const builtin: Builtin = BUILTINS[name]
  const label = pythonName(spell(name, 'en'))
  if (builtin.kind === 'constant') return label
  return `${label}(${(builtin.params ?? []).map(p => pythonName(p.name.en[0]!) + (p.optional ? '=…' : '')).join(', ')})`
}

function signature(name: BuiltinName, lang: ScriptLanguage) {
  const builtin: Builtin = BUILTINS[name]
  const params = builtin.params ?? []
  if (!params.length) return spell(name, lang)
  return `${spell(name, lang)}(${params.map(p => (p.optional ? `${p.name[lang][0]}?` : p.name[lang][0])).join(', ')})`
}

/** Eigene Namen aus dem Quelltext (auch wenn er gerade nicht fehlerfrei ist) */
function userSymbols(source: string) {
  const symbols = new Map<string, 'variable' | 'definition'>()
  let tokens
  try {
    tokens = tokenize(source)
  }
  catch {
    return []
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i]!
    const next = tokens[i + 1]!
    if (t.type === 'keyword' && next.type === 'identifier') {
      if (t.value === 'var') symbols.set(String(next.value), 'variable')
      if (t.value === 'procedure' || t.value === 'function') symbols.set(String(next.value), 'definition')
    }
  }
  return [...symbols].map(([name, kind]) => ({ name, kind }))
}

/** Syntaxfehler als Markierungen im Editor */
export function validate(monaco: Monaco, model: import('monaco-editor').editor.ITextModel) {
  const markers = check(model.getValue()).map(error => ({
    severity: monaco.MarkerSeverity.Error,
    message: translator?.error(error.code, error.params) ?? error.code,
    startLineNumber: error.range?.line ?? 1,
    startColumn: error.range?.column ?? 1,
    endLineNumber: error.range?.endLine ?? 1,
    endColumn: error.range?.endColumn ?? 2,
  }))
  monaco.editor.setModelMarkers(model, KLONK_LANGUAGE, markers)
  return markers
}

let apiLib: { dispose: () => void }[] = []

/** JS/TS: Skript-Modus, gängige Optionen für Einsteiger, Roboter-API als Deklaration */
function configureTypeScript(monaco: Monaco) {
  const ts = monaco.typescript
  const options = {
    target: ts.ScriptTarget.ESNext,
    lib: ['esnext'],
    allowNonTsExtensions: true,
    strict: true,
    noImplicitAny: false,
    allowJs: true,
    checkJs: false,
  }
  ts.typescriptDefaults.setCompilerOptions(options)
  ts.javascriptDefaults.setCompilerOptions(options)
  updateRobotApi(monaco)
}

/** Roboter-API-Deklarationen (Dokumentation in der aktuellen UI-Sprache) */
export function updateRobotApi(monaco: Monaco) {
  for (const lib of apiLib) lib.dispose()
  const source = robotApiDeclarations(translator?.lang() ?? 'de')
  apiLib = [
    monaco.typescript.typescriptDefaults.addExtraLib(source, 'file:///klonk-api.d.ts'),
    monaco.typescript.javascriptDefaults.addExtraLib(source, 'file:///klonk-api.d.ts'),
  ]
}
