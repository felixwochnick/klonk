import { completeProgram, hoverProgram, modelContexts } from './checker'
import { KLONK_CLASS_DOC, robotApiDeclarations } from './js-api-types'
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
    registerApiLanguage(monaco, 'python', PYTHON_STYLE)
    registerApiLanguage(monaco, 'java', JAVA_STYLE)
    registerApiLanguage(monaco, 'csharp', CSHARP_STYLE)
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
const JAVA_KEYWORDS = ['public', 'class', 'static', 'void', 'int', 'double', 'boolean', 'String', 'if', 'else', 'while', 'for', 'do', 'return', 'break', 'continue', 'new', 'true', 'false', 'null', 'final', 'System.out.println']

/** Schreibweise der Roboter-API je Sprache (nur englische Namen); `null` = gibt es dort nicht */
type ApiStyle = {
  keywords: string[]
  name: (name: BuiltinName, builtin: Builtin) => string | null
  param: (name: string) => string
  optional: string
  /** Figur erzeugen (`new Klonk` bzw. `Klonk` in Python) und Name der Klassenmethode für alle Figuren */
  newKlonk: string
  all: string
}

const PYTHON_STYLE: ApiStyle = {
  keywords: PYTHON_KEYWORDS,
  // print bleibt Pythons eigenes
  name: (name, builtin) => (name === 'print' || name === 'random' || name === 'selectCharacter' || name === 'createCharacter' ? null : builtin.kind === 'constant' ? spell(name, 'en') : pythonName(spell(name, 'en'))),
  param: pythonName,
  optional: '=…',
  newKlonk: 'Klonk',
  all: 'all',
}

const JAVA_STYLE: ApiStyle = {
  keywords: JAVA_KEYWORDS,
  // Konstanten in Java-Schreibweise; wait heißt sleep (Object.wait() verdeckt sonst den statischen Import)
  name: (name, builtin) => (name === 'print' || name === 'random' || name === 'selectCharacter' || name === 'createCharacter' ? null : builtin.kind === 'constant' ? spell(name, 'en').toUpperCase() : name === 'wait' ? 'sleep' : spell(name, 'en')),
  param: name => name,
  optional: '?',
  newKlonk: 'new Klonk',
  all: 'all',
}

const CSHARP_KEYWORDS = ['var', 'int', 'double', 'bool', 'string', 'if', 'else', 'while', 'for', 'foreach', 'in', 'do', 'return', 'break', 'continue', 'new', 'true', 'false', 'null', 'const', 'static', 'void', 'class', 'Console.WriteLine']

const CSHARP_STYLE: ApiStyle = {
  keywords: CSHARP_KEYWORDS,
  // PascalCase wie in C# üblich (IsWall, PlaceBrick, Red)
  name: name => (name === 'print' || name === 'random' || name === 'selectCharacter' || name === 'createCharacter' ? null : csharpName(spell(name, 'en'))),
  param: name => name,
  optional: '?',
  newKlonk: 'new Klonk',
  all: 'All',
}

/**
 * Python, Java und C# (Syntaxfarben bringt Monaco mit): Vorschläge und Erklärungen vom Sprachdienst im Worker
 * (Jedi, eigene Java-Analyse, Roslyn). Ist er (noch) nicht verfügbar – z. B. offline –, gibt es die Roboter-API
 * und Schlüsselwörter als einfache Vorschläge.
 */
