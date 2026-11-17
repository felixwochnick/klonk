import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HeightRule,
  ImageRun,
  type IParagraphOptions,
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
  VerticalAlign,
  WidthType,
} from 'docx'
import { imageRatio, type ImageMap, type Line, type MaterialBlock, type MaterialDocument, type MaterialImage } from './model'

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

/**
 * Seitenumbruch: Solange `blocksToDocx` einen `keep`-Baustein (eine Aufgabe) baut, bekommen alle Absätze – auch die in
 * Tabellenzellen – „Nicht vom nächsten Absatz trennen“. Word, LibreOffice und Euro-Office halten die Aufgabe dann auf einer
 * Seite, solange sie auf eine passt. Der Aufbau läuft synchron, daher reicht ein Merker im Modul.
 */
let keeping = false
const paragraph = (options: IParagraphOptions) => new Paragraph(keeping ? { ...options, keepNext: true } : options)

function runs(line: Line, size?: number, color?: string): TextRun[] {
  return line.map((part) => {
    if (part.kind === 'code') return new TextRun({ text: part.value, font: MONO, size, color, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' } })
    return new TextRun({ text: part.value, bold: part.kind === 'bold', size, color })
  })
}

function codeParagraphs(code: string, color = INK): Paragraph[] {
  return code.split('\n').map(text => paragraph({
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

const spacer = (after = 120) => paragraph({ spacing: { before: 0, after }, children: [] })

/** Bildzeilen wie in der HTML-Ausgabe (Twips): Lücke zwischen den Rahmen, Innenabstand, Reserve für die Rahmenlinie, höchstens 62 mm hoch */
const IMAGE_GAP = 150
const IMAGE_PAD = 45
const IMAGE_BORDER = 30
const IMAGE_MAX_HEIGHT = Math.round(62 / 25.4 * 1440)
const FRAME = thin('D1D5DB')

/**
 * Eine Bildzeile im Blocksatz: Spaltenbreite je Bild ∝ Seitenverhältnis ⇒ alle Rahmen gleich hoch und zusammen so breit wie
 * die Seite. Zu hohe Zeilen werden gleichmäßig gekappt (Rahmen bleiben voll breit, Bild mittig). Lücken = leere Spalten.
 */
function imageRow(row: MaterialImage[], images: ImageMap, width: number, note?: string): Table {
  const ratios = row.map(image => imageRatio(image, images))
  const sum = ratios.reduce((a, b) => a + b, 0)
  const inner = width - (row.length - 1) * IMAGE_GAP - row.length * (2 * IMAGE_PAD + IMAGE_BORDER)
  const height = Math.min(inner / sum, IMAGE_MAX_HEIGHT)
  const cells = ratios.map(ratio => Math.floor(ratio * inner / sum) + 2 * IMAGE_PAD + IMAGE_BORDER)
  const columns = cells.flatMap((cell, i) => (i ? [IMAGE_GAP, cell] : [cell]))
  const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE }
  const gap = () => new TableCell({ width: { size: IMAGE_GAP, type: WidthType.DXA }, borders: noBorders, children: [paragraph({ children: [] })] })
  const between = <T>(list: T[]) => list.flatMap((item, i) => (i ? [gap(), item] : [item]))

  const pictures = row.map((image, i) => {
    const resolved = images[image.id]
    return new TableCell({
      width: { size: cells[i]!, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: IMAGE_PAD, bottom: IMAGE_PAD, left: IMAGE_PAD, right: IMAGE_PAD },
      borders: { top: FRAME, bottom: FRAME, left: FRAME, right: FRAME },
      children: [paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        keepNext: true,
        children: resolved
          ? [new ImageRun({
              type: 'png',
              data: resolved.png,
              // Twips ⇒ Pixel (96 dpi)
              transformation: { width: Math.floor(ratios[i]! * height / 15), height: Math.floor(height / 15) },
              altText: { name: image.caption ?? image.kind, description: image.caption ?? '', title: image.caption ?? '' },
            })]
          : [],
      })],
    })
  })
  const captions = row.map((image, i) => new TableCell({
    width: { size: cells[i]!, type: WidthType.DXA },
    borders: noBorders,
    children: [paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 40 }, children: [new TextRun({ text: image.caption ?? '', size: 17, color: MUTED })] })],
  }))
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths: columns,
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [
      new TableRow({ cantSplit: true, height: { value: Math.ceil(height) + 2 * IMAGE_PAD, rule: HeightRule.ATLEAST }, children: between(pictures) }),
      new TableRow({ cantSplit: true, children: between(captions) }),
      // Legende als Zeile der Tabelle – bleibt so auch bei einem Umbruch bei den Bildern
      ...(note
        ? [new TableRow({
            cantSplit: true,
            children: [new TableCell({
              columnSpan: columns.length,
              width: { size: width, type: WidthType.DXA },
              borders: noBorders,
              children: [paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: note, size: 17, color: MUTED, italics: true })] })],
            })],
          })]
        : []),
    ],
  })
}

