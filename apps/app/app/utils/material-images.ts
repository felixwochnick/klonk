import { worldPlanSvg, type ImageMap, type MaterialImage, type ResolvedImage } from '@klonk/material'
import { World, type WorldData } from '@klonk/world'
import { WorldRenderer } from '~/utils/world-renderer'

// Bilder für Unterrichtsmaterial: 3D-Ansichten mit dem Welt-Renderer (unsichtbar außerhalb des Fensters, freigestellt),
// Draufsichten als SVG (für DOCX/PPTX zusätzlich als PNG). Ergebnisse bleiben für die Sitzung im Speicher.

const cache = new Map<string, Promise<ResolvedImage>>()
const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

function loadImage(src: string) {
  const image = new Image()
  image.src = src
  return image.decode().then(() => image)
}

/** SVG ⇒ PNG in `scale`-facher Auflösung (scharf im Druck) */
async function rasterize(svg: string, width: number, height: number, scale = 3) {
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/** Durchsichtigen Rand eines Bilds abschneiden (die 3D-Kamera lässt viel Platz um die Welt) */
async function trim(src: string): Promise<ResolvedImage> {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0)
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
  let top = height
  let left = width
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < 8) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) return { src, png: src, width, height }
  const pad = Math.round(Math.max(width, height) * 0.02)
  left = Math.max(0, left - pad)
  top = Math.max(0, top - pad)
  const w = Math.min(width, right + pad + 1) - left
  const h = Math.min(height, bottom + pad + 1) - top
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')!.drawImage(canvas, left, top, w, h, 0, 0, w, h)
  const png = out.toDataURL('image/png')
  return { src: png, png, width: w, height: h }
}

/** Ein unsichtbarer Renderer für alle 3D-Bilder einer Anfrage (ein WebGL-Kontext) */
class Snapshots {
  private container = document.createElement('div')
  private renderer: WorldRenderer

  constructor() {
    Object.assign(this.container.style, { position: 'fixed', left: '-10000px', top: '0', width: '960px', height: '720px', pointerEvents: 'none' })
    this.container.setAttribute('aria-hidden', 'true')
    document.body.appendChild(this.container)
    this.renderer = new WorldRenderer(this.container)
    this.renderer.renderer.setPixelRatio(1.25)
    this.renderer.speed = 0
    this.renderer.dark = false
  }

  async take(world: WorldData) {
    this.renderer.showNames = world.characters.length > 1
    await this.renderer.setWorld(new World(world))
    await frame()
    await frame()
    return trim(this.renderer.snapshot())
  }

  dispose() {
    this.renderer.dispose()
    this.container.remove()
  }
}

async function plan(world: WorldData): Promise<ResolvedImage> {
  const { svg, width, height } = worldPlanSvg(world)
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, png: await rasterize(svg, width, height), width, height }
}

/** Alle Bilder eines Dokuments erzeugen (bereits erzeugte aus dem Speicher) */
export async function resolveImages(list: MaterialImage[], onProgress?: (done: number, total: number) => void): Promise<ImageMap> {
  const result: ImageMap = {}
  let snapshots: Snapshots | undefined
  let done = 0
  try {
    for (const image of list) {
      let pending = cache.get(image.id)
      if (!pending) {
        if (image.kind === 'world') {
          snapshots ??= new Snapshots()
          pending = snapshots.take(image.world)
        }
        else pending = plan(image.world)
        cache.set(image.id, pending)
        pending.catch(() => cache.delete(image.id))
      }
      result[image.id] = await pending.catch(() => undefined)
      onProgress?.(++done, list.length)
    }
  }
  finally {
    snapshots?.dispose()
  }
  return result
}
