import PptxGenJS from 'pptxgenjs'
import type { ImageMap, Line, MaterialBlock, MaterialImage, Presentation, Slide } from './model'

// Präsentation als PowerPoint-Datei (PPTX, 16:9) – zum Weiterbearbeiten in Euro-Office, OnlyOffice, LibreOffice
// Impress oder PowerPoint. Inhalte liegen als normale Textfelder, Tabellen und Bilder auf den Folien.

const FONT = 'Arial'
const MONO = 'Courier New'
const INK = '111827'
const MUTED = '6B7280'
const RED = 'C91A09'
const GREEN = '237841'
/** Folie 13,33 × 7,5 Zoll */
const W = 13.333
const H = 7.5
const MARGIN = 0.6
const BODY = { top: 1.85, bottom: 6.8 }

type Pptx = InstanceType<typeof PptxGenJS>
type PptxSlide = ReturnType<Pptx['addSlide']>
type TextRun = { text: string, options?: Record<string, unknown> }

const lineHeight = (size: number) => (size * 1.3) / 72
/** Ungefähre Zeichen je Zeile (Arial ≈ 0,52 em je Zeichen) */
const charsPerLine = (width: number, size: number) => Math.max(10, Math.floor((width * 72) / (size * 0.52)))

function textRuns(line: Line, size: number, options: Record<string, unknown> = {}): TextRun[] {
  return line.map(part => ({
    text: part.value,
    options: {
      fontSize: size,
      bold: part.kind === 'bold',
      ...(part.kind === 'code' ? { fontFace: MONO, highlight: 'F3F4F6' } : {}),
      ...options,
    },
  }))
}

const lineLength = (line: Line) => line.reduce((sum, part) => sum + part.value.length, 0)

/** Höhe eines Bausteins in Zoll bei Schriftgröße `size` und Breite `width` */
function blockHeight(block: MaterialBlock, size: number, width: number): number {
  const cpl = charsPerLine(width, size)
  switch (block.type) {
    case 'paragraph': {
      const s = block.muted ? size * 0.8 : size
      return block.lines.reduce((sum, line) => sum + Math.ceil(Math.max(1, lineLength(line)) / charsPerLine(width, s)), 0) * lineHeight(s) + 0.12
    }
    case 'list': return block.items.reduce((sum, item) => sum + Math.ceil(Math.max(1, lineLength(item)) / (cpl - 4)), 0) * lineHeight(size) * 1.08 + 0.12
    case 'code': return block.code.split('\n').length * lineHeight(codeSize(block.code, size)) * 0.98 + 0.3
    case 'table': return (block.table.rows.length + 1 + (block.table.more ? 1 : 0)) * lineHeight(size * 0.72) * 1.35 + (block.table.caption ? lineHeight(size * 0.8) : 0) + 0.15
    default: return 0
  }
}

const codeSize = (code: string, size: number) => {
  const lines = code.split('\n').length
  return Math.round(Math.min(size * 0.8, lines > 18 ? size * 0.55 : lines > 12 ? size * 0.65 : size * 0.8))
}

