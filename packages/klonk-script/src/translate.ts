import { spell, type BuiltinName, type Keyword, type ScriptLanguage } from './languages'
import { tokenize } from './lexer'

/**
 * Übersetzt ein Programm in eine andere Sprache (Schlüsselwörter und eingebaute Befehle),
 * Formatierung, Kommentare und eigene Namen bleiben unverändert.
 */
export function translate(source: string, target: ScriptLanguage): string {
  const tokens = tokenize(source)
  let result = ''
  let offset = 0
  const lines = source.split('\n')
  const lineOffsets: number[] = []
  let sum = 0
  for (const line of lines) {
    lineOffsets.push(sum)
    sum += line.length + 1
  }

  for (const token of tokens) {
    if (token.type !== 'keyword' && token.type !== 'builtin') continue
    const start = lineOffsets[token.line - 1]! + token.column - 1
    const end = start + token.text.length
    result += source.slice(offset, start) + spell(token.value as Keyword | BuiltinName, target)
    offset = end
  }
  return result + source.slice(offset)
}

/** Erkennt die überwiegend verwendete Sprache eines Programms */
export function detectLanguage(source: string, fallback: ScriptLanguage = 'de'): ScriptLanguage {
  let tokens
  try {
    tokens = tokenize(source)
  }
  catch {
    return fallback
  }
  const votes: Record<ScriptLanguage, number> = { de: 0, en: 0 }
  for (const token of tokens) {
    if (token.type !== 'keyword' && token.type !== 'builtin') continue
    const canonical = token.value as Keyword | BuiltinName
    for (const lang of Object.keys(votes) as ScriptLanguage[]) {
      if (spell(canonical, lang).toLowerCase() === token.text.toLowerCase()) votes[lang]++
    }
  }
  return votes.de === votes.en ? fallback : votes.de > votes.en ? 'de' : 'en'
}
