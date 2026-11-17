import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from 'docx'
import type { ImageMap, Line, MaterialBlock, MaterialDocument, MaterialImage } from './model'

// Arbeitsblatt bzw. Lösungsblatt als Word-Datei (DOCX) – zum Weiterbearbeiten in Euro-Office, OnlyOffice, LibreOffice
// oder Word. Nur Schriften, die überall vorhanden sind bzw. ersetzt werden (Arial, Courier New).

const FONT = 'Arial'
const MONO = 'Courier New'
const INK = '111827'
const MUTED = '6B7280'
const RED = 'C91A09'
/** A4 mit 2 cm Rand (Maße in Twips: 1 cm = 567) */
const PAGE = { width: 11906, height: 16838, margin: 1134 }
const CONTENT = PAGE.width - 2 * PAGE.margin

const TONES: Record<Extract<MaterialBlock, { type: 'box' }>['tone'], { border: string, fill: string }> = {
  info: { border: '0055BF', fill: 'F1F5F9' },
  hint: { border: 'F2CD37', fill: 'FFFBEB' },
  solution: { border: '237841', fill: 'F0FDF4' },
  teacher: { border: RED, fill: 'FEF2F2' },
}

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }
const thin = (color = '9CA3AF') => ({ style: BorderStyle.SINGLE, size: 4, color })

function runs(line: Line, size?: number, color?: string): TextRun[] {
  return line.map((part) => {
    if (part.kind === 'code') return new TextRun({ text: part.value, font: MONO, size, color, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' } })
    return new TextRun({ text: part.value, bold: part.kind === 'bold', size, color })
  })
}

function codeParagraphs(code: string, color = INK): Paragraph[] {
  return code.split('\n').map(text => new Paragraph({
    spacing: { before: 0, after: 0, line: 260 },
    children: [new TextRun({ text: text || ' ', font: MONO, size: 19, color })],
  }))
}

/** Kasten aus einer Tabellenzelle (Rahmen, Hintergrund) */
function boxTable(children: (Paragraph | Table)[], options: { fill?: string, border?: string, left?: string, width?: number, cantSplit?: boolean } = {}) {
  const width = options.width ?? CONTENT
  const border = options.border ? thin(options.border) : NONE
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths: [width],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [new TableRow({
      cantSplit: options.cantSplit ?? false,
      children: [new TableCell({
        width: { size: width, type: WidthType.DXA },
        shading: options.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: options.fill } : undefined,
        margins: { top: 100, bottom: 100, left: 180, right: 180 },
        borders: {
          top: border,
          bottom: border,
          right: border,
          left: options.left ? { style: BorderStyle.SINGLE, size: 24, color: options.left } : border,
        },
        children,
      })],
    })],
  })
}

const spacer = (after = 120) => new Paragraph({ spacing: { before: 0, after }, children: [] })

function imageParagraph(image: MaterialImage, images: ImageMap, maxWidth: number, maxHeight: number) {
  const resolved = images[image.id]
  if (!resolved) return new Paragraph({ children: [] })
  const scale = Math.min(maxWidth / resolved.width, maxHeight / resolved.height, image.kind === 'plan' ? 1 : 10)
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 40 },
    keepNext: true,
    children: [new ImageRun({
      type: 'png',
      data: resolved.png,
      transformation: { width: Math.round(resolved.width * scale), height: Math.round(resolved.height * scale) },
      altText: { name: image.caption ?? image.kind, description: image.caption ?? '', title: image.caption ?? '' },
    })],
  })
}

function imagesTable(block: Extract<MaterialBlock, { type: 'images' }>, images: ImageMap, width: number): (Paragraph | Table)[] {
  const perRow = Math.min(block.images.length, 3)
  const column = Math.floor(width / perRow)
  const columnPx = Math.floor(column / 1440 * 96) - 12
  const rows: TableRow[] = []
  for (let i = 0; i < block.images.length; i += perRow) {
    const slice = block.images.slice(i, i + perRow)
    rows.push(new TableRow({
      cantSplit: true,
      children: Array.from({ length: perRow }, (_, c) => {
        const image = slice[c]
        return new TableCell({
          width: { size: column, type: WidthType.DXA },
          borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
          children: image
            ? [
                imageParagraph(image, images, perRow === 1 ? Math.min(columnPx, 380) : columnPx, 230),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: image.caption ?? '', size: 17, color: MUTED })] }),
              ]
            : [new Paragraph({ children: [] })],
        })
      }),
    }))
  }
  const result: (Paragraph | Table)[] = [new Table({ width: { size: width, type: WidthType.DXA }, columnWidths: Array.from({ length: perRow }, () => column), layout: TableLayoutType.FIXED, borders: NO_BORDERS, rows })]
  if (block.note) result.push(new Paragraph({ spacing: { before: 40, after: 120 }, children: [new TextRun({ text: block.note, size: 17, color: MUTED, italics: true })] }))
  return result
}