function addBlocks(slide: PptxSlide, blocks: MaterialBlock[], area: { x: number, y: number, w: number, h: number }) {
  // Schrift verkleinern, bis alles passt (mindestens 11 pt)
  let size = 20
  const total = (s: number) => blocks.reduce((sum, block) => sum + blockHeight(block, s, area.w), 0)
  while (size > 11 && total(size) > area.h) size--
  let y = area.y
  for (const block of blocks) {
    const h = Math.min(blockHeight(block, size, area.w), area.y + area.h - y)
    if (h <= 0.05) break
    switch (block.type) {
      case 'paragraph': {
        const s = block.muted ? Math.round(size * 0.8) : size
        const runs = block.lines.flatMap((line, i) => {
          const parts = textRuns(line, s, block.muted ? { color: MUTED } : {})
          if (i < block.lines.length - 1 && parts.length) parts[parts.length - 1]!.options!.breakLine = true
          return parts
        })
        slide.addText(runs, { x: area.x, y, w: area.w, h, valign: 'top', fontFace: FONT, color: INK, margin: 0 })
        break
      }
      case 'list': {
        const runs = block.items.flatMap((item) => {
          // Absatzeigenschaften (Aufzählung, Abstände) an jedem Teil – pptxgenjs übernimmt sie je Zeile
          const paragraph = { ...(block.check ? {} : { bullet: { indent: 18 } }), paraSpaceBefore: 2, paraSpaceAfter: 4 }
          const parts = textRuns(item, size, paragraph)
          if (!parts.length) return []
          if (block.check) parts.unshift({ text: '✓  ', options: { fontSize: size, color: GREEN, bold: true, ...paragraph } })
          parts[parts.length - 1]!.options!.breakLine = true
          return parts
        })
        slide.addText(runs, { x: area.x, y, w: area.w, h, valign: 'top', fontFace: FONT, color: INK, margin: 0 })
        break
      }
      case 'code':
        slide.addText(block.code, {
          x: area.x,
          y,
          w: area.w,
          h: h - 0.1,
          valign: 'top',
          fontFace: MONO,
          fontSize: codeSize(block.code, size),
          color: INK,
          fill: { color: 'F3F4F6' },
          line: { color: 'D1D5DB', width: 0.75 },
          margin: 6,
          shape: 'roundRect',
          rectRadius: 0.08,
        })
        break
      case 'table': {
        const { columns, rows, caption, more } = block.table
        let top = y
        const s = Math.round(size * 0.72)
        if (caption) {
          slide.addText(caption, { x: area.x, y: top, w: area.w, h: lineHeight(size * 0.8), fontFace: FONT, fontSize: Math.round(size * 0.8), bold: true, color: INK, margin: 0 })
          top += lineHeight(size * 0.8)
        }
        const header = columns.map(c => ({ text: c, options: { bold: true, fill: { color: 'E5E7EB' } } }))
        const body = rows.map(row => row.map(value => ({ text: value })))
        if (more) body.push([{ text: `… +${more}`, options: { italic: true, color: MUTED, colspan: columns.length } } as never])
        const width = Math.min(area.w, columns.length * 1.6)
        slide.addTable([header, ...body], {
          x: area.x,
          y: top,
          w: width,
          colW: columns.map(() => width / columns.length),
          fontFace: FONT,
          fontSize: s,
          color: INK,
          border: { type: 'solid', pt: 0.5, color: '9CA3AF' },
          margin: 0.04,
          rowH: lineHeight(s) * 1.25,
        })
        break
      }
      default:
        break
    }
    y += h
  }
}

function addImages(slide: PptxSlide, list: MaterialImage[], images: ImageMap, area: { x: number, y: number, w: number, h: number }) {
  const caption = 0.32
  const gap = 0.2
  const each = (area.h - gap * (list.length - 1)) / list.length - caption
  list.forEach((image, i) => {
    const resolved = images[image.id]
    const top = area.y + i * (each + caption + gap)
    if (resolved) {
      const scale = Math.min(area.w / resolved.width, each / resolved.height)
      const w = resolved.width * scale
      const h = resolved.height * scale
      slide.addImage({ data: resolved.png, x: area.x + (area.w - w) / 2, y: top + (each - h) / 2, w, h, altText: image.caption ?? image.kind })
    }
    if (image.caption) slide.addText(image.caption, { x: area.x, y: top + each, w: area.w, h: caption, align: 'center', fontFace: FONT, fontSize: 12, color: MUTED, margin: 0 })
  })
}

