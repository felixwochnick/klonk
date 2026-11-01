import { KlonkError } from './errors'
import { BUILTIN_INDEX, KEYWORD_INDEX, type BuiltinName, type Keyword } from './languages'

export type TokenType = 'keyword' | 'builtin' | 'identifier' | 'number' | 'string' | 'operator' | 'newline' | 'comment' | 'eof'

export type Token = {
  type: TokenType
  /** Originaltext */
  text: string
  /** kanonischer Name bei Schlüsselwörtern/Befehlen, Wert bei Zahlen/Texten */
  value?: string | number
  line: number
  column: number
  endColumn: number
}

const OPERATORS = ['==', '!=', '<>', '<=', '>=', '=', '<', '>', '+', '-', '*', '/', '%', '(', ')', ',', ';']
const IDENT_START = /[\p{L}_]/u
const IDENT_PART = /[\p{L}\p{N}_]/u

/** Zerlegt Quelltext in Tokens. Kommentare (`//`, `#`) bleiben für Übersetzen und Hervorhebung erhalten. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let lineStart = 0

  const push = (type: TokenType, start: number, end: number, value?: string | number) =>
    tokens.push({ type, text: source.slice(start, end), value, line, column: start - lineStart + 1, endColumn: end - lineStart + 1 })

  while (i < source.length) {
    const c = source[i]!

    if (c === '\n') {
      push('newline', i, i + 1)
      i++
      line++
      lineStart = i
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }
    if (c === '#' || (c === '/' && source[i + 1] === '/')) {
      const start = i
      while (i < source.length && source[i] !== '\n') i++
      push('comment', start, i)
      continue
    }
    if (/\d/.test(c)) {
      const start = i
      while (/\d/.test(source[i] ?? '')) i++
      // Dezimalpunkt (das Komma trennt Argumente)
      if (source[i] === '.' && /\d/.test(source[i + 1] ?? '')) {
        i++
        while (/\d/.test(source[i] ?? '')) i++
      }
      push('number', start, i, Number(source.slice(start, i)))
      continue
    }
    if (c === '"' || c === '\'') {
      const start = i
      i++
      let value = ''
      while (i < source.length && source[i] !== c && source[i] !== '\n') {
        if (source[i] === '\\' && i + 1 < source.length) {
          const next = source[i + 1]!
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next
          i += 2
          continue
        }
        value += source[i]
        i++
      }
      if (source[i] !== c) {
        throw new KlonkError('unterminated_string', {}, { line, column: start - lineStart + 1, endLine: line, endColumn: i - lineStart + 1 })
      }
      i++
      push('string', start, i, value)
      continue
    }
    if (IDENT_START.test(c)) {
      const start = i
      while (i < source.length && IDENT_PART.test(source[i]!)) i++
      const text = source.slice(start, i)
      const lower = text.toLowerCase()
      const keyword = KEYWORD_INDEX.get(lower)
      const builtin = BUILTIN_INDEX.get(lower)
      if (keyword) push('keyword', start, i, keyword satisfies Keyword)
      else if (builtin) push('builtin', start, i, builtin satisfies BuiltinName)
      else push('identifier', start, i, text)
      continue
    }
    const op = OPERATORS.find(o => source.startsWith(o, i))
    if (op) {
      push('operator', i, i + op.length, op)
      i += op.length
      continue
    }
    throw new KlonkError('unexpected_character', { char: c }, { line, column: i - lineStart + 1, endLine: line, endColumn: i - lineStart + 2 })
  }

  tokens.push({ type: 'eof', text: '', line, column: i - lineStart + 1, endColumn: i - lineStart + 1 })
  return tokens
}
