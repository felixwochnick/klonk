import type { Routine, StructBlock } from '../model'
import { Canvas, type RenderedDiagram, type RenderOptions } from './common'

export type StructogramLabels = {
  /** Titel des Hauptprogramms */
  main: string
  yes: string
  no: string
  /** Fallauswahl: sonst */
  otherwise: string
}

export type StructogramOptions = RenderOptions & {
  labels: StructogramLabels
  /** Hervorgehobene Zeile (z. B. beim Anhalten im Debugger) */
  activeLine?: number | null
}

/** Breite des Rahmens links neben Schleifenrümpfen */
const INDENT = 20
const PAD = 7

/**
 * Struktogramme nach DIN 66261 (Nassi-Shneiderman), untereinander. Jedes Element trägt `data-line`
 * (Klick ⇒ Zeile im Editor), die Zeile `activeLine` ist hervorgehoben.
 */
export function renderStructograms(routines: Routine[], options: StructogramOptions): RenderedDiagram {
  const c = new Canvas(options)
  const { labels, activeLine } = options
  const row = Math.round(c.size * 2)
  const gap = row

  const textW = (text: string) => c.width(text) + 2 * PAD
  const emptyW = textW('∅')

  // Mindestbreiten
  const seqMin = (blocks: StructBlock[]): number => (blocks.length ? Math.max(...blocks.map(minWidth)) : emptyW)
  function minWidth(block: StructBlock): number {
    switch (block.kind) {
      case 'action': return textW(block.text)
      case 'call': return textW(block.text) + 2 * PAD
      case 'exit': return textW(block.text) + 14
      case 'if': {
        const labelsW = textW(labels.yes) + textW(labels.no)
        return Math.max(Math.round((textW(block.condition) + labelsW) * 1.15), seqMin(block.then) + seqMin(block.else))
      }
      case 'switch': {
        const cases = block.cases.reduce((sum, k) => sum + Math.max(seqMin(k.body), textW(k.label ?? labels.otherwise)), 0)
        return Math.max(cases, Math.round(textW(block.subject) * 1.6))
      }
      case 'loop':
      case 'block': return Math.max(textW(block.header), INDENT + seqMin(block.body))
    }
  }

  // Höhen bei gegebener Breite
  const seqHeight = (blocks: StructBlock[], width: number) => (blocks.length ? blocks.reduce((sum, b) => sum + height(b, width), 0) : row)
  function split(mins: number[], width: number) {
    const total = mins.reduce((a, b) => a + b, 0)
    const widths = mins.map(m => Math.floor((m / total) * width))
    widths[widths.length - 1]! += width - widths.reduce((a, b) => a + b, 0)
    return widths
  }
  function height(block: StructBlock, width: number): number {
    switch (block.kind) {
      case 'action':
      case 'call':
      case 'exit': return row
      case 'if': {
        const [tw, ew] = split([seqMin(block.then), seqMin(block.else)], width) as [number, number]
        return 2 * row + Math.max(seqHeight(block.then, tw), seqHeight(block.else, ew))
      }
      case 'switch': {
        const widths = split(block.cases.map(k => Math.max(seqMin(k.body), textW(k.label ?? labels.otherwise))), width)
        return 2 * row + Math.max(row, ...block.cases.map((k, i) => seqHeight(k.body, widths[i]!)))
      }
      case 'loop':
      case 'block': return row + seqHeight(block.body, width - INDENT)
    }
  }

  const fillFor = (line: number) => (activeLine && line === activeLine ? c.theme.active : c.theme.background)
  const mid = (y: number) => y + row / 2

  function drawSeq(blocks: StructBlock[], x: number, y: number, w: number, h: number) {
    if (!blocks.length) {
      c.rect(x, y, w, h)
      c.text(x + w / 2, y + row / 2, '∅', { 'text-anchor': 'middle', 'fill': c.theme.muted })
      return
    }
    let cy = y
    blocks.forEach((block, i) => {
      // Letztes Element füllt den Rest (gleich hohe Spalten in Verzweigungen)
      const bh = i === blocks.length - 1 ? y + h - cy : height(block, w)
      draw(block, x, cy, w, bh)
      cy += bh
    })
  }

  function draw(block: StructBlock, x: number, y: number, w: number, h: number) {
    c.open({ 'data-line': block.line, 'data-kind': block.kind })
    switch (block.kind) {
      case 'action':
        c.rect(x, y, w, h, { fill: fillFor(block.line) })
        c.text(x + PAD, mid(y), block.text)
        break
      case 'call':
        c.rect(x, y, w, h, { fill: fillFor(block.line) })
        c.line(x + PAD, y, x + PAD, y + h)
        c.line(x + w - PAD, y, x + w - PAD, y + h)
        c.text(x + 2 * PAD, mid(y), block.text)
        break
      case 'exit':
        c.rect(x, y, w, h, { fill: fillFor(block.line) })
        c.path(`M${x} ${y}L${x + 10} ${y + h / 2}L${x} ${y + h}`)
        c.text(x + 14 + PAD / 2, mid(y), block.text)
        break
      case 'if': {
        const [tw, ew] = split([seqMin(block.then), seqMin(block.else)], w) as [number, number]
        const hh = 2 * row
        c.rect(x, y, w, hh, { fill: fillFor(block.line) })
        c.path(`M${x} ${y}L${x + tw} ${y + hh}L${x + w} ${y}`)
        // Bedingung über der Spitze, so weit wie möglich mittig
        const cw = c.width(block.condition)
        const cx = Math.min(Math.max(x + tw, x + PAD + cw / 2), x + w - PAD - cw / 2)
        c.text(cx, y + row / 2, block.condition, { 'text-anchor': 'middle' })
        c.text(x + PAD, y + hh - row / 2, labels.yes, { fill: c.theme.muted })
        c.text(x + w - PAD, y + hh - row / 2, labels.no, { 'text-anchor': 'end', 'fill': c.theme.muted })
        drawSeq(block.then, x, y + hh, tw, h - hh)
        drawSeq(block.else, x + tw, y + hh, ew, h - hh)
        break
      }
      case 'switch': {
        const widths = split(block.cases.map(k => Math.max(seqMin(k.body), textW(k.label ?? labels.otherwise))), w)
        const hh = 2 * row
        const last = widths.at(-1)!
        c.rect(x, y, w, hh, { fill: fillFor(block.line) })
        c.path(`M${x} ${y}L${x + w - last} ${y + hh}L${x + w} ${y}`)
        const sw = c.width(block.subject)
        const sx = Math.min(Math.max(x + w - last, x + PAD + sw / 2), x + w - PAD - sw / 2)
        c.text(sx, y + row / 2, block.subject, { 'text-anchor': 'middle' })
        let cx = x
        block.cases.forEach((k, i) => {
          const cw = widths[i]!
          const label = k.label ?? labels.otherwise
          // Trennlinie zwischen den Fällen von der Diagonale bis zum Rumpf
          if (i > 0 && i < block.cases.length - 1) c.line(cx, y + (hh * (cx - x)) / (w - last), cx, y + hh)
          c.text(cx + cw / 2, y + hh - row / 2, label, { 'text-anchor': 'middle', 'fill': c.theme.muted })
          drawSeq(k.body, cx, y + hh, cw, h - hh)
          cx += cw
        })
        break
      }
      case 'loop':
      case 'block': {
        c.rect(x, y, w, h, { fill: fillFor(block.line) })
        const post = block.kind === 'loop' && block.test === 'post'
        c.text(x + PAD, post ? y + h - row / 2 : mid(y), block.header, { italic: block.kind === 'block' })
        drawSeq(block.body, x + INDENT, post ? y : y + row, w - INDENT, h - row)
        break
      }
    }
    c.close()
  }

  let width = 0
  for (const routine of routines) width = Math.max(width, seqMin(routine.body), c.width(title(routine), { bold: true }) + 2 * PAD)
  let y = 0
  routines.forEach((routine, i) => {
    if (i > 0) y += gap
    const bodyH = seqHeight(routine.body, width)
    c.open({ 'data-routine': routine.id, 'data-line': routine.line })
    c.rect(0, y, width, row, { fill: c.theme.header })
    c.text(PAD, y + row / 2, title(routine), { bold: true })
    c.close()
    drawSeq(routine.body, 0, y + row, width, bodyH)
    c.rect(0, y, width, row + bodyH, { 'fill': 'none', 'stroke-width': 2 })
    y += row + bodyH
  })
  return c.finish('structogram', width, y)

  function title(routine: Routine) {
    return routine.kind === 'main' ? labels.main : routine.className && !routine.signature.startsWith(routine.className) ? `${routine.className}.${routine.signature}` : routine.signature
  }
}