function titleSlide(pptx: Pptx, slide: Slide, deck: Presentation) {
  const s = pptx.addSlide()
  s.background = { color: 'FFFFFF' }
  s.addShape('rect', { x: 0, y: 0, w: 5.1, h: H, fill: { color: RED }, line: { color: RED, width: 0 } })
  if (deck.code) s.addText(deck.code, { x: 0.6, y: 3.9, w: 4.2, h: 1.8, fontFace: FONT, fontSize: 96, bold: true, color: 'FFFFFF', margin: 0, valign: 'bottom' })
  if (slide.kicker) s.addText(slide.kicker.toUpperCase(), { x: 0.6, y: 5.8, w: 4.2, h: 0.5, fontFace: FONT, fontSize: 14, bold: true, color: 'FFFFFF', charSpacing: 2, margin: 0 })
  s.addText(slide.title, { x: 5.8, y: 1.6, w: 6.9, h: 2.4, fontFace: FONT, fontSize: 40, bold: true, color: INK, valign: 'bottom', margin: 0 })
  if (slide.subtitle) s.addText(slide.subtitle, { x: 5.8, y: 4.2, w: 6.9, h: 1.6, fontFace: FONT, fontSize: 20, color: '374151', valign: 'top', margin: 0 })
  if (deck.school) s.addText(deck.school, { x: 5.8, y: 6.4, w: 6.9, h: 0.4, fontFace: FONT, fontSize: 14, color: MUTED, margin: 0 })
  return s
}

function sectionSlide(pptx: Pptx, slide: Slide) {
  const s = pptx.addSlide()
  s.background = { color: RED }
  s.addShape('rect', { x: MARGIN + 0.1, y: 3.0, w: 0.9, h: 0.08, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF', width: 0 } })
  s.addText(slide.title, { x: MARGIN + 0.1, y: 3.2, w: W - 2 * MARGIN, h: 1.2, fontFace: FONT, fontSize: 44, bold: true, color: 'FFFFFF', margin: 0 })
  return s
}

function contentSlide(pptx: Pptx, slide: Slide, deck: Presentation, images: ImageMap) {
  const s = pptx.addSlide()
  s.background = { color: 'FFFFFF' }
  if (slide.kicker) s.addText(slide.kicker.toUpperCase(), { x: MARGIN, y: 0.4, w: W - 2 * MARGIN, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: RED, charSpacing: 2, margin: 0 })
  s.addText(slide.title, { x: MARGIN, y: 0.72, w: W - 2 * MARGIN, h: 0.75, fontFace: FONT, fontSize: 28, bold: true, color: INK, margin: 0, valign: 'top' })
  s.addShape('rect', { x: MARGIN, y: 1.55, w: 0.8, h: 0.07, fill: { color: RED }, line: { color: RED, width: 0 } })
  const withImages = slide.images.length > 0
  const textWidth = withImages ? 6.6 : W - 2 * MARGIN
  addBlocks(s, slide.blocks, { x: MARGIN, y: BODY.top, w: textWidth, h: BODY.bottom - BODY.top })
  if (withImages) addImages(s, slide.images, images, { x: MARGIN + textWidth + 0.4, y: BODY.top, w: W - 2 * MARGIN - textWidth - 0.4, h: BODY.bottom - BODY.top })
  s.addText(deck.footer, { x: MARGIN, y: 7.0, w: 9, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, margin: 0 })
  s.slideNumber = { x: W - MARGIN - 0.6, y: 7.0, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, align: 'right' }
  return s
}

export function buildPptx(deck: Presentation, images: ImageMap): Pptx {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Klonk'
  pptx.company = deck.school ?? ''
  pptx.title = `${[deck.code, deck.title].filter(Boolean).join(' · ')} – ${deck.label}`
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT }
  for (const slide of deck.slides) {
    const s = slide.layout === 'title' ? titleSlide(pptx, slide, deck) : slide.layout === 'section' ? sectionSlide(pptx, slide) : contentSlide(pptx, slide, deck, images)
    if (slide.notes) s.addNotes(slide.notes)
  }
  return pptx
}

/** PPTX als Blob (Browser) */
export const renderPptx = async (deck: Presentation, images: ImageMap) => await buildPptx(deck, images).write({ outputType: 'blob' }) as Blob
/** PPTX als Bytes (Node, Tests) */
export const renderPptxBytes = async (deck: Presentation, images: ImageMap) => await buildPptx(deck, images).write({ outputType: 'uint8array' }) as Uint8Array
