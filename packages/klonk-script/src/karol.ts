/**
 * Robot-Karol-Programme (`.kdp`, Robot Karol 1.x–3.0) nach Klonk-Script übersetzen.
 * Karol: Groß-/Kleinschreibung egal, Blöcke enden mit `*wiederhole` bzw. `endewiederhole`, Kommentare in `{ … }`,
 * mehrere Anweisungen dürfen in einer Zeile stehen. Was Klonk nicht kennt (Quader, Rucksack, Ton), wird als Kommentar
 * übernommen und als Hinweis gemeldet.
 */
import { BUILTIN_INDEX, KEYWORD_INDEX } from './languages'

export type KarolWarning = { code: 'cube' | 'backpack' | 'sound' | 'unknown_call' | 'syntax', line: number, name?: string }
export type KarolConversion = { source: string, warnings: KarolWarning[] }

type Token = { kind: 'word' | 'number' | 'end' | 'comment' | 'punct', text: string, line: number }

/** `{ … }` als Kommentar, `*wort` als Ende-Markierung, Wörter mit Umlauten */
function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let line = 1
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '\n') {
      line++
      i++
    }
    else if (/\s/.test(c)) {
      i++
    }
    else if (c === '{') {
      const end = text.indexOf('}', i)
      const body = text.slice(i + 1, end < 0 ? text.length : end)
      tokens.push({ kind: 'comment', text: body.trim(), line })
      line += body.split('\n').length - 1
      i = end < 0 ? text.length : end + 1
    }
    else if (c === '*') {
      const match = /^\*\s*([\p{L}_]+)/u.exec(text.slice(i))
      tokens.push({ kind: 'end', text: (match?.[1] ?? '').toLowerCase(), line })
      i += match ? match[0].length : 1
    }
    else if (/\d/.test(c)) {
      const match = /^\d+/.exec(text.slice(i))!
      tokens.push({ kind: 'number', text: match[0], line })
      i += match[0].length
    }
    else if (/[\p{L}_]/u.test(c)) {
      const match = /^[\p{L}\d_]+/u.exec(text.slice(i))!
      const word = match[0]
      // `endewiederhole`, `endewenn` … wie `*wiederhole`
      const ende = /^ende(wiederhole|wenn|anweisung|bedingung|programm)$/i.exec(word)
      tokens.push(ende ? { kind: 'end', text: ende[1]!.toLowerCase(), line } : { kind: 'word', text: word, line })
      i += word.length
    }
    else {
      tokens.push({ kind: 'punct', text: c, line })
      i++
    }
  }
  return tokens
}

const COLORS: Record<string, string> = { rot: 'rot', gelb: 'gelb', blau: 'blau', grün: 'grün', gruen: 'grün', schwarz: 'schwarz' }
const DIRECTIONS: Record<string, string> = { istnorden: 'schautNachNorden', istosten: 'schautNachOsten', istsüden: 'schautNachSüden', istsueden: 'schautNachSüden', istwesten: 'schautNachWesten' }

class KarolTranslator {
  private pos = 0
  readonly warnings: KarolWarning[] = []
  /** Eigene Anweisungen/Bedingungen: kleingeschrieben ⇒ Name in Klonk-Script */
  private readonly procedures = new Map<string, string>()
  private readonly conditions = new Map<string, string>()
  private inCondition = false

  constructor(private readonly tokens: Token[]) {
    // Definitionen vorab sammeln (Aufrufe dürfen davor stehen; Karol ignoriert die Schreibweise)
    for (let i = 0; i < tokens.length - 1; i++) {
      const word = tokens[i]!.text.toLowerCase()
      const next = tokens[i + 1]!
      if (tokens[i]!.kind !== 'word' || next.kind !== 'word') continue
      if (word === 'anweisung') this.procedures.set(next.text.toLowerCase(), safeName(next.text))
      if (word === 'bedingung') this.conditions.set(next.text.toLowerCase(), safeName(next.text))
    }
  }

  private peek(offset = 0) {
    return this.tokens[this.pos + offset]
  }

  private isWord(word: string, offset = 0) {
    const token = this.peek(offset)
    return token?.kind === 'word' && token.text.toLowerCase() === word
  }

  private next() {
    return this.tokens[this.pos++]
  }

  private expectEnd(kind: string) {
    const token = this.peek()
    if (token?.kind === 'end' && token.text === kind) {
      this.pos++
      return
    }
    this.warnings.push({ code: 'syntax', line: token?.line ?? this.tokens.at(-1)?.line ?? 1, name: `*${kind}` })
  }

  /** Optionales Argument in Klammern */
  private argument(): string | null {
    if (this.peek()?.text !== '(') return null
    this.pos++
    const parts: string[] = []
    while (this.peek() && this.peek()!.text !== ')') parts.push(this.next()!.text)
    this.pos++
    return parts.join('').trim() || null
  }

