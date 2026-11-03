import { javaOutline, javascriptOutline, klonkOutline, LIGHT_THEME, MONO_FONT, pythonOutline, type DiagramTheme, type Measure, type Outline, type RenderedDiagram, type RenderOptions } from '@klonk/diagrams'
import { outlineCSharp } from '~/utils/checker'

/** Sprachen mit Klassen (Klassen- und Objektdiagramm); Klonk-Script und Blöcke haben nur Struktogramme */
export const CLASS_LANGUAGES: readonly string[] = ['javascript', 'typescript', 'python', 'java', 'csharp']

/** Dateiendungen je Sprache (Klassendiagramm über das ganze Projekt) */
export const LANGUAGE_EXTENSIONS: Record<string, RegExp> = {
  javascript: /\.js$/,
  typescript: /\.ts$/,
  python: /\.py$/,
  java: /\.java$/,
  csharp: /\.cs$/,
}

/**
 * Auswertung für Diagramme: Struktogramme und Klassen. Klonk-Script/Blöcke, JS/TS, Python und Java direkt
 * (Lezer, fehlertolerant), C# über Roslyn im Prüf-Worker. Wirft bei nicht auswertbarem Code (Klonk-Script-Syntaxfehler).
 */
export async function outlineOf(language: string, source: string, path?: string | null, files: Record<string, string> = {}): Promise<Outline | null> {
  switch (language) {
    case 'klonk':
    case 'blocks': return klonkOutline(source)
    case 'javascript': return javascriptOutline(source, path ?? undefined)
    case 'typescript': return javascriptOutline(source, path ?? undefined, true)
    case 'python': return pythonOutline(source, path ?? undefined)
    case 'java': return javaOutline(source, path ?? undefined)
    case 'csharp': {
      const outline = await outlineCSharp(source, files)
      if (outline && path) for (const cls of outline.classes) cls.path = path
      return outline
    }
    default: return null
  }
}

let context: CanvasRenderingContext2D | null = null
/** Textbreite mit der Schrift der Diagramme (Canvas) */
export const canvasMeasure: Measure = (text, style) => {
  context ??= document.createElement('canvas').getContext('2d')
  if (!context) return text.length * style.size * 0.6
  context.font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.size}px ${MONO_FONT}`
  return context.measureText(text).width
}

/** Farben aus dem Nuxt-UI-Theme (hell/dunkel) – als feste Werte, SVG-Attribute kennen keine CSS-Variablen */
export function themeColors(): DiagramTheme {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    text: read('--ui-text', LIGHT_THEME.text),
    muted: read('--ui-text-muted', LIGHT_THEME.muted),
    line: read('--ui-text-toned', LIGHT_THEME.line),
    background: read('--ui-bg', LIGHT_THEME.background),
    header: read('--ui-bg-elevated', LIGHT_THEME.header),
    active: `color-mix(in oklab, ${read('--ui-warning', '#f59e0b')} 35%, ${read('--ui-bg', '#ffffff')})`,
    accent: read('--ui-primary', LIGHT_THEME.accent),
  }
}

export type DiagramRenderer = (options: RenderOptions) => RenderedDiagram

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Export immer hell (Arbeitsblätter, Dokumente) */
export function exportSvg(render: DiagramRenderer, name: string) {
  const { svg } = render({ theme: LIGHT_THEME, measure: canvasMeasure })
  download(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' }), `${name}.svg`)
}

export async function exportPng(render: DiagramRenderer, name: string, scale = 2) {
  const { svg, width, height } = render({ theme: LIGHT_THEME, measure: canvasMeasure })
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(width * scale)
    canvas.height = Math.ceil(height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (blob) download(blob, `${name}.png`)
  }
  finally {
    URL.revokeObjectURL(url)
  }
}
