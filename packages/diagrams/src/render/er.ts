import type { ErAttribute, ErEnd, ErModel } from '../model'
import { Canvas, clipDiamond, clipEllipse, clipRect, escapeXml, type RenderedDiagram, type RenderOptions } from './common'
import { endDirection, layoutGraph, polyline, type Point } from './graph'

export type ErNotation = 'chen' | 'minmax' | 'crowsfoot'

export type ErOptions = RenderOptions & {
  notation: ErNotation
  /** Hervorgehobene Tabelle (z. B. die angeklickte) */
  activeTable?: string | null
}

const PAD = 10
const GAP = 12

/**
 * ER-Diagramm. Chen-Notation: Entitäten (Rechteck), Attribute (Ellipse, Schlüssel unterstrichen), Beziehungen (Raute)
 * mit Kardinalitäten 1:n bzw. (min,max) – Fremdschlüssel erscheinen als Beziehung, nicht als Attribut.
 * Krähenfuß: Tabellen mit allen Spalten, Linien mit Krähenfuß-Enden. Elemente tragen `data-table`.
 */
export function renderEr(model: ErModel, options: ErOptions): RenderedDiagram {
  return options.notation === 'crowsfoot' ? renderCrowsFoot(model, options) : renderChen(model, options)
}

function renderChen(model: ErModel, options: ErOptions): RenderedDiagram {
  const c = new Canvas(options)
  const rowH = Math.round(c.size * 2.2)
  const ellipse = (attr: ErAttribute) => ({ attr, width: Math.max(56, c.width(attr.name) + 28), height: rowH })

  /** Knoten mit Attributen ober- und unterhalb (gleich hoch ⇒ Linien treffen die Mitte) */
  type Cluster = { id: string, kind: 'entity' | 'relationship', name: string, coreW: number, coreH: number, top: ReturnType<typeof ellipse>[], bottom: ReturnType<typeof ellipse>[], width: number, height: number, table: string }
  const cluster = (id: string, kind: Cluster['kind'], name: string, attributes: ErAttribute[], table: string): Cluster => {
    const items = attributes.filter(a => !a.foreign).map(ellipse)
    const top = items.slice(0, Math.ceil(items.length / 2))
    const bottom = items.slice(top.length)
    const rowW = (list: typeof items) => list.reduce((sum, e) => sum + e.width, 0) + Math.max(0, list.length - 1) * GAP
    const coreW = kind === 'entity' ? c.width(name, { bold: true }) + 2 * PAD + 10 : Math.round((c.width(name) + 2 * PAD) * 1.6)
    const coreH = kind === 'entity' ? rowH + 6 : rowH + 16
    const side = top.length ? rowH + 26 : 0
    return { id, kind, name, coreW, coreH, top, bottom, width: Math.max(coreW, rowW(top), rowW(bottom)), height: coreH + 2 * side, table }
  }

  const clusters = [
    ...model.entities.map(e => cluster(`e:${e.name}`, 'entity', e.name, e.attributes, e.name)),
    ...model.relationships.map((rel, i) => cluster(`r:${i}`, 'relationship', rel.name, rel.attributes, rel.table)),
  ]
  // Kanten: Entität (Fremdschlüssel-Seite) ⇒ Beziehung ⇒ Entität
  const edges = model.relationships.flatMap((rel, i) => [
    { from: `e:${rel.ends[0].entity}`, to: `r:${i}` },
    { from: `r:${i}`, to: `e:${rel.ends[1].entity}` },
  ])
  const layout = layoutGraph(clusters.map(k => ({ id: k.id, width: k.width, height: k.height })), edges, { rankdir: 'LR', nodesep: 30, ranksep: 50 })

  const byId = new Map(clusters.map(k => [k.id, k]))
  const center = (id: string) => layout.nodes.get(id)!

  // Beziehungslinien mit Kardinalitäten an der Entität
  model.relationships.forEach((rel, i) => {
    const diamond = center(`r:${i}`)
    const d = byId.get(`r:${i}`)!
    rel.ends.forEach((end, side) => {
      const entity = center(`e:${end.entity}`)
      const e = byId.get(`e:${end.entity}`)!
      // Selbstbezug: beide Linien leicht versetzt
      const offset = rel.ends[0].entity === rel.ends[1].entity ? (side === 0 ? -8 : 8) : 0
      const dx = diamond.x - entity.x
      const dy = diamond.y + offset - (entity.y + offset)
      const a = clipRect(entity.x, entity.y + offset, e.coreW, e.coreH, dx, dy)
      const b = clipDiamond(diamond.x, diamond.y + offset, d.coreW, d.coreH, -dx, -dy)
      c.line(a.x, a.y, b.x, b.y)
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const ux = (b.x - a.x) / length
      const uy = (b.y - a.y) / length
      const label = cardinality(end, options.notation)
      const along = 10 + c.width(label) / 2
      c.text(a.x + ux * along - uy * 11, a.y + uy * along + ux * 11 + (Math.abs(uy) > 0.7 ? 0 : -2), label, { 'text-anchor': 'middle', 'font-weight': 'bold' })
    })
  })

  for (const k of clusters) {
    const pos = center(k.id)
    const active = options.activeTable === k.table
    c.open({ 'data-table': k.table, 'data-kind': k.kind })
    // Attribute: Linie zur Mitte des Kerns, dann Ellipse
    const placeRow = (list: typeof k.top, cy: number) => {
      const rowW = list.reduce((sum, e) => sum + e.width, 0) + Math.max(0, list.length - 1) * GAP
      let x = pos.x - rowW / 2
      for (const item of list) {
        const ex = x + item.width / 2
        const toCore = clipRect(pos.x, pos.y, k.coreW, k.coreH, ex - pos.x, cy - pos.y)
        const fromEllipse = clipEllipse(ex, cy, item.width, item.height, toCore.x - ex, toCore.y - cy)
        c.line(fromEllipse.x, fromEllipse.y, toCore.x, toCore.y)
        c.add(`<ellipse cx="${ex}" cy="${cy}" rx="${item.width / 2}" ry="${item.height / 2}" fill="${c.theme.background}" stroke="${c.theme.line}"/>`)
        c.text(ex, cy, item.attr.name, { 'text-anchor': 'middle', 'underline': item.attr.key })
        x += item.width + GAP
      }
    }
    const rowOffset = k.coreH / 2 + 26 + rowH / 2
    placeRow(k.top, pos.y - rowOffset)
    placeRow(k.bottom, pos.y + rowOffset)
    if (k.kind === 'entity') {
      c.rect(pos.x - k.coreW / 2, pos.y - k.coreH / 2, k.coreW, k.coreH, { 'fill': active ? c.theme.active : c.theme.header, 'stroke-width': 1.5 })
      c.text(pos.x, pos.y, k.name, { 'text-anchor': 'middle', 'bold': true })
    }
    else {
      const w = k.coreW / 2
      const h = k.coreH / 2
      c.path(`M${pos.x - w} ${pos.y}L${pos.x} ${pos.y - h}L${pos.x + w} ${pos.y}L${pos.x} ${pos.y + h}Z`, { 'fill': active ? c.theme.active : c.theme.background, 'stroke-width': 1.5 })
      c.text(pos.x, pos.y, k.name, { 'text-anchor': 'middle' })
    }
    c.close()
  }
  return c.finish('er', layout.width, layout.height, 16)
}