  translate(): string {
    const out: string[] = []
    while (this.peek()) {
      const token = this.peek()!
      if (this.isWord('anweisung') || this.isWord('bedingung')) {
        const condition = this.isWord('bedingung')
        this.pos++
        const name = this.next()!
        this.inCondition = condition
        const body = this.block(1)
        this.expectEnd(condition ? 'bedingung' : 'anweisung')
        this.inCondition = false
        const klonkName = safeName(name.text)
        if (condition) out.push(`funktion ${klonkName}`, '  var ergebnis = falsch', ...body, '  zurück ergebnis', 'ende', '')
        else out.push(`anweisung ${klonkName}`, ...body, 'ende', '')
      }
      else if (this.isWord('programm')) {
        this.pos++
        out.push(...this.block(0))
        this.expectEnd('programm')
      }
      else if (token.kind === 'end') {
        // Überzähliges Ende
        this.warnings.push({ code: 'syntax', line: token.line, name: `*${token.text}` })
        this.pos++
      }
      else {
        out.push(...this.statement(0))
      }
    }
    return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
  }

  /** Anweisungen bis zu einem Ende oder `sonst` */
  private block(depth: number): string[] {
    const lines: string[] = []
    while (this.peek() && this.peek()!.kind !== 'end' && !this.isWord('sonst')
      && !this.isWord('anweisung') && !this.isWord('bedingung') && !this.isWord('programm')) {
      lines.push(...this.statement(depth))
    }
    return lines
  }

  private statement(depth: number): string[] {
    const pad = '  '.repeat(depth)
    const token = this.next()!
    if (token.kind === 'comment') return token.text.split('\n').map(l => `${pad}// ${l.trim()}`.trimEnd())
    if (token.kind !== 'word') {
      this.warnings.push({ code: 'syntax', line: token.line, name: token.text })
      return []
    }
    const word = token.text.toLowerCase()

    if (word === 'wiederhole') return this.repeat(depth)
    if (word === 'wenn') {
      const condition = this.condition()
      if (this.isWord('dann')) this.pos++
      const then = this.block(depth + 1)
      const lines = [`${pad}wenn ${condition} dann`, ...then]
      if (this.isWord('sonst')) {
        this.pos++
        lines.push(`${pad}sonst`, ...this.block(depth + 1))
      }
      this.expectEnd('wenn')
      return [...lines, `${pad}ende`]
    }
    if ((word === 'wahr' || word === 'falsch') && this.inCondition) return [`${pad}ergebnis = ${word}`]

    const arg = this.argument()
    const n = arg && /^\d+$/.test(arg) ? Number(arg) : null
    const color = arg ? COLORS[arg.toLowerCase()] : undefined
    const times = (command: string) => (n && n > 1 ? [`${pad}wiederhole ${n} mal`, `${pad}  ${command}`, `${pad}ende`] : [`${pad}${command}`])
    switch (word) {
      case 'schritt': return [`${pad}schritt${n && n > 1 ? `(${n})` : ''}`]
      case 'linksdrehen': return [`${pad}linksDrehen`]
      case 'rechtsdrehen': return [`${pad}rechtsDrehen`]
      case 'hinlegen': return color ? [`${pad}hinlegen(${color})`] : times('hinlegen')
      case 'aufheben': return times('aufheben')
      case 'markesetzen': return [`${pad}markieren${color ? `(${color})` : ''}`]
      // Karol löscht auch ohne Marke stillschweigend – Klonk meldet dann einen Fehler
      case 'markelöschen':
      case 'markeloeschen': return [`${pad}wenn istMarke dann`, `${pad}  markeLöschen`, `${pad}ende`]
      case 'marke': return [`${pad}wenn istMarke dann`, `${pad}  markeLöschen`, `${pad}sonst`, `${pad}  markieren`, `${pad}ende`]
      case 'warten': return [`${pad}warte(${n ? n / 1000 : 1})`]
      case 'beenden': return [`${pad}stopp`]
      case 'schnell':
      case 'langsam': return [`${pad}// Robot Karol: ${token.text} – in Klonk über den Tempo-Regler`]
      case 'ton':
        this.warnings.push({ code: 'sound', line: token.line })
        return [`${pad}// Robot Karol: Ton – in Klonk nicht verfügbar`]
      case 'quader':
      case 'entfernen':
        this.warnings.push({ code: 'cube', line: token.line, name: token.text })
        return [`${pad}// Robot Karol: ${token.text} – Quader setzen/entfernen gibt es in Klonk-Programmen nicht`]
    }
    const procedure = this.procedures.get(word)
    if (procedure) return [`${pad}${procedure}`]
    this.warnings.push({ code: 'unknown_call', line: token.line, name: token.text })
    return [`${pad}${safeName(token.text)}`]
  }