function dataTable(block: Extract<MaterialBlock, { type: 'table' }>, width: number): (Paragraph | Table)[] {
  const { columns, rows, caption, more } = block.table
  const n = Math.max(columns.length, 1)
  // Schmale Tabellen nicht über die ganze Breite ziehen
  const total = Math.min(width, n * 1700)
  const column = Math.floor(total / n)
  const cell = (text: string, header = false) => new TableCell({
    width: { size: column, type: WidthType.DXA },
    shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E5E7EB' } : undefined,
    margins: { top: 30, bottom: 30, left: 80, right: 80 },
    children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text, bold: header, size: 18 })] })],
  })
  const tableRows = [
    new TableRow({ tableHeader: true, children: columns.map(c => cell(c, true)) }),
    ...rows.map(row => new TableRow({ cantSplit: true, children: row.map(value => cell(value)) })),
  ]
  if (more) {
    tableRows.push(new TableRow({
      children: [new TableCell({
        columnSpan: n,
        width: { size: total, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: `… +${more}`, italics: true, color: MUTED, size: 18 })] })],
      })],
    }))
  }
  const borders = { top: thin(), bottom: thin(), left: thin(), right: thin(), insideHorizontal: thin(), insideVertical: thin() }
  return [
    ...(caption ? [new Paragraph({ keepNext: true, spacing: { before: 120, after: 40 }, children: [new TextRun({ text: caption, bold: true, size: 19 })] })] : []),
    new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: columns.map(() => column), layout: TableLayoutType.FIXED, borders, rows: tableRows }),
    spacer(),
  ]
}

function writingLines(block: Extract<MaterialBlock, { type: 'lines' }>, width: number): (Paragraph | Table)[] {
  // Der Schreibkasten bleibt auf einer Seite (höchstens 22 Linien + Vorlage passen immer)
  const children: Paragraph[] = []
  if (block.before) children.push(...codeParagraphs(block.before, '374151'))
  const indent = block.indent ? block.indent * 115 : 0
  for (let i = 0; i < block.count; i++) {
    children.push(new Paragraph({
      spacing: { before: 0, after: 0, line: 500, lineRule: 'exact' },
      indent: { left: indent },
      border: { bottom: { style: BorderStyle.DOTTED, size: 4, color: '9CA3AF', space: 1 } },
      children: [new TextRun({ text: `${i + 1}`, size: 13, color: '9CA3AF', font: FONT })],
    }))
  }
  if (block.after) children.push(...codeParagraphs(block.after, '374151'))
  const label = block.label ? [new Paragraph({ keepNext: true, keepLines: true, spacing: { before: 120, after: 60 }, children: [new TextRun({ text: block.label, bold: true })] })] : []
  return [...label, boxTable(children, { border: '9CA3AF', width, cantSplit: true }), spacer(160)]
}

