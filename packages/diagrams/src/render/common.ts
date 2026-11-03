/** Textbreite in Pixeln (die Oberfläche misst mit Canvas, sonst Näherung für Festbreitenschrift) */
export type Measure = (text: string, style: TextStyle) => number
export type TextStyle = { size: number, bold?: boolean, italic?: boolean }

/** Farben – in der App CSS-Variablen (hell/dunkel), beim Export feste Werte */
export type DiagramTheme = {
  text: string
  muted: string
  line: string
  background: string
  /** Kopfzeilen (Klassenname, Struktogramm-Titel) */
  header: string
  /** Hervorgehobene Zeile (Debugger) */
  active: string
  /** Klassen aus Bibliotheken, Schlüssel */
  accent: string
}

export const LIGHT_THEME: DiagramTheme = {
  text: '#1c1917',
  muted: '#78716c',
  line: '#44403c',
  background: '#ffffff',
  header: '#f5f5f4',
  active: '#fde68a',
  accent: '#c2410c',
}

export type RenderOptions = {
  measure?: Measure
  theme?: DiagramTheme
  font?: string
  fontSize?: number
}

/** Fertiges Diagramm: SVG-Text mit Größe */
export type RenderedDiagram = { svg: string, width: number, height: number }

export const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

/** Näherung für Festbreitenschrift (ohne Browser, z. B. in Tests) */
export const monoMeasure: Measure = (text, style) => [...text].length * style.size * (style.bold ? 0.62 : 0.6)

export function escapeXml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Kontext zum Zeichnen: gesammelte SVG-Elemente, Maße, Farben */
export class Canvas {
  readonly parts: string[] = []
  readonly measure: Measure
  readonly theme: DiagramTheme
  readonly font: string
  readonly size: number

  constructor(options: RenderOptions = {}) {
    this.measure = options.measure ?? monoMeasure
    this.theme = options.theme ?? LIGHT_THEME
    this.font = options.font ?? MONO_FONT
    this.size = options.fontSize ?? 13
  }

  width(text: string, style: Partial<TextStyle> = {}) {
    return Math.ceil(this.measure(text, { size: this.size, ...style }))
  }

  add(element: string) {
    this.parts.push(element)
  }

  rect(x: number, y: number, w: number, h: number, attrs: Record<string, string | number | undefined> = {}) {
    this.add(`<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}"${attributes({ fill: this.theme.background, stroke: this.theme.line, ...attrs })}/>`)
  }

  line(x1: number, y1: number, x2: number, y2: number, attrs: Record<string, string | number | undefined> = {}) {
    this.add(`<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}"${attributes({ stroke: this.theme.line, ...attrs })}/>`)
  }

  path(d: string, attrs: Record<string, string | number | undefined> = {}) {
    this.add(`<path d="${d}"${attributes({ fill: 'none', stroke: this.theme.line, ...attrs })}/>`)
  }

  /** Text, vertikal mittig um `y` */
  text(x: number, y: number, text: string, attrs: Record<string, string | number | boolean | undefined> = {}) {
    const { bold, italic, underline, ...rest } = attrs as Record<string, string | number | undefined> & { bold?: boolean, italic?: boolean, underline?: boolean }
    this.add(`<text x="${r(x)}" y="${r(y)}" dominant-baseline="central"${attributes({
      'fill': this.theme.text,
      'font-weight': bold ? 'bold' : undefined,
      'font-style': italic ? 'italic' : undefined,
      'text-decoration': underline ? 'underline' : undefined,
      ...rest,
    })}>${escapeXml(text)}</text>`)
  }

  open(attrs: Record<string, string | number | undefined>) {
    this.add(`<g${attributes(attrs)}>`)
  }

  close() {
    this.add('</g>')
  }

  /** SVG mit Rand; `data-diagram` kennzeichnet die Art */
  finish(kind: string, width: number, height: number, margin = 8): RenderedDiagram {
    const w = Math.ceil(width + 2 * margin)
    const h = Math.ceil(height + 2 * margin)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-margin} ${-margin} ${w} ${h}" width="${w}" height="${h}" data-diagram="${kind}" font-family="${escapeXml(this.font)}" font-size="${this.size}">${this.parts.join('')}</svg>`
    return { svg, width: w, height: h }
  }
}

function attributes(attrs: Record<string, string | number | undefined>) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => ` ${key}="${typeof value === 'number' ? r(value) : escapeXml(value!)}"`)
    .join('')
}

/** Auf halbe Pixel runden (scharfe Linien, kurze Ausgabe) */
export function r(value: number) {
  return Math.round(value * 2) / 2
}

/** Punkt auf dem Rand eines Rechtecks (Mitte cx/cy, Größe w/h) in Richtung (dx, dy) */
export function clipRect(cx: number, cy: number, w: number, h: number, dx: number, dy: number) {
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const scale = Math.min(dx === 0 ? Infinity : (w / 2) / Math.abs(dx), dy === 0 ? Infinity : (h / 2) / Math.abs(dy))
  return { x: cx + dx * scale, y: cy + dy * scale }
}

/** Punkt auf dem Rand einer Raute */
export function clipDiamond(cx: number, cy: number, w: number, h: number, dx: number, dy: number) {
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const scale = 1 / (Math.abs(dx) / (w / 2) + Math.abs(dy) / (h / 2))
  return { x: cx + dx * scale, y: cy + dy * scale }
}

/** Punkt auf dem Rand einer Ellipse */
export function clipEllipse(cx: number, cy: number, w: number, h: number, dx: number, dy: number) {
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const scale = 1 / Math.sqrt((dx / (w / 2)) ** 2 + (dy / (h / 2)) ** 2)
  return { x: cx + dx * scale, y: cy + dy * scale }
}