/** Kardinalität an einer Entität: Chen 1/n/m bzw. (min,max) */
function cardinality(end: ErEnd, notation: ErOptions['notation']) {
  return notation === 'minmax' ? `(${end.min},${end.max === '1' ? '1' : '*'})` : end.chen
}

function renderCrowsFoot(model: ErModel, options: ErOptions): RenderedDiagram {
  const c = new Canvas(options)
  const row = Math.round(c.size * 1.5)
  const tables = model.tables.filter(t => t.kind === 'table')
  const boxes = tables.map((table) => {
    const foreign = new Set((table.foreignKeys ?? []).flatMap(fk => fk.columns))
    const lines = table.columns.map(col => ({ key: col.primaryKey ? 'PK' : foreign.has(col.name) ? 'FK' : '', name: col.name, type: col.type, primary: col.primaryKey }))
    const keyW = Math.max(0, ...lines.map(l => c.width(l.key)))
    const nameW = Math.max(0, ...lines.map(l => c.width(l.name)))
    const typeW = Math.max(0, ...lines.map(l => c.width(l.type)))
    const width = Math.max(c.width(table.name, { bold: true }) + 2 * PAD, keyW + nameW + typeW + 4 * PAD)
    return { table, lines, keyW, nameW, width, height: row + 4 + Math.max(1, lines.length) * row + 4 }
  })
  const names = new Set(tables.map(t => t.name))
  const links = tables.flatMap(table => (table.foreignKeys ?? []).filter(fk => names.has(fk.table)).map((fk) => {
    const columns = fk.columns.map(name => table.columns.find(col => col.name === name))
    const required = columns.every(col => col && (col.notNull || col.primaryKey))
    const unique = columns.length === 1 && !!columns[0]?.unique
    return { from: table.name, to: fk.table, required, unique }
  }))
  const layout = layoutGraph(boxes.map(b => ({ id: b.table.name, width: b.width, height: b.height })), links.map(l => ({ from: l.from, to: l.to })), { rankdir: 'LR', nodesep: 30, ranksep: 90 })

  links.forEach((link, i) => {
    const points = layout.edges[i]!.points
    if (points.length < 2) return
    c.path(polyline(points))
    // Ziel (referenzierte Tabelle): genau eins bzw. höchstens eins
    const target = endDirection(points)
    footEnd(c, target.end, target.ux, target.uy, false, link.required ? 1 : 0)
    // Quelle (Tabelle mit Fremdschlüssel): viele (bzw. eins bei UNIQUE), jeweils optional
    const source = endDirection([...points].reverse())
    footEnd(c, source.end, source.ux, source.uy, !link.unique, 0)
  })

  for (const box of boxes) {
    const pos = layout.nodes.get(box.table.name)!
    const x = pos.x - box.width / 2
    const y = pos.y - box.height / 2
    const active = options.activeTable === box.table.name
    c.open({ 'data-table': box.table.name })
    c.rect(x, y, box.width, box.height, { 'stroke-width': 1.5 })
    c.rect(x, y, box.width, row + 4, { 'fill': active ? c.theme.active : c.theme.header, 'stroke-width': 1.5 })
    c.text(pos.x, y + (row + 4) / 2, box.table.name, { 'text-anchor': 'middle', 'bold': true })
    box.lines.forEach((l, i) => {
      const cy = y + row + 6 + row * (i + 0.5)
      c.text(x + PAD, cy, l.key, { 'fill': c.theme.accent, 'font-size': c.size - 2, 'bold': true })
      c.text(x + 2 * PAD + box.keyW, cy, l.name, { underline: l.primary })
      c.text(x + 3 * PAD + box.keyW + box.nameW, cy, l.type, { fill: c.theme.muted })
    })
    c.close()
  }
  return c.finish('er', layout.width, layout.height, 16)
}

