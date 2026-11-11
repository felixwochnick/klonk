import { unzipSync, strFromU8 } from 'fflate'

/**
 * Tabellen aus Dateien lesen – nur im Browser (DOMParser), ohne Server: CSV/TSV/TXT, Excel (.xlsx), OpenDocument-Tabellen
 * (.ods) und die erste Tabelle eines Textdokuments (.odt). Ergebnis: Zeilen mit Zellen als Text, leere Zeilen entfallen.
 */
export type Table = string[][]

export const TABLE_ACCEPT = '.csv,.tsv,.txt,.xlsx,.ods,.odt'

/** Höchstens so viele Zeilen (Schutz vor riesigen Dateien) */
const MAX_ROWS = 5000

export class TableError extends Error {}

export async function readTable(file: File): Promise<Table> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  const bytes = new Uint8Array(await file.arrayBuffer())
  let rows: Table
  if (ext === 'xlsx') rows = readXlsx(bytes)
  else if (ext === 'ods' || ext === 'odt') rows = readOpenDocument(bytes)
  else if (ext === 'xls' || ext === 'doc' || ext === 'docx') throw new TableError('unsupported')
  else rows = parseCsv(decodeText(bytes))
  return rows
    .map(row => trimEnd(row.map(cell => cell.trim())))
    .filter(row => row.some(Boolean))
    .slice(0, MAX_ROWS)
}

function trimEnd(row: string[]) {
  let end = row.length
  while (end > 0 && !row[end - 1]) end--
  return row.slice(0, end)
}

/** UTF-8, sonst Windows-1252 (Excel speichert CSV in Deutschland oft so) */
function decodeText(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  }
  catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** CSV mit Anführungszeichen; Trennzeichen (`;` `,` Tab) aus der ersten Zeile geraten */
export function parseCsv(text: string): Table {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = [';', '\t', ','].map(d => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0]!.d
  const rows: Table = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      }
      else if (c === '"') quoted = false
      else cell += c
    }
    else if (c === '"' && !cell) quoted = true
    else if (c === delimiter) {
      row.push(cell)
      cell = ''
    }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    }
    else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function unzip(bytes: Uint8Array) {
  try {
    return unzipSync(bytes)
  }
  catch {
    throw new TableError('invalid')
  }
}

const xml = (text: string) => new DOMParser().parseFromString(text, 'application/xml')
/** Elemente nach lokalem Namen (Namensräume egal) */
const children = (node: Element, name: string) => [...node.children].filter(c => c.localName === name)
const all = (node: Document | Element, name: string) => [...node.getElementsByTagNameNS('*', name)]

/** Spaltennummer aus einer Zellreferenz (`C7` ⇒ 2) */
function columnIndex(ref: string) {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

function readXlsx(bytes: Uint8Array): Table {
  const files = unzip(bytes)
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : null)
  // Erstes Tabellenblatt über workbook.xml + Beziehungen finden
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const workbook = text('xl/workbook.xml')
  const rels = text('xl/_rels/workbook.xml.rels')
  if (workbook && rels) {
    const first = all(xml(workbook), 'sheet')[0]
    const relId = first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? first?.getAttribute('r:id')
    const target = all(xml(rels), 'Relationship').find(r => r.getAttribute('Id') === relId)?.getAttribute('Target')
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`
  }
  const sheet = text(sheetPath)
  if (!sheet) throw new TableError('invalid')
  const sharedText = text('xl/sharedStrings.xml')
  const shared = sharedText ? all(xml(sharedText), 'si').map(si => all(si, 't').map(t => t.textContent ?? '').join('')) : []

  const rows: Table = []
  for (const rowEl of all(xml(sheet), 'row')) {
    const row: string[] = []
    for (const c of children(rowEl, 'c')) {
      const ref = c.getAttribute('r')
      const index = ref ? columnIndex(ref) : row.length
      const type = c.getAttribute('t')
      const value = children(c, 'v')[0]?.textContent ?? ''
      let cell = value
      if (type === 's') cell = shared[Number(value)] ?? ''
      else if (type === 'inlineStr') cell = all(c, 't').map(t => t.textContent ?? '').join('')
      else if (type === 'b') cell = value === '1' ? 'TRUE' : 'FALSE'
      while (row.length < index) row.push('')
      row[index] = cell
    }
    rows.push(row)
    if (rows.length > MAX_ROWS) break
  }
  return rows
}

/** ODS: erstes Tabellenblatt; ODT: erste Tabelle im Text – gleiche Struktur (table:table) */
function readOpenDocument(bytes: Uint8Array): Table {
  const content = unzip(bytes)['content.xml']
  if (!content) throw new TableError('invalid')
  const table = all(xml(strFromU8(content)), 'table')[0]
  if (!table) throw new TableError('empty')
  const rows: Table = []
  for (const rowEl of all(table, 'table-row')) {
    const row: string[] = []
    for (const cell of [...rowEl.children].filter(c => c.localName === 'table-cell' || c.localName === 'covered-table-cell')) {
      const text = children(cell, 'p').map(p => p.textContent ?? '').join('\n')
      // Wiederholte leere Zellen (bis zum Blattende) nicht ausrollen
      const repeat = Math.min(Number(cell.getAttribute('table:number-columns-repeated') ?? 1) || 1, text ? 1000 : 1)
      for (let i = 0; i < repeat; i++) row.push(text)
    }
    const repeat = Number(rowEl.getAttribute('table:number-rows-repeated') ?? 1) || 1
    if (!row.some(Boolean)) continue
    for (let i = 0; i < Math.min(repeat, MAX_ROWS); i++) rows.push([...row])
    if (rows.length > MAX_ROWS) break
  }
  return rows
}