function imagesTable(block: Extract<MaterialBlock, { type: 'images' }>, images: ImageMap, width: number): (Paragraph | Table)[] {
  // Zwischen zwei Tabellen ein Absatz – sonst verschmilzt Word sie zu einer
  const last = block.rows.length - 1
  return [
    ...block.rows.flatMap((row, i) => [...(i ? [spacer(60)] : []), imageRow(row, images, width, i === last ? block.note : undefined)]),
    spacer(120),
  ]
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
    children: [paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text, bold: header, size: 18 })] })],
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
        children: [paragraph({ children: [new TextRun({ text: `… +${more}`, italics: true, color: MUTED, size: 18 })] })],
      })],
    }))
  }
  const borders = { top: thin(), bottom: thin(), left: thin(), right: thin(), insideHorizontal: thin(), insideVertical: thin() }
  return [
    ...(caption ? [paragraph({ keepNext: true, spacing: { before: 120, after: 40 }, children: [new TextRun({ text: caption, bold: true, size: 19 })] })] : []),
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
    children.push(paragraph({
      spacing: { before: 0, after: 0, line: 500, lineRule: 'exact' },
      indent: { left: indent },
      border: { bottom: { style: BorderStyle.DOTTED, size: 4, color: '9CA3AF', space: 1 } },
      children: [new TextRun({ text: `${i + 1}`, size: 13, color: '9CA3AF', font: FONT })],
    }))
  }
  if (block.after) children.push(...codeParagraphs(block.after, '374151'))
  const label = block.label ? [paragraph({ keepNext: true, keepLines: true, spacing: { before: 120, after: 60 }, children: [new TextRun({ text: block.label, bold: true })] })] : []
  return [...label, boxTable(children, { border: '9CA3AF', width, cantSplit: true }), spacer(160)]
}

function blocksToDocx(blocks: MaterialBlock[], images: ImageMap, width = CONTENT): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        out.push(paragraph({
          heading: block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          keepNext: true,
          children: [new TextRun({ text: block.text })],
        }))
        break
      case 'paragraph':
        out.push(paragraph({
          spacing: { after: 100 },
          children: block.lines.flatMap((line, i) => [...(i ? [new TextRun({ break: 1 })] : []), ...runs(line, block.muted ? 18 : undefined, block.muted ? MUTED : undefined)]),
        }))
        break
      case 'list':
        for (const item of block.items) {
          out.push(block.check
            ? paragraph({ spacing: { after: 60 }, indent: { left: 360, hanging: 360 }, children: [new TextRun({ text: '☐\t' }), ...runs(item)] })
            : paragraph({ spacing: { after: 60 }, bullet: { level: 0 }, children: runs(item) }))
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
          paragraph({ keepNext: true, spacing: { after: 80 }, children: [new TextRun({ text: block.title, bold: true })] }),
          ...blocksToDocx(block.blocks, images, inner),
        ], { fill: tone.fill, border: 'D1D5DB', left: tone.border, width }), spacer(140))
        break
      }
      case 'keep': {
        const outer = keeping
        keeping = true
        try {
          out.push(...blocksToDocx(block.blocks, images, width))
        }
        finally {
          keeping = outer
        }
        // Schluss der Kette: winziger Absatz ohne „nicht trennen“, sonst hinge die nächste Aufgabe mit daran
        if (!outer) out.push(new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, children: [] }))
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
              children: [paragraph({ spacing: { before: 200, after: 20 }, children: [new TextRun({ text: `${label}:`, size: 20 })] })],
            })),
          })],
        }), spacer(200))
        break
      }
      case 'pageBreak':
        out.push(paragraph({ pageBreakBefore: true, children: [] }))
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