  private repeat(depth: number): string[] {
    const pad = '  '.repeat(depth)
    const close = () => [`${pad}ende`]
    if (this.peek()?.kind === 'number') {
      const count = this.next()!.text
      if (this.isWord('mal')) this.pos++
      const body = this.block(depth + 1)
      this.expectEnd('wiederhole')
      return [`${pad}wiederhole ${count} mal`, ...body, ...close()]
    }
    if (this.isWord('solange') || this.isWord('bis')) {
      const mode = this.next()!.text.toLowerCase()
      const condition = this.condition()
      const body = this.block(depth + 1)
      this.expectEnd('wiederhole')
      return [`${pad}wiederhole ${mode} ${condition}`, ...body, ...close()]
    }
    if (this.isWord('immer')) this.pos++
    const body = this.block(depth + 1)
    this.expectEnd('wiederhole')
    // Nachprüfende Schleife: `*wiederhole solange B` / `*wiederhole bis B`
    if (this.isWord('solange') || this.isWord('bis')) {
      const mode = this.next()!.text.toLowerCase()
      const condition = this.condition()
      const exit = mode === 'solange' ? `nicht (${condition})` : condition
      return [`${pad}wiederhole immer`, ...body, `${pad}  wenn ${exit} dann`, `${pad}    abbrechen`, `${pad}  ende`, ...close()]
    }
    return [`${pad}wiederhole immer`, ...body, ...close()]
  }

  /** Bedingung mit `nicht`, `und`, `oder` und Klammern */
  private condition(): string {
    let left = this.conjunction()
    while (this.isWord('oder')) {
      this.pos++
      left = `${left} oder ${this.conjunction()}`
    }
    return left
  }

  private conjunction(): string {
    let left = this.unary()
    while (this.isWord('und')) {
      this.pos++
      left = `${left} und ${this.unary()}`
    }
    return left
  }

  private unary(): string {
    if (this.isWord('nicht')) {
      this.pos++
      return `nicht ${this.unary()}`
    }
    if (this.peek()?.text === '(') {
      this.pos++
      const inner = this.condition()
      if (this.peek()?.text === ')') this.pos++
      return `(${inner})`
    }
    const token = this.next()
    if (!token) return 'falsch'
    const word = token.text.toLowerCase()
    const negated = word.startsWith('nichtist')
    const base = negated ? word.slice(5) : word
    const not = (text: string) => (negated ? `nicht ${text}` : text)
    const arg = this.argument()
    const n = arg && /^\d+$/.test(arg) ? Number(arg) : null
    const color = arg ? COLORS[arg.toLowerCase()] : undefined
    switch (base) {
      case 'wahr': return 'wahr'
      case 'falsch': return 'falsch'
      case 'istwand': return not('istWand')
      case 'istziegel':
        if (n !== null) return negated ? `ziegelAnzahl != ${n}` : `ziegelAnzahl == ${n}`
        return not(color ? `istZiegel(${color})` : 'istZiegel')
      case 'istmarke': return not(color ? `istMarke(${color})` : 'istMarke')
      // Rucksack: Klonk hat unbegrenzt Ziegel – voll nie, leer nie, Ziegel immer
      case 'istvoll':
      case 'istleer':
        this.warnings.push({ code: 'backpack', line: token.line, name: token.text })
        return negated ? 'wahr' : 'falsch'
      case 'hatziegel':
        this.warnings.push({ code: 'backpack', line: token.line, name: token.text })
        return 'wahr'
    }
    if (DIRECTIONS[base]) return not(DIRECTIONS[base])
    const condition = this.conditions.get(word)
    if (condition) return `${condition}()`
    this.warnings.push({ code: 'unknown_call', line: token.line, name: token.text })
    return `${safeName(token.text)}()`
  }
}

/** Eigene Namen, die in Klonk-Script ein Schlüsselwort oder Befehl sind, bekommen ein `_` */
function safeName(name: string) {
  const lower = name.toLowerCase()
  return KEYWORD_INDEX.has(lower) || BUILTIN_INDEX.has(lower) || lower === 'ergebnis' ? `${name}_` : name
}

/** Robot-Karol-Programm (Text, z. B. aus einer `.kdp`-Datei) nach Klonk-Script übersetzen */
export function convertKarolProgram(text: string): KarolConversion {
  const translator = new KarolTranslator(tokenize(text.replace(/\r\n?/g, '\n')))
  const source = translator.translate()
  return { source, warnings: translator.warnings }
}

/** `.kdp`/`.kdw` sind Latin-1 (Windows) – UTF-8 nur, wenn es gültig ist */
export function decodeKarolFile(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
