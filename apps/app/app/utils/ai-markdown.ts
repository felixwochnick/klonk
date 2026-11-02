// Antworten des KI-Assistenten: kleines Markdown ohne HTML (kein v-html ⇒ keine Skripte aus Modellantworten)

export type AiInline = { kind: 'text' | 'code' | 'bold', value: string }
export type AiBlock
  = | { type: 'code', lang: string, code: string, complete: boolean }
    | { type: 'text', lines: AiInline[][] }

const FENCE = /```([\w#+-]*)[^\n]*\n?([\s\S]*?)(```|$)/g

/** `code` und **fett** innerhalb einer Zeile */
function inline(line: string): AiInline[] {
  const parts: AiInline[] = []
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g
  let last = 0
  for (const match of line.matchAll(pattern)) {
    if (match.index > last) parts.push({ kind: 'text', value: line.slice(last, match.index) })
    parts.push(match[1] !== undefined ? { kind: 'code', value: match[1] } : { kind: 'bold', value: match[2]! })
    last = match.index + match[0].length
  }
  if (last < line.length) parts.push({ kind: 'text', value: line.slice(last) })
  return parts
}

function text(value: string): AiBlock | null {
  const trimmed = value.replace(/^\n+|\n+$/g, '')
  if (!trimmed) return null
  // Überschriften als fette Zeile
  return { type: 'text', lines: trimmed.split('\n').map(line => (/^#{1,6}\s/.test(line) ? [{ kind: 'bold', value: line.replace(/^#+\s*/, '') }] : inline(line))) }
}

/** Zerlegt eine (auch noch unvollständige, gestreamte) Antwort in Text- und Codeblöcke */
export function parseAiMarkdown(source: string): AiBlock[] {
  const blocks: AiBlock[] = []
  let last = 0
  for (const match of source.matchAll(FENCE)) {
    const before = text(source.slice(last, match.index))
    if (before) blocks.push(before)
    blocks.push({ type: 'code', lang: match[1] ?? '', code: match[2]!.replace(/\n$/, ''), complete: match[3] === '```' })
    last = match.index + match[0].length
    if (!match[0]) break
  }
  const rest = text(source.slice(last))
  if (rest) blocks.push(rest)
  return blocks
}