function registerApiLanguage(monaco: Monaco, id: 'python' | 'java' | 'csharp', style: ApiStyle) {
  const { CompletionItemKind: Kind, CompletionItemInsertTextRule: Rule } = monaco.languages
  const entries = () => (Object.entries(BUILTINS) as [BuiltinName, Builtin][])
    .map(([name, builtin]) => ({ name, builtin, label: style.name(name, builtin) }))
    .filter((e): e is { name: BuiltinName, builtin: Builtin, label: string } => e.label !== null)
  const signature = (label: string, builtin: Builtin) => (builtin.kind === 'constant'
    ? label
    : `${label}(${(builtin.params ?? []).map(p => style.param(p.name.en[0]!) + (p.optional ? style.optional : '')).join(', ')})`)
  const KINDS: Record<string, import('monaco-editor').languages.CompletionItemKind> = {
    method: Kind.Method, function: Kind.Function, property: Kind.Property, field: Kind.Field, variable: Kind.Variable, constant: Kind.Constant,
    class: Kind.Class, interface: Kind.Interface, enum: Kind.Enum, struct: Kind.Struct, module: Kind.Module, keyword: Kind.Keyword, event: Kind.Event,
  }
  /** Erklärung der Roboter-API zu einem Namen (Roslyn kennt die Texte nicht, Jedi/Java bringen sie selbst mit) */
  const robotDoc = (label: string) => entries().find(e => e.label === label)?.builtin.doc[translator?.lang() ?? 'de']
  const request = (model: import('monaco-editor').editor.ITextModel, position: import('monaco-editor').Position) => {
    const context = modelContexts.get(model.uri.toString())
    return {
      language: id, source: model.getValue(), files: context?.files ?? {}, path: context?.path,
      offset: model.getOffsetAt(position), line: position.lineNumber, column: position.column, lang: translator?.lang() ?? 'de',
    }
  }
  // Fehlende Imports oben einfügen (nach einer package-Zeile)
  const importEdit = (model: import('monaco-editor').editor.ITextModel, text: string) => {
    const lines = model.getLinesContent()
    const after = lines.findIndex(l => /^\s*package\s/.test(l)) + 1
    return [{ range: new monaco.Range(after + 1, 1, after + 1, 1), text: `${text}\n` }]
  }

  monaco.languages.registerCompletionItemProvider(id, {
    triggerCharacters: ['.'],
    async provideCompletionItems(model, position) {
      const lang = translator?.lang() ?? 'de'
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const items = await completeProgram(request(model, position)).catch(() => null)
      if (items) {
        return {
          suggestions: items.map((item, i) => ({
            label: item.label,
            kind: KINDS[item.kind] ?? Kind.Text,
            detail: item.detail,
            documentation: item.documentation ?? (item.kind === 'method' || item.kind === 'constant' ? robotDoc(item.label) : undefined),
            insertText: item.label,
            additionalTextEdits: item.addImport ? importEdit(model, item.addImport) : undefined,
            range,
            sortText: `${item.kind === 'keyword' ? 2 : 1}${String(i).padStart(4, '0')}`,
          })),
        }
      }
      const suggestions: import('monaco-editor').languages.CompletionItem[] = style.keywords.map(k => ({
        label: k, kind: Kind.Keyword, insertText: k, range, sortText: `2${k}`,
      }))
      suggestions.push({
        label: 'Klonk',
        kind: Kind.Class,
        detail: `${style.newKlonk}(name?)`,
        documentation: { value: KLONK_CLASS_DOC.class[lang] },
        insertText: `${style.newKlonk}(\${1})`,
        insertTextRules: Rule.InsertAsSnippet,
        range,
        sortText: '0Klonk',
      })
      for (const { builtin, label } of entries()) {
        const params = (builtin.params ?? []).filter(p => !p.optional)
        const method = builtin.kind === 'command' || builtin.kind === 'sensor'
        suggestions.push({
          label,
          kind: builtin.kind === 'constant' ? Kind.Constant : method ? Kind.Method : Kind.Function,
          detail: method ? `Klonk.${signature(label, builtin)}` : signature(label, builtin),
          documentation: { value: builtin.doc[lang] },
          insertText: builtin.kind === 'constant' ? label : `${label}(${params.map((p, i) => `\${${i + 1}:${style.param(p.name.en[0]!)}}`).join(', ')})`,
          insertTextRules: Rule.InsertAsSnippet,
          range,
          sortText: `1${label}`,
        })
      }
      return { suggestions }
    },
  })
  monaco.languages.registerHoverProvider(id, {
    async provideHover(model, position) {
      const word = model.getWordAtPosition(position)
      if (!word) return null
      const lang = translator?.lang() ?? 'de'
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const info = await hoverProgram(request(model, position)).catch(() => undefined)
      if (info) {
        const documentation = info.documentation ?? robotDoc(word.word)
        return { range, contents: [{ value: `\`${info.detail}\`` }, ...(documentation ? [{ value: documentation }] : [])] }
      }
      if (info === null) return null
      if (word.word === 'Klonk') return { range, contents: [{ value: `\`${style.newKlonk}(name?)\`` }, { value: KLONK_CLASS_DOC.class[lang] }] }
      const entry = entries().find(e => e.label === word.word)
      if (!entry) return null
      const method = entry.builtin.kind === 'command' || entry.builtin.kind === 'sensor'
      return { range, contents: [{ value: `\`${method ? 'Klonk.' : ''}${signature(entry.label, entry.builtin)}\`` }, { value: entry.builtin.doc[lang] }] }
    },
  })
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
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    // `import … from './x.ts'` wie zur Laufzeit erlauben
    allowImportingTsExtensions: true,
    // Projektdateien liegen unter file:///<pfad> – `/src/x` ab dem Projektordner dorthin abbilden
    baseUrl: 'file:///',
    paths: { '/*': ['*'] },
    noEmit: true,
    lib: ['esnext'],
    allowNonTsExtensions: true,
    strict: true,
    noImplicitAny: false,
    allowJs: true,
    checkJs: false,
  }
  ts.typescriptDefaults.setCompilerOptions(options)
  // JS: Tippfehler wie `klonk.stepp()` auch ohne Typen melden, aber nachsichtig (kein strict)
  ts.javascriptDefaults.setCompilerOptions({ ...options, checkJs: true, strict: false })
  ts.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false })
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
