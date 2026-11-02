import { BUILTINS, type Builtin, type BuiltinName, type ScriptLanguage } from '@klonk/klonk-script'
import { ROBOT_METHODS } from '../js/api'

/**
 * Autovervollständigung für Java ohne Sprachdienst (der Browser-javac kann nur übersetzen): Deklarationen im Text
 * (Variablen, Parameter, Felder, Methoden, Klassen – auch aus anderen Projektdateien) und bekannte Typen
 * (`Klonk`, `String`, `System.out`, `Math` …). Robust gegenüber halbfertigem Code, weil nichts geparst werden muss.
 */
export type CompletionItem = {
  label: string
  kind: 'method' | 'field' | 'variable' | 'class' | 'constant' | 'keyword' | 'module' | 'property'
  detail?: string
  documentation?: string
  /** Fehlender Import, der beim Übernehmen ergänzt wird (z. B. `import klonk.Klonk;`) */
  addImport?: string
}

export type HoverInfo = { detail: string, documentation?: string }

type Member = { name: string, kind: CompletionItem['kind'], type: string, detail: string, isStatic: boolean, documentation?: string }
type TypeInfo = { name: string, members: Member[] }

const KEYWORDS = ['public', 'private', 'protected', 'class', 'interface', 'enum', 'record', 'static', 'final', 'void', 'int', 'long', 'double', 'float', 'boolean', 'char', 'String', 'var', 'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'return', 'break', 'continue', 'new', 'this', 'true', 'false', 'null', 'import', 'package', 'try', 'catch', 'finally', 'throw']
const RETURNS: Partial<Record<BuiltinName, string>> = { brickCount: 'int', positionX: 'int', positionY: 'int', random: 'int' }

/** Klonk-Klasse aus den Klonk-Script-Tabellen (Java-Schreibweise wie in robot.ts) */
function klonkType(lang: ScriptLanguage): TypeInfo {
  const members: Member[] = ROBOT_METHODS.map((name) => {
    const builtin: Builtin = BUILTINS[name]
    const type = builtin.kind === 'sensor' ? (RETURNS[name] ?? 'boolean') : 'void'
    const params = (builtin.params ?? []).map(p => `${p.type === 'number' ? 'int' : 'String'} ${p.name.en[0]}`).join(', ')
    return { name, kind: 'method', type, detail: `${type} ${name}(${params})`, isStatic: false, documentation: builtin.doc[lang] }
  })
  members.push({ name: 'name', kind: 'field', type: 'String', detail: 'String name', isStatic: false, documentation: lang === 'de' ? 'Name der Figur' : 'Name of the character' })
  members.push({ name: 'all', kind: 'method', type: 'Klonk[]', detail: 'static Klonk[] all()', isStatic: true, documentation: lang === 'de' ? 'Alle Figuren der Welt' : 'All characters in the world' })
  for (const name of Object.keys(BUILTINS) as BuiltinName[]) {
    const builtin: Builtin = BUILTINS[name]
    if (builtin.kind === 'constant') members.push({ name: name.toUpperCase(), kind: 'constant', type: 'String', detail: `static String ${name.toUpperCase()}`, isStatic: true, documentation: builtin.doc[lang] })
    else if (builtin.kind === 'function') {
      const java = name === 'wait' ? 'sleep' : name
      const params = name === 'print' ? 'Object... values' : name === 'wait' ? 'double seconds' : 'int min, int max'
      members.push({ name: java, kind: 'method', type: RETURNS[name] ?? 'void', detail: `static ${RETURNS[name] ?? 'void'} ${java}(${params})`, isStatic: true, documentation: builtin.doc[lang] })
    }
  }
  return { name: 'Klonk', members }
}

const method = (name: string, type: string, params = '', isStatic = false): Member => ({ name, kind: 'method', type, detail: `${isStatic ? 'static ' : ''}${type} ${name}(${params})`, isStatic })
const BUILTIN_TYPES: Record<string, TypeInfo> = {
  String: { name: 'String', members: [method('length', 'int'), method('charAt', 'char', 'int index'), method('substring', 'String', 'int begin, int end'), method('indexOf', 'int', 'String text'), method('contains', 'boolean', 'CharSequence text'), method('equals', 'boolean', 'Object other'), method('isEmpty', 'boolean'), method('toUpperCase', 'String'), method('toLowerCase', 'String'), method('trim', 'String'), method('split', 'String[]', 'String regex'), method('startsWith', 'boolean', 'String prefix'), method('endsWith', 'boolean', 'String suffix'), method('replace', 'String', 'CharSequence a, CharSequence b'), method('valueOf', 'String', 'Object value', true), method('format', 'String', 'String format, Object... args', true)] },
  System: { name: 'System', members: [{ name: 'out', kind: 'field', type: 'PrintStream', detail: 'static PrintStream out', isStatic: true }, { name: 'err', kind: 'field', type: 'PrintStream', detail: 'static PrintStream err', isStatic: true }, method('currentTimeMillis', 'long', '', true)] },
  PrintStream: { name: 'PrintStream', members: [method('println', 'void', 'Object value'), method('print', 'void', 'Object value'), method('printf', 'PrintStream', 'String format, Object... args')] },
  Math: { name: 'Math', members: [method('abs', 'int', 'int a', true), method('max', 'int', 'int a, int b', true), method('min', 'int', 'int a, int b', true), method('pow', 'double', 'double a, double b', true), method('sqrt', 'double', 'double a', true), method('random', 'double', '', true), method('round', 'long', 'double a', true), method('floor', 'double', 'double a', true), method('ceil', 'double', 'double a', true), { name: 'PI', kind: 'constant', type: 'double', detail: 'static double PI', isStatic: true }] },
  Integer: { name: 'Integer', members: [method('parseInt', 'int', 'String text', true), method('toString', 'String', 'int value', true), method('valueOf', 'Integer', 'int value', true), { name: 'MAX_VALUE', kind: 'constant', type: 'int', detail: 'static int MAX_VALUE', isStatic: true }, { name: 'MIN_VALUE', kind: 'constant', type: 'int', detail: 'static int MIN_VALUE', isStatic: true }] },
  ArrayList: { name: 'ArrayList', members: [method('add', 'boolean', 'E element'), method('get', 'E', 'int index'), method('set', 'E', 'int index, E element'), method('remove', 'E', 'int index'), method('size', 'int'), method('isEmpty', 'boolean'), method('contains', 'boolean', 'Object value'), method('clear', 'void')] },
}
BUILTIN_TYPES.List = { ...BUILTIN_TYPES.ArrayList!, name: 'List' }
const ARRAY: TypeInfo = { name: 'array', members: [{ name: 'length', kind: 'field', type: 'int', detail: 'int length', isStatic: false }] }

/** Kommentare und Texte durch Leerzeichen ersetzen (Positionen bleiben gleich) */
function blank(source: string) {
  return source.replace(/\/\*[\s\S]*?(\*\/|$)|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/g, m => m.replace(/[^\n]/g, ' '))
}

const TYPE = String.raw`[A-Za-z_]\w*(?:\s*<[^;(){}=]*>)?(?:\s*\[\s*\])*`
const MODIFIERS = String.raw`(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)*`

/** Klassen einer Datei mit ihren Feldern und Methoden (ungefähr – genügt für Vorschläge) */
function classesOf(source: string): TypeInfo[] {
  const text = blank(source)
  const result: TypeInfo[] = []
  for (const match of text.matchAll(/\b(class|interface|enum|record)\s+([A-Za-z_]\w*)/g)) {
    const name = match[2]!
    const open = text.indexOf('{', match.index)
    if (open < 0) continue
    let depth = 0
    let end = text.length
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}' && --depth === 0) {
        end = i
        break
      }
    }
    // Nur Ebene 1 der Klasse (Felder/Methoden, nicht deren Inneres)
    let body = ''
    depth = 0
    for (let i = open + 1; i < end; i++) {
      const c = text[i]!
      if (c === '{') depth++
      if (depth === 0) body += c
      if (c === '}') depth--
    }
    const members: Member[] = []
    for (const m of body.matchAll(new RegExp(String.raw`(${MODIFIERS})(${TYPE})\s+([A-Za-z_]\w*)\s*\(([^)]*)\)`, 'g'))) {
      if (['new', 'return', 'else'].includes(m[2]!)) continue
      members.push({ name: m[3]!, kind: 'method', type: m[2]!, detail: `${m[1]!.trim() ? `${m[1]!.trim()} ` : ''}${m[2]} ${m[3]}(${m[4]!.trim()})`, isStatic: /\bstatic\b/.test(m[1]!) })
    }
    // Konstruktoren sind keine Mitglieder
    for (const m of body.matchAll(new RegExp(String.raw`(${MODIFIERS})(${TYPE})\s+([A-Za-z_]\w*)\s*(?:=|;)`, 'g'))) {
      if (['return', 'new'].includes(m[2]!)) continue
      members.push({ name: m[3]!, kind: /\bfinal\b/.test(m[1]!) && /\bstatic\b/.test(m[1]!) ? 'constant' : 'field', type: m[2]!, detail: `${m[2]} ${m[3]}`, isStatic: /\bstatic\b/.test(m[1]!) })
    }
    result.push({ name, members: members.filter(m => m.name !== name) })
  }
  return result
}

