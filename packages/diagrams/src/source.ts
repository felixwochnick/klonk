import type { SyntaxNode } from '@lezer/common'

/** Höchstlänge von Texten in Diagrammen (längere werden mit … gekürzt) */
export const MAX_TEXT = 70

/** Quelltext mit Zeilenanfängen – Texte und Zeilen von Syntaxknoten */
export class Source {
  private lineStarts: number[] = [0]

  constructor(readonly text: string) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.lineStarts.push(i + 1)
  }

  /** Zeile (1-basiert) einer Position */
  line(pos: number) {
    let lo = 0
    let hi = this.lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.lineStarts[mid]! <= pos) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  slice(from: number, to: number) {
    return this.text.slice(from, to)
  }

  /** Text eines Knotens, auf eine Zeile verdichtet */
  of(node: SyntaxNode | null | undefined, max = MAX_TEXT) {
    return node ? compact(this.text.slice(node.from, node.to), max) : ''
  }
}

/** Leerraum zusammenfassen, Kommentare am Zeilenende entfernen und kürzen */
export function compact(text: string, max = MAX_TEXT) {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length > max ? `${single.slice(0, max - 1).trimEnd()}…` : single
}

/** Kinder eines Syntaxknotens */
export function children(node: SyntaxNode) {
  const result: SyntaxNode[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child)
  return result
}

/** Klammern um eine Bedingung entfernen: `(x > 1)` ⇒ `x > 1` */
export function unparen(text: string) {
  let result = text.trim()
  while (result.startsWith('(') && result.endsWith(')') && balanced(result.slice(1, -1))) result = result.slice(1, -1).trim()
  return result
}

function balanced(text: string) {
  let depth = 0
  for (const char of text) {
    if (char === '(') depth++
    else if (char === ')' && --depth < 0) return false
  }
  return depth === 0
}

/** Alle Nachfahren eines Knotens (Tiefensuche) */
export function walk(node: SyntaxNode, visit: (node: SyntaxNode) => void) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    visit(child)
    walk(child, visit)
  }
}