function blocksToDocx(blocks: MaterialBlock[], images: ImageMap, width = CONTENT): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        out.push(new Paragraph({
          heading: block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          keepNext: true,
          children: [new TextRun({ text: block.text })],
        }))
        break
      case 'paragraph':
        out.push(new Paragraph({
          spacing: { after: 100 },
          children: block.lines.flatMap((line, i) => [...(i ? [new TextRun({ break: 1 })] : []), ...runs(line, block.muted ? 18 : undefined, block.muted ? MUTED : undefined)]),
        }))
        break
      case 'list':
        for (const item of block.items) {
          out.push(block.check
            ? new Paragraph({ spacing: { after: 60 }, indent: { left: 360, hanging: 360 }, children: [new TextRun({ text: '☐\t' }), ...runs(item)] })
            : new Paragraph({ spacing: { after: 60 }, bullet: { level: 0 }, children: runs(item) }))
        }
        break
      case 'code':
        out.push(boxTable(codeParagraphs(block.code), { fill: 'F3F4F6', border: 'D1D5DB', width }), spacer(100))
        break
      case 'images':
        out.push(...imagesTable(block, images, width))
        break
      case 'table':
        out.push(...dataTable(block, width))
        break
      case 'lines':
        out.push(...writingLines(block, width))
        break
      case 'box': {
        const tone = TONES[block.tone]
        const inner = width - 400
        out.push(boxTable([
          new Paragraph({ keepNext: true, spacing: { after: 80 }, children: [new TextRun({ text: block.title, bold: true })] }),
          ...blocksToDocx(block.blocks, images, inner),
        ], { fill: tone.fill, border: 'D1D5DB', left: tone.border, width }), spacer(140))
        break
      }
      case 'fields': {
        const columns = [Math.floor(width / 2), Math.floor(width / 4), Math.floor(width / 4)]
        out.push(new Table({
          width: { size: width, type: WidthType.DXA },
          columnWidths: columns,
          layout: TableLayoutType.FIXED,
          borders: NO_BORDERS,
          rows: [new TableRow({
            children: block.labels.map((label, i) => new TableCell({
              width: { size: columns[i] ?? columns[0]!, type: WidthType.DXA },
              margins: { left: 0, right: 200 },
              borders: { top: NONE, left: NONE, right: NONE, bottom: { style: BorderStyle.SINGLE, size: 6, color: INK } },
              children: [new Paragraph({ spacing: { before: 200, after: 20 }, children: [new TextRun({ text: `${label}:`, size: 20 })] })],
            })),
          })],
        }), spacer(200))
        break
      }
      case 'pageBreak':
        out.push(new Paragraph({ pageBreakBefore: true, children: [] }))
        break
    }
  }
  return out
}

/** „Seite {page} von {pages}“ ⇒ Text mit Seitenfeldern */
function pageRuns(label: string): TextRun {
  const children = label.split(/(\{page\}|\{pages\})/).filter(Boolean).map((part) => {
    if (part === '{page}') return PageNumber.CURRENT
    if (part === '{pages}') return PageNumber.TOTAL_PAGES
    return part
  })
  return new TextRun({ children, size: 16, color: MUTED })
}

export function buildDocx(doc: MaterialDocument, images: ImageMap): Document {
  const module = [doc.code, doc.title].filter(Boolean).join(' · ')
  return new Document({
    creator: 'Klonk',
    title: `${module} – ${doc.label}`,
    description: doc.footer,
    styles: {
      default: {
        document: { run: { font: FONT, size: 21, color: INK }, paragraph: { spacing: { line: 288 } } },
        heading1: { run: { font: FONT, size: 40, bold: true, color: INK }, paragraph: { spacing: { before: 60, after: 200 } } },
        heading2: { run: { font: FONT, size: 28, bold: true, color: INK }, paragraph: { spacing: { before: 320, after: 100 }, border: { top: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 6 } } } },
        heading3: { run: { font: FONT, size: 24, bold: true, color: INK }, paragraph: { spacing: { before: 200, after: 80 } } },
      },
    },
    sections: [{
      properties: { page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin, header: 567, footer: 567 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB', space: 4 } },
            children: [new TextRun({ text: doc.school ?? '', size: 16, color: MUTED }), new TextRun({ text: `\t${module}`, size: 16, color: MUTED })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
            children: [new TextRun({ text: `${doc.footer}\t`, size: 16, color: MUTED }), pageRuns(doc.pageLabel)],
          })],
        }),
      },
      children: [
        new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: doc.label.toUpperCase(), bold: true, size: 18, color: RED, characterSpacing: 20 })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: doc.title })] }),
        ...blocksToDocx(doc.blocks, images),
      ],
    }],
  })
}

/** DOCX als Blob (Browser) */
export const renderDocx = (doc: MaterialDocument, images: ImageMap) => Packer.toBlob(buildDocx(doc, images))
/** DOCX als Bytes (Node, Tests) */
export const renderDocxBytes = async (doc: MaterialDocument, images: ImageMap) => new Uint8Array(await Packer.toArrayBuffer(buildDocx(doc, images)))