/** Variablen/Parameter, die vor `offset` deklariert sind (Name ⇒ Typ, die letzte gewinnt) */
function localsBefore(text: string, offset: number) {
  const before = text.slice(0, offset)
  const locals = new Map<string, string>()
  const pattern = new RegExp(String.raw`(?:^|[(,;{}\s])(?:final\s+)?(${TYPE})\s+([A-Za-z_]\w*)\s*(?=[=;,):]|$)`, 'gm')
  for (const m of before.matchAll(pattern)) {
    const type = m[1]!.replace(/\s+/g, '')
    if (KEYWORDS.includes(type) && !['int', 'long', 'double', 'float', 'boolean', 'char', 'String', 'var'].includes(type)) continue
    let resolved = type
    if (type === 'var') {
      const init = new RegExp(String.raw`\b${m[2]}\s*=\s*new\s+([A-Za-z_]\w*)`).exec(before.slice(m.index))
      resolved = init?.[1] ?? 'var'
    }
    locals.set(m[2]!, resolved)
  }
  return locals
}

function baseType(type: string) {
  if (/\[\]$/.test(type)) return 'array'
  return type.replace(/<.*$/, '')
}

export function createJavaService(lang: ScriptLanguage) {
  const klonk = klonkType(lang)

  function context(source: string, files: Record<string, string>) {
    const text = blank(source)
    const imported = /\bimport\s+klonk\.(Klonk|\*)\s*;/.test(text)
    const staticImported = /\bimport\s+static\s+klonk\.Klonk\.\*\s*;/.test(text)
    const own = classesOf(source)
    const project = Object.entries(files).filter(([path]) => path.endsWith('.java')).flatMap(([, code]) => code === source ? [] : classesOf(code))
    const types = new Map<string, TypeInfo>(Object.entries(BUILTIN_TYPES))
    types.set('Klonk', klonk)
    for (const t of [...project, ...own]) types.set(t.name, t)
    return { text, imported, staticImported, own, project, types }
  }

  function typeOf(expression: string, ctx: ReturnType<typeof context>, offset: number): { type: TypeInfo, isStatic: boolean } | null {
    const parts = expression.split('.').map(p => p.trim())
    const first = parts[0]!.replace(/\(.*\)$/, '')
    const locals = localsBefore(ctx.text, offset)
    let current: { type: TypeInfo, isStatic: boolean } | null = null
    const enclosing = ctx.own.find(c => new RegExp(String.raw`\b(class|interface|enum|record)\s+${c.name}\b`).test(ctx.text.slice(0, offset)))
    if (first === 'this' && enclosing) current = { type: enclosing, isStatic: false }
    else if (locals.has(first)) {
      const type = baseType(locals.get(first)!)
      current = type === 'array' ? { type: ARRAY, isStatic: false } : ctx.types.has(type) ? { type: ctx.types.get(type)!, isStatic: false } : null
    }
    else if (enclosing?.members.some(m => m.name === first && m.kind !== 'method')) {
      const type = baseType(enclosing.members.find(m => m.name === first)!.type)
      current = type === 'array' ? { type: ARRAY, isStatic: false } : ctx.types.has(type) ? { type: ctx.types.get(type)!, isStatic: false } : null
    }
    else if (ctx.types.has(first)) current = { type: ctx.types.get(first)!, isStatic: true }
    for (const part of parts.slice(1)) {
      if (!current) return null
      const member = current.type.members.find(m => m.name === part.replace(/\(.*\)$/, ''))
      const type = member && baseType(member.type)
      current = type === 'array' ? { type: ARRAY, isStatic: false } : type && ctx.types.has(type) ? { type: ctx.types.get(type)!, isStatic: false } : null
    }
    return current
  }

  function toItem(member: Member): CompletionItem {
    return { label: member.name, kind: member.kind, detail: member.detail, documentation: member.documentation }
  }

  return {
    complete(source: string, offset: number, files: Record<string, string> = {}): CompletionItem[] {
      const ctx = context(source, files)
      const before = ctx.text.slice(0, offset)
      // Mitglieder nach „ausdruck.“ (auch Ketten wie `System.out.` oder `klonk.name.`)
      const access = /((?:[A-Za-z_]\w*(?:\([^()]*\))?\s*\.\s*)*[A-Za-z_]\w*(?:\([^()]*\))?)\s*\.\s*\w*$/.exec(before)
      if (access) {
        const target = typeOf(access[1]!.replace(/\s+/g, ''), ctx, offset)
        if (!target) return []
        return target.type.members.filter(m => (target.isStatic ? m.isStatic : !m.isStatic) || target.type === ARRAY).map(toItem)
      }
      const items: CompletionItem[] = KEYWORDS.map(k => ({ label: k, kind: 'keyword' }))
      for (const [name, type] of localsBefore(ctx.text, offset)) items.push({ label: name, kind: 'variable', detail: `${type} ${name}` })
      const enclosing = ctx.own.find(c => new RegExp(String.raw`\b(class|interface|enum|record)\s+${c.name}\b`).test(before))
      for (const member of enclosing?.members ?? []) items.push(toItem(member))
      for (const t of [...ctx.own, ...ctx.project]) items.push({ label: t.name, kind: 'class', detail: `class ${t.name}` })
      for (const name of ['String', 'System', 'Math', 'Integer']) items.push({ label: name, kind: 'class', detail: `class java.lang.${name}` })
      items.push({ label: 'Klonk', kind: 'class', detail: 'class klonk.Klonk', documentation: lang === 'de' ? 'Eine Figur der Welt' : 'A character in the world', addImport: ctx.imported ? undefined : 'import klonk.Klonk;' })
      if (ctx.staticImported) for (const member of klonk.members.filter(m => m.isStatic && m.name !== 'all')) items.push(toItem(member))
      const seen = new Set<string>()
      return items.filter(i => !seen.has(i.label) && seen.add(i.label))
    },

    hover(source: string, offset: number, files: Record<string, string> = {}): HoverInfo | null {
      const ctx = context(source, files)
      const word = /[A-Za-z_]\w*$/.exec(ctx.text.slice(0, offset))?.[0] ?? ''
      const rest = /^\w*/.exec(ctx.text.slice(offset))?.[0] ?? ''
      const name = word + rest
      if (!name) return null
      const start = offset - word.length
      const access = /((?:[A-Za-z_]\w*(?:\([^()]*\))?\s*\.\s*)*[A-Za-z_]\w*(?:\([^()]*\))?)\s*\.\s*$/.exec(ctx.text.slice(0, start))
      if (access) {
        const target = typeOf(access[1]!.replace(/\s+/g, ''), ctx, start)
        const member = target?.type.members.find(m => m.name === name)
        return member ? { detail: `${target!.type.name}.${member.detail}`, documentation: member.documentation } : null
      }
      const local = localsBefore(ctx.text, start).get(name)
      if (local) return { detail: `${local} ${name}` }
      if (ctx.types.has(name)) return { detail: `class ${name}`, documentation: name === 'Klonk' ? (lang === 'de' ? 'Eine Figur der Welt: new Klonk(), new Klonk("Klara"), new Klonk(2)' : 'A character in the world: new Klonk(), new Klonk("Klara"), new Klonk(2)') : undefined }
      const member = (ctx.staticImported ? klonk.members.filter(m => m.isStatic) : []).find(m => m.name === name)
        ?? ctx.own.flatMap(c => c.members).find(m => m.name === name)
      return member ? { detail: member.detail, documentation: member.documentation } : null
    },
  }
}
