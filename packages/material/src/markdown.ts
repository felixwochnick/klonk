import { isCodeLanguage } from '@klonk/learn'
import type { Inline, Line, MaterialBlock } from './model'

// Texte der Lernmodule (kleines Markdown wie in `LearnText.vue`): Absätze, Listen mit „- “, `code`, **fett**,
// Codeblöcke. Folgen Codeblöcke in mehreren Programmiersprachen direkt aufeinander, bleibt nur der passende.

const FENCE = /```([\w#+-]*)[^\n]*\n([\s\S]*?)```/g

/** `code` und **fett** innerhalb einer Zeile */
export function inline(text: string): Line {
  const parts: Inline[] = []
  let last = 0
  for (const match of text.matchAll(/`([^`]+)`|\*\*([^*]+)\*\*/g)) {
    if (match.index > last) parts.push({ kind: 'text', value: text.slice(last, match.index) })
    parts.push(match[1] !== undefined ? { kind: 'code', value: match[1] } : { kind: 'bold', value: match[2]! })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
  return parts
}

type Raw = { type: 'code', lang: string, code: string } | { type: 'text', text: string }

function split(source: string): Raw[] {
  const raw: Raw[] = []
  let last = 0
  for (const match of source.matchAll(FENCE)) {
    raw.push({ type: 'text', text: source.slice(last, match.index) })
    raw.push({ type: 'code', lang: match[1] ?? '', code: match[2]!.replace(/\n$/, '') })
    last = match.index + match[0].length
  }
  raw.push({ type: 'text', text: source.slice(last) })
  return raw.filter(part => part.type === 'code' || part.text.trim())
}

/** Aus einer Gruppe direkt aufeinanderfolgender Codeblöcke in Programmiersprachen nur die gewählte Sprache behalten */
function pickLanguage(raw: Raw[], language: string | null | undefined): Raw[] {
  if (!language || !isCodeLanguage(language)) return raw
  const isCode = (part: Raw | undefined) => part?.type === 'code' && isCodeLanguage(part.lang)
  return raw.filter((part, i) => {
    if (!isCode(part)) return true
    let from = i
    while (from > 0 && isCode(raw[from - 1])) from--
    let to = i
    while (to + 1 < raw.length && isCode(raw[to + 1])) to++
    const group = raw.slice(from, to + 1) as { lang: string }[]
    const exact = group.findIndex(b => b.lang === language)
    const pick = exact >= 0 ? exact : group.findIndex(b => language === 'typescript' && b.lang === 'javascript')
    return i - from === (pick >= 0 ? pick : 0)
  })
}

/** Markdown eines Lernmodul-Texts ⇒ Bausteine (Absätze, Listen, Code) */
export function markdownBlocks(source: string, language?: string | null): MaterialBlock[] {
  const blocks: MaterialBlock[] = []
  for (const part of pickLanguage(split(source), language)) {
    if (part.type === 'code') {
      blocks.push({ type: 'code', code: part.code })
      continue
    }
    let current: MaterialBlock | null = null
    for (const rawLine of part.text.split('\n')) {
      const line = rawLine.trimEnd()
      if (!line.trim()) {
        current = null
        continue
      }
      // Überschriften als fette Zeile, Zitate als normaler Text
      const heading = /^#{1,6}\s+/.exec(line)
      const text = heading ? line.slice(heading[0].length) : line.replace(/^>\s?/, '')
      if (/^\s*[-*]\s+/.test(text)) {
        if (current?.type !== 'list') blocks.push(current = { type: 'list', items: [] })
        current.items.push(inline(text.replace(/^\s*[-*]\s+/, '')))
        continue
      }
      if (current?.type === 'list' && /^\s{2,}\S/.test(rawLine)) {
        // Fortsetzung eines Listenpunkts
        const item = current.items.at(-1)!
        item.push({ kind: 'text', value: ' ' }, ...inline(text.trim()))
        continue
      }
      if (current?.type !== 'paragraph') blocks.push(current = { type: 'paragraph', lines: [] })
      current.lines.push(heading ? [{ kind: 'bold', value: text }] : inline(text))
    }
  }
  return blocks
}

/** Markdown ⇒ reiner Text (Sprechernotizen) */
export function markdownPlain(source: string, language?: string | null): string {
  return markdownBlocks(source, language).map((block) => {
    if (block.type === 'code') return block.code
    if (block.type === 'list') return block.items.map(item => `• ${item.map(p => p.value).join('')}`).join('\n')
    if (block.type === 'paragraph') return block.lines.map(line => line.map(p => p.value).join('')).join('\n')
    return ''
  }).filter(Boolean).join('\n\n')
}