/** Krähenfuß-Ende: `many` = Krähenfuß, sonst Strich; `min` 0 = Kreis, 1 = zweiter Strich */
function footEnd(c: Canvas, end: Point, ux: number, uy: number, many: boolean, min: 0 | 1) {
  const px = -uy
  const py = ux
  if (many) {
    const base = { x: end.x - ux * 12, y: end.y - uy * 12 }
    c.path(`M${base.x} ${base.y}L${end.x + px * 7} ${end.y + py * 7}M${base.x} ${base.y}L${end.x} ${end.y}M${base.x} ${base.y}L${end.x - px * 7} ${end.y - py * 7}`)
  }
  else {
    const at = { x: end.x - ux * 8, y: end.y - uy * 8 }
    c.line(at.x + px * 7, at.y + py * 7, at.x - px * 7, at.y - py * 7)
  }
  const mark = { x: end.x - ux * 20, y: end.y - uy * 20 }
  if (min === 0) c.add(`<circle cx="${mark.x}" cy="${mark.y}" r="4.5" fill="${c.theme.background}" stroke="${c.theme.line}"/>`)
  else c.line(mark.x + px * 7, mark.y + py * 7, mark.x - px * 7, mark.y - py * 7)
}

/** Relationenschema als Text: `schueler(id, vorname, ↑klasse_id)` – Schlüssel unterstrichen, Fremdschlüssel mit ↑ */
export function renderRelationalSchema(model: ErModel, options: RenderOptions): RenderedDiagram {
  const c = new Canvas(options)
  const row = Math.round(c.size * 1.9)
  let width = 0
  model.tables.filter(t => t.kind === 'table').forEach((table, i) => {
    const foreign = new Set((table.foreignKeys ?? []).flatMap(fk => fk.columns))
    const y = row * (i + 0.5)
    const spans: string[] = [`<tspan font-weight="bold">${escapeXml(table.name)}</tspan>(`]
    let text = `${table.name}(`
    table.columns.forEach((col, j) => {
      const label = `${foreign.has(col.name) ? '↑' : ''}${col.name}`
      spans.push(`${j ? ', ' : ''}<tspan${col.primaryKey ? ' text-decoration="underline"' : ''}>${escapeXml(label)}</tspan>`)
      text += `${j ? ', ' : ''}${label}`
    })
    spans.push(')')
    text += ')'
    width = Math.max(width, c.width(text) + c.width(table.name, { bold: true }) - c.width(table.name))
    c.add(`<text x="0" y="${y}" dominant-baseline="central" fill="${c.theme.text}" data-table="${escapeXml(table.name)}">${spans.join('')}</text>`)
  })
  return c.finish('schema', width, row * model.tables.filter(t => t.kind === 'table').length, 12)
}
