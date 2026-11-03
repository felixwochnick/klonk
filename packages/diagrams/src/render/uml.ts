import type { ClassModel, HeapSnapshot, HeapValue, UmlClass, UmlRelation, Visibility } from '../model'
import { classRelations } from '../relations'
import { Canvas, type RenderedDiagram, type RenderOptions } from './common'
import { endDirection, layoutGraph, polyline, type Point } from './graph'

const PAD = 8
const VISIBILITY: Record<Visibility, string> = { public: '+', private: '-', protected: '#', package: '~' }

export type ClassDiagramLabels = { interface: string, enumeration: string, abstract: string, record: string, struct: string }

export type ClassDiagramOptions = RenderOptions & {
  labels: ClassDiagramLabels
  /** Hervorgehobene Klasse (z. B. die der geöffneten Datei) */
  activeClass?: string | null
}

type Line = { text: string, bold?: boolean, italic?: boolean, underline?: boolean, muted?: boolean, line?: number }

/**
 * UML-Klassendiagramm: Klassen mit Attributen und Methoden, Vererbung (Dreieck), Implementierung (gestrichelt) und
 * Assoziationen (Pfeil mit Rolle und Multiplizität). Klassen tragen `data-class`/`data-path`/`data-line`.
 */
export function renderClassDiagram(model: ClassModel, options: ClassDiagramOptions): RenderedDiagram {
  const c = new Canvas(options)
  const { labels } = options
  const { classes, relations } = classRelations(model)
  const row = Math.round(c.size * 1.45)

  const stereotype = (cls: UmlClass) => {
    if (cls.kind === 'interface') return `«${labels.interface}»`
    if (cls.kind === 'enum') return `«${labels.enumeration}»`
    if (cls.kind === 'record') return `«${labels.record}»`
    if (cls.kind === 'struct') return `«${labels.struct}»`
    return cls.isAbstract ? `«${labels.abstract}»` : null
  }
  const params = (list: { name: string, type?: string }[]) => list.map(p => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ')

  const boxes = classes.map((cls) => {
    const head: Line[] = []
    const st = stereotype(cls)
    if (st) head.push({ text: st, muted: true })
    head.push({ text: cls.name, bold: true, italic: cls.isAbstract || cls.kind === 'interface' })
    const compartments: Line[][] = []
    if (!cls.external) {
      if (cls.enumValues?.length) compartments.push(cls.enumValues.map(text => ({ text })))
      compartments.push(cls.attributes.map(a => ({
        text: `${VISIBILITY[a.visibility]} ${a.name}${a.type ? `: ${a.type}` : ''}`,
        underline: a.isStatic,
        line: a.line,
      })))
      compartments.push(cls.methods.map(m => ({
        text: `${VISIBILITY[m.visibility]} ${m.name}(${params(m.params)})${m.returnType ? `: ${m.returnType}` : ''}`,
        underline: m.isStatic,
        italic: m.isAbstract,
        line: m.line,
      })))
    }
    const all = [...head, ...compartments.flat()]
    const width = Math.max(90, ...all.map(l => c.width(l.text, { bold: l.bold }) + 2 * PAD))
    const height = head.length * row + PAD + compartments.reduce((sum, lines) => sum + Math.max(1, lines.length) * row * 0.5 + lines.length * row * 0.5 + PAD, 0)
    return { cls, head, compartments, width, height: Math.ceil(height) }
  })

  const labelOf = (rel: UmlRelation) => (rel.kind === 'association' ? rel.role : undefined)
  const layout = layoutGraph(
    boxes.map(b => ({ id: b.cls.name, width: b.width, height: b.height })),
    relations.map((rel) => {
      const label = labelOf(rel)
      return { from: rel.from, to: rel.to, label: label ? { width: c.width(label) + 6, height: row } : undefined, weight: rel.kind === 'association' ? 1 : 4 }
    }),
    { rankdir: 'BT', nodesep: 36, ranksep: 64 },
  )

  // Kanten zuerst (unter den Klassen)
  relations.forEach((rel, i) => {
    const points = layout.edges[i]!.points
    if (points.length < 2) return
    const { end, ux, uy } = endDirection(points)
    const dashed = rel.kind === 'realization' ? '6 4' : undefined
    if (rel.kind === 'association') {
      c.path(polyline(points), { 'stroke-dasharray': dashed })
      arrowOpen(c, end, ux, uy)
      const label = layout.edges[i]!.label
      if (label && rel.role) c.text(label.x, label.y, rel.role, { 'text-anchor': 'middle', 'fill': c.theme.muted })
      if (rel.multiplicity) c.text(end.x - ux * 16 + uy * 10, end.y - uy * 16 - ux * 10, rel.multiplicity, { 'text-anchor': 'middle' })
    }
    else {
      // Linie endet an der Dreiecksbasis
      const base = { x: end.x - ux * 14, y: end.y - uy * 14 }
      c.path(polyline([...points.slice(0, -1), base]), { 'stroke-dasharray': dashed })
      triangle(c, end, ux, uy)
    }
  })

  for (const box of boxes) {
    const pos = layout.nodes.get(box.cls.name)!
    const x = pos.x - box.width / 2
    let y = pos.y - box.height / 2
    const active = options.activeClass === box.cls.name
    c.open({ 'data-class': box.cls.name, 'data-path': box.cls.path, 'data-line': box.cls.line })
    c.rect(x, y, box.width, box.height, { 'fill': c.theme.background, 'stroke-dasharray': box.cls.external ? '4 3' : undefined, 'stroke-width': active ? 2 : 1 })
    const headH = box.head.length * row + PAD
    c.rect(x, y, box.width, headH, { fill: active ? c.theme.active : c.theme.header })
    box.head.forEach((l, i) => c.text(pos.x, y + PAD / 2 + row * (i + 0.5), l.text, { 'text-anchor': 'middle', 'bold': l.bold, 'italic': l.italic, 'fill': l.muted ? c.theme.muted : undefined }))
    y += headH
    for (const lines of box.compartments) {
      const h = Math.max(1, lines.length) * row * 0.5 + lines.length * row * 0.5 + PAD
      c.line(x, y, x + box.width, y)
      lines.forEach((l, i) => {
        c.open({ 'data-line': l.line })
        c.text(x + PAD, y + PAD / 2 + row * (i + 0.5), l.text, { underline: l.underline, italic: l.italic })
        c.close()
      })
      y += h
    }
    c.close()
  }
  return c.finish('classes', layout.width, layout.height, 12)
}

export type ObjectDiagramLabels = { variables: string, more: string }
export type ObjectDiagramOptions = RenderOptions & { labels: ObjectDiagramLabels }

/**
 * UML-Objektdiagramm aus einem Speicherabbild: Objekte (`name : Klasse`, unterstrichen) mit Attributwerten,
 * Verweise als Links mit dem Attributnamen. Variablen mit einfachen Werten stehen in einem eigenen Kasten.
 */
export function renderObjectDiagram(snapshot: HeapSnapshot, options: ObjectDiagramOptions): RenderedDiagram {
  const c = new Canvas(options)
  const row = Math.round(c.size * 1.45)
  const names = new Map<number, string[]>()
  const primitives: [string, string][] = []
  for (const [name, value] of snapshot.variables) {
    if ('ref' in value) names.set(value.ref, [...(names.get(value.ref) ?? []), name])
    else primitives.push([name, value.value])
  }

  type Box = { id: string, title: string, lines: string[], width: number, height: number, robot?: string }
  const boxes: Box[] = []
  const links: { from: string, to: string, label: string }[] = []
  const valueText = (value: HeapValue) => ('ref' in value ? '' : value.value)

  if (primitives.length) {
    const lines = primitives.map(([name, value]) => `${name} = ${value}`)
    boxes.push({ id: 'vars', title: options.labels.variables, lines, width: 0, height: 0 })
  }
  const shown = new Set(snapshot.objects.map(o => o.id))
  for (const object of snapshot.objects) {
    const objectNames = names.get(object.id)
    const title = `${objectNames?.join(', ') ?? ''} : ${object.className}`
    const lines: string[] = []
    for (const [field, value] of object.fields) {
      if ('ref' in value) {
        if (shown.has(value.ref)) links.push({ from: `o${object.id}`, to: `o${value.ref}`, label: field })
        else lines.push(`${field} = …`)
      }
      else {
        lines.push(`${field} = ${valueText(value)}`)
      }
    }
    if (object.more) lines.push(options.labels.more)
    boxes.push({ id: `o${object.id}`, title, lines, width: 0, height: 0, robot: object.robot })
  }
  for (const box of boxes) {
    box.width = Math.max(80, c.width(box.title, { bold: true }) + 2 * PAD, ...box.lines.map(l => c.width(l) + 2 * PAD))
    box.height = row + PAD + Math.max(1, box.lines.length) * row + PAD / 2
  }

  const layout = layoutGraph(
    boxes.map(b => ({ id: b.id, width: b.width, height: b.height })),
    links.map(l => ({ from: l.from, to: l.to, label: { width: c.width(l.label) + 6, height: row } })),
    { rankdir: 'LR', nodesep: 28, ranksep: 70 },
  )
  links.forEach((link, i) => {
    const edge = layout.edges[i]!
    if (edge.points.length < 2) return
    c.path(polyline(edge.points))
    const { end, ux, uy } = endDirection(edge.points)
    arrowOpen(c, end, ux, uy)
    if (edge.label) c.text(edge.label.x, edge.label.y, link.label, { 'text-anchor': 'middle', 'fill': c.theme.muted })
  })
  for (const box of boxes) {
    const pos = layout.nodes.get(box.id)!
    const x = pos.x - box.width / 2
    const y = pos.y - box.height / 2
    const isVars = box.id === 'vars'
    c.open({ 'data-object': box.id })
    c.rect(x, y, box.width, box.height, { 'rx': isVars ? 6 : undefined, 'stroke-dasharray': isVars ? '4 3' : undefined })
    c.rect(x, y, box.width, row + PAD, { fill: c.theme.header, rx: isVars ? 6 : undefined })
    c.text(pos.x, y + (row + PAD) / 2, box.title, { 'text-anchor': 'middle', 'bold': true, 'underline': !isVars })
    box.lines.forEach((line, i) => c.text(x + PAD, y + row + PAD + row * (i + 0.5), line))
    c.close()
  }
  return c.finish('objects', layout.width, layout.height, 12)
}

/** Offene Pfeilspitze (Assoziation, Link) */
function arrowOpen(c: Canvas, end: Point, ux: number, uy: number) {
  const size = 10
  const a = { x: end.x - ux * size - uy * size * 0.5, y: end.y - uy * size + ux * size * 0.5 }
  const b = { x: end.x - ux * size + uy * size * 0.5, y: end.y - uy * size - ux * size * 0.5 }
  c.path(`M${a.x} ${a.y}L${end.x} ${end.y}L${b.x} ${b.y}`)
}

/** Hohles Dreieck (Vererbung, Implementierung) */
function triangle(c: Canvas, end: Point, ux: number, uy: number) {
  const size = 14
  const a = { x: end.x - ux * size - uy * size * 0.55, y: end.y - uy * size + ux * size * 0.55 }
  const b = { x: end.x - ux * size + uy * size * 0.55, y: end.y - uy * size - ux * size * 0.55 }
  c.path(`M${a.x} ${a.y}L${end.x} ${end.y}L${b.x} ${b.y}Z`, { fill: c.theme.background })
}
