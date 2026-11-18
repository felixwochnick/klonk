import { AnimationQueue, easeInOut, type WorldAnimation } from './animation-queue'
import { BRICK_HEX, MARK_HEX } from './world-renderer'
import type { BrickColor, CharacterData, Direction, MarkColor, Position, World, WorldEvent } from '@klonk/world'

const NS = 'http://www.w3.org/2000/svg'
/** Kantenlänge eines Felds im SVG-Koordinatensystem */
const CELL = 100
/** Rand für die Feldnummern */
const PAD = 50
const ANGLE: Record<Direction, number> = { north: 0, east: 90, south: 180, west: 270 }
const STEP: Record<Direction, Position> = { north: { x: 0, z: -1 }, east: { x: 1, z: 0 }, south: { x: 0, z: 1 }, west: { x: -1, z: 0 } }
/** Helle Ziegel bekommen dunkle Zahlen */
const DARK_TEXT = new Set<BrickColor>(['yellow', 'white', 'orange'])
const BLOCK_FILL = '#6C6E68'
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`
/** Farben des Farbschemas (hell/dunkel über Nuxt UI) – mit hellem Ersatz für das Bild außerhalb der Seite */
const THEME = {
  board: 'var(--ui-bg, #ffffff)',
  grid: 'var(--ui-text-dimmed, #8a918d)',
  label: 'var(--ui-text-muted, #6b7280)',
  figure: 'var(--ui-text-highlighted, #1b2a34)',
  hover: 'var(--ui-primary, #f59e0b)',
}

type CellState = { bricks: BrickColor[], mark: MarkColor | null, block: boolean }

type Figure = {
  id: string
  /** Feld, auf dem die Figur in der Anzeige steht (für die Lage der Ziegelzahl) */
  cell: Position
  direction: Direction
  /** Angezeigte Lage (Felder, beim Laufen zwischen zwei Feldern) */
  x: number
  z: number
  angle: number
  scale: number
  /** Kurzer Ruck (Fehler) in SVG-Einheiten */
  dx: number
  dz: number
  root: SVGGElement
  body: SVGGElement
  badge: SVGGElement
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const element = document.createElementNS(NS, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value))
  parent?.appendChild(element)
  return element
}

const key = ({ x, z }: Position) => `${x},${z}`

/**
 * Draufsicht einer {@link World} als SVG (wie der Bauplan im Unterrichtsmaterial): Norden oben, Zahl im Ziegel =
 * Ziegel übereinander, Pfeil = Figur mit Blickrichtung, getönte Felder = Marken, dunkle Felder mit Kreuz = Quader.
 * Spielt dieselben Ereignisse wie der 3D-{@link WorldRenderer} ab – Felder und Figuren folgen dabei nur den Ereignissen,
 * damit die Anzeige zur laufenden Animation passt, auch wenn die Welt schon weiter ist.
 */
export class WorldPlanRenderer {
  /** Dauer einer Bewegung in ms (0 = sofort) */
  speed = 350
  /** Buchstaben an den Figuren, sobald es mehrere gibt */
  showNames = true
  /** Wird über die CSS-Variablen von Nuxt UI erledigt – nur für dieselbe Schnittstelle wie in 3D */
  dark = false

  private world?: World
  private unsubscribe?: () => void
  private animations = new AnimationQueue()
  private frame = 0
  private readonly root: HTMLDivElement
  private readonly svg: SVGSVGElement
  private readonly board: SVGGElement
  private readonly content: SVGGElement
  private readonly hover: SVGRectElement
  private readonly figureLayer: SVGGElement
  /** Ziegelzahlen unter Figuren – über den Figuren, damit der Pfeil sie nicht verdeckt */
  private readonly labelLayer: SVGGElement
  private cells = new Map<string, CellState>()
  private cellViews = new Map<string, SVGElement[]>()
  private figures = new Map<string, Figure>()

  constructor(container: HTMLElement) {
    // Abstand für die Bedienelemente, die über der Ansicht liegen (oben Status, unten Knöpfe)
    this.root = document.createElement('div')
    this.root.style.cssText = 'position:absolute;inset:0;padding:2.75rem 1rem;'
    this.svg = svg('svg', { 'width': '100%', 'height': '100%', 'preserveAspectRatio': 'xMidYMid meet', 'data-testid': 'world-plan' })
    this.svg.style.display = 'block'
    this.root.appendChild(this.svg)
    this.board = svg('g', {}, this.svg)
    this.content = svg('g', {}, this.svg)
    this.hover = svg('rect', { 'width': CELL, 'height': CELL, 'fill-opacity': 0.25, 'stroke-width': 4, 'visibility': 'hidden', 'pointer-events': 'none' }, this.svg)
    this.hover.style.fill = THEME.hover
    this.hover.style.stroke = THEME.hover
    this.figureLayer = svg('g', {}, this.svg)
    this.labelLayer = svg('g', { 'pointer-events': 'none' }, this.svg)
    container.appendChild(this.root)
  }

  get parallel() {
    return this.animations.parallel
  }

  set parallel(parallel: boolean) {
    this.animations.parallel = parallel
  }

  /** Läuft gerade noch eine Animation? */
  get busy() {
    return this.animations.busy
  }

  /** Welt anzeigen; Änderungen der Welt werden automatisch animiert */
  async setWorld(world: World) {
    this.unsubscribe?.()
    this.world = world
    this.unsubscribe = world.on(event => this.onEvent(event))
    this.animations.clear()
    this.rebuild()
  }

  /** Die Draufsicht passt sich immer an – nichts zurückzusetzen */
  resetCamera() {}

  /** Feld unter dem Mauszeiger (für den Editor) */
  pick(event: { clientX: number, clientY: number }): Position | null {
    const matrix = this.svg.getScreenCTM()
    if (!this.world || !matrix) return null
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    const position = { x: Math.floor((point.x - PAD) / CELL), z: Math.floor((point.y - PAD) / CELL) }
    return this.world.isInside(position) ? position : null
  }

  setHover(position: Position | null) {
    this.hover.setAttribute('visibility', position ? 'visible' : 'hidden')
    if (!position) return
    this.hover.setAttribute('x', String(PAD + position.x * CELL))
    this.hover.setAttribute('y', String(PAD + position.z * CELL))
  }

  /** Bild der Ansicht (SVG, immer hell) */
  snapshot() {
    const copy = this.svg.cloneNode(true) as SVGSVGElement
    copy.setAttribute('xmlns', NS)
    copy.setAttribute('font-family', 'Arial, Helvetica, sans-serif')
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`
  }

  /** Figur hüpfen lassen (z. B. wenn eine Aufgabe gelöst ist) */
  cheer(id?: string) {
    const ids = id ? [id] : [...this.figures.keys()]
    for (const name of ids) {
      this.enqueueFigure(name, Math.max(this.speed, 300) * 3, (figure, t) => {
        figure.scale = 1 + 0.3 * Math.abs(Math.sin(t * Math.PI * 3))
      })
    }
  }

  /** Figuren, die auf dieses Feld schauen (oder darauf stehen), zucken zurück – z. B. nach einem Fehler vor einer Wand */
  bumpAt(position: Position) {
    if (!this.world) return
    for (const character of this.world.getCharacters()) {
      const front = this.world.front(character.id)
      const facing = (front.x === position.x && front.z === position.z) || (character.x === position.x && character.z === position.z)
      if (!facing) continue
      this.enqueueFigure(character.id, Math.max(this.speed, 300) * 2, (figure, t) => {
        // Nach vorn stoßen, zurückprallen und kurz zittern
        const push = t < 0.25 ? Math.sin((t / 0.25) * Math.PI) * 22 : Math.sin((t - 0.25) * Math.PI * 8) * 5 * (1 - t)
        const step = STEP[figure.direction]
        figure.dx = step.x * push
        figure.dz = step.z * push
      })
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.unsubscribe?.()
    this.animations.clear()
    this.root.remove()
  }

  // ---------------------------------------------------------------------------

  private schedule() {
    this.frame ||= requestAnimationFrame(this.loop)
  }

  private loop = () => {
    this.frame = 0
    this.animations.tick(performance.now())
    if (this.animations.busy) this.schedule()
  }

  private enqueue(animation: WorldAnimation, lane = '') {
    this.animations.enqueue(animation, lane)
    this.schedule()
  }

  /** Bewegung einer Figur, die erst beim Abspielen gesucht wird (sie kann gerade erst hinzukommen) */
  private enqueueFigure(id: string, duration: number, update: (figure: Figure, t: number) => void) {
    this.enqueue({
      duration,
      update: (t) => {
        const figure = this.figures.get(id)
        if (!figure) return
        update(figure, t)
        this.place(figure)
      },
      done: () => {
        const figure = this.figures.get(id)
        if (!figure) return
        figure.scale = 1
        figure.dx = 0
        figure.dz = 0
        this.place(figure)
      },
    }, id)
  }

  private rebuild() {
    const world = this.world!
    const { width, depth } = world
    this.svg.setAttribute('viewBox', `0 0 ${PAD + width * CELL + 4} ${PAD + depth * CELL + 4}`)

    // Brett mit Raster und Feldnummern (ab 1 wie positionX/positionY)
    this.board.replaceChildren()
    const background = svg('rect', { x: PAD, y: PAD, width: width * CELL, height: depth * CELL }, this.board)
    background.style.fill = THEME.board
    let lines = ''
    for (let x = 0; x <= width; x++) lines += `M${PAD + x * CELL} ${PAD}V${PAD + depth * CELL}`
    for (let z = 0; z <= depth; z++) lines += `M${PAD} ${PAD + z * CELL}H${PAD + width * CELL}`
    const grid = svg('path', { 'd': lines, 'fill': 'none', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }, this.board)
    grid.style.stroke = THEME.grid
    const label = (text: number, x: number, y: number) => {
      const element = svg('text', { 'x': x, 'y': y, 'font-size': 27, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, this.board)
      element.style.fill = THEME.label
      element.textContent = String(text)
    }
    for (let x = 0; x < width; x++) label(x + 1, PAD + x * CELL + CELL / 2, PAD * 0.55)
    for (let z = 0; z < depth; z++) label(z + 1, PAD * 0.5, PAD + z * CELL + CELL / 2)

    // Felder und Figuren aus dem aktuellen Stand der Welt
    this.cells.clear()
    this.cellViews.clear()
    this.content.replaceChildren()
    this.labelLayer.replaceChildren()
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        const cell = world.cell({ x, z })
        if (cell.bricks.length || cell.mark || cell.block) this.cells.set(key({ x, z }), { bricks: [...cell.bricks], mark: cell.mark ?? null, block: !!cell.block })
      }
    }
    this.figures.clear()
    this.figureLayer.replaceChildren()
    for (const character of world.getCharacters()) this.addFigure(character)
    this.updateBadges()
    for (const position of this.cells.keys()) this.renderCell(position)
  }

  /** Zustand eines Felds in der Anzeige ändern und neu zeichnen */
  private changeCell(position: Position, change: (cell: CellState) => void) {
    const id = key(position)
    const cell = this.cells.get(id) ?? { bricks: [], mark: null, block: false }
    change(cell)
    if (cell.bricks.length || cell.mark || cell.block) this.cells.set(id, cell)
    else this.cells.delete(id)
    this.renderCell(id)
  }

  private renderCell(id: string) {
    for (const element of this.cellViews.get(id) ?? []) element.remove()
    this.cellViews.delete(id)
    const cell = this.cells.get(id)
    if (!cell) return
    const [x, z] = id.split(',').map(Number) as [number, number]
    const left = PAD + x * CELL
    const top = PAD + z * CELL
    const group = svg('g', { 'data-cell': id, 'data-bricks': cell.bricks.length, 'data-mark': cell.mark ?? '', 'data-block': String(cell.block) }, this.content)
    this.cellViews.set(id, [group])
    if (cell.mark) {
      const color = hex(MARK_HEX[cell.mark])
      svg('rect', { 'x': left + 6, 'y': top + 6, 'width': CELL - 12, 'height': CELL - 12, 'rx': 8, 'fill': color, 'fill-opacity': 0.9, 'stroke': color, 'stroke-width': 2 }, group)
    }
    if (cell.block) {
      svg('rect', { 'x': left + 8, 'y': top + 8, 'width': CELL - 16, 'height': CELL - 16, 'rx': 6, 'fill': BLOCK_FILL, 'stroke': '#3f413d', 'stroke-width': 1.5 }, group)
      svg('path', { 'd': `M${left + 16} ${top + 16}L${left + CELL - 16} ${top + CELL - 16}M${left + CELL - 16} ${top + 16}L${left + 16} ${top + CELL - 16}`, 'stroke': '#d6d8d4', 'stroke-width': 3 }, group)
    }
    const brick = cell.bricks.at(-1)
    if (brick) {
      svg('rect', { 'x': left + 16, 'y': top + 16, 'width': CELL - 32, 'height': CELL - 32, 'rx': 8, 'fill': hex(BRICK_HEX[brick]), 'stroke': '#1f2937', 'stroke-width': 1.5 }, group)
      const fill = DARK_TEXT.has(brick) ? '#111827' : '#ffffff'
      const count = String(cell.bricks.length)
      // Steht eine Figur darauf, wandert die Zahl als Schild in die Ecke (gegenüber dem Namen)
      if ([...this.figures.values()].some(f => f.cell.x === x && f.cell.z === z)) {
        const label = svg('g', { 'transform': `translate(${left + 20} ${top + CELL - 20})`, 'data-cell-label': id }, this.labelLayer)
        svg('circle', { 'r': 15, 'fill': hex(BRICK_HEX[brick]), 'stroke': '#ffffff', 'stroke-width': 2 }, label)
        svg('text', { 'font-size': 20, 'font-weight': 'bold', 'text-anchor': 'middle', 'dominant-baseline': 'central', fill }, label).textContent = count
        this.cellViews.get(id)!.push(label)
      }
      else {
        svg('text', { 'x': left + CELL / 2, 'y': top + CELL / 2, 'font-size': 38, 'font-weight': 'bold', 'text-anchor': 'middle', 'dominant-baseline': 'central', fill }, group).textContent = count
      }
    }
  }

  private addFigure(character: Readonly<CharacterData>) {
    this.figures.get(character.id)?.root.remove()
    const root = svg('g', { 'data-character': character.id }, this.figureLayer)
    svg('title', {}, root).textContent = character.id
    const body = svg('g', {}, root)
    const arrow = svg('path', { 'd': 'M0 -36L28 30L0 16L-28 30Z', 'stroke-width': 3, 'stroke-linejoin': 'round' }, body)
    arrow.style.fill = THEME.figure
    arrow.style.stroke = THEME.board
    // Anfangsbuchstabe in der Ecke, sobald mehrere Figuren unterwegs sind
    const badge = svg('g', { transform: 'translate(30 -30)' }, root)
    const circle = svg('circle', { 'r': 15, 'stroke-width': 1.5 }, badge)
    circle.style.fill = THEME.board
    circle.style.stroke = THEME.figure
    const letter = svg('text', { 'font-size': 20, 'font-weight': 'bold', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, badge)
    letter.style.fill = THEME.figure
    letter.textContent = ([...character.id][0] ?? '').toUpperCase()
    const figure: Figure = {
      id: character.id,
      cell: { x: character.x, z: character.z },
      direction: character.direction,
      x: character.x,
      z: character.z,
      angle: ANGLE[character.direction],
      scale: 1,
      dx: 0,
      dz: 0,
      root,
      body,
      badge,
    }
    this.figures.set(character.id, figure)
    this.place(figure)
    return figure
  }

  private removeFigure(id: string) {
    const figure = this.figures.get(id)
    if (!figure) return
    figure.root.remove()
    this.figures.delete(id)
    this.updateBadges()
    this.renderCell(key(figure.cell))
  }

  private updateBadges() {
    const show = this.showNames && this.figures.size > 1
    for (const figure of this.figures.values()) figure.badge.setAttribute('visibility', show ? 'visible' : 'hidden')
  }

  private place(figure: Figure) {
    const x = PAD + figure.x * CELL + CELL / 2 + figure.dx
    const y = PAD + figure.z * CELL + CELL / 2 + figure.dz
    figure.root.setAttribute('transform', `translate(${x} ${y})`)
    figure.body.setAttribute('transform', `rotate(${figure.angle}) scale(${figure.scale})`)
    figure.root.dataset.x = String(figure.cell.x)
    figure.root.dataset.z = String(figure.cell.z)
    figure.root.dataset.direction = figure.direction
  }

  /** Figur kommt auf ein anderes Feld ⇒ Ziegelzahlen beider Felder neu setzen */
  private setFigureCell(figure: Figure, cell: Position) {
    const from = figure.cell
    figure.cell = { x: cell.x, z: cell.z }
    this.renderCell(key(from))
    this.renderCell(key(cell))
  }

  private onEvent(event: WorldEvent) {
    const duration = this.speed
    switch (event.type) {
      case 'move': {
        const climb = event.from.y !== event.to.y
        let started = false
        this.enqueueFigure(event.id, climb ? duration * 1.3 : duration, (figure, t) => {
          if (!started) {
            started = true
            this.setFigureCell(figure, event.to)
          }
          // Beim Steigen hebt sich die Figur kurz an (größer = näher an der Kamera)
          const forward = climb ? easeInOut(Math.min(1, Math.max(0, (t - 0.2) / 0.6))) : t
          figure.x = event.from.x + (event.to.x - event.from.x) * forward
          figure.z = event.from.z + (event.to.z - event.from.z) * forward
          figure.scale = 1 + (climb ? 0.25 : 0.04) * Math.sin(t * Math.PI)
        })
        break
      }
      case 'turn': {
        let start = 0
        let delta: number | undefined
        this.enqueueFigure(event.id, duration * 0.6, (figure, t) => {
          if (delta === undefined) {
            start = figure.angle
            delta = ((ANGLE[event.direction] - start + 540) % 360) - 180
            figure.direction = event.direction
          }
          figure.angle = start + delta * easeInOut(t)
        })
        break
      }
      case 'brick-placed':
      case 'brick-removed':
      case 'mark-set':
      case 'mark-removed':
      case 'block-set': {
        const apply = () => this.changeCell(event.at, (cell) => {
          if (event.type === 'brick-placed') cell.bricks.push(event.color)
          else if (event.type === 'brick-removed') cell.bricks.pop()
          else if (event.type === 'mark-set') cell.mark = event.color
          else if (event.type === 'mark-removed') cell.mark = null
          else cell.block = event.block
        })
        const by = 'by' in event ? event.by : undefined
        if (!by || !this.figures.has(by)) {
          this.enqueue({ duration: duration * 0.4, update: () => {}, done: apply })
          break
        }
        // Mit Figur: kurz bücken, die Welt ändert sich mitten in der Bewegung
        const at = event.type === 'brick-removed' ? 0.5 : 0.4
        let applied = false
        const once = () => {
          if (applied) return
          applied = true
          apply()
        }
        this.enqueue({
          duration: duration * 1.1,
          update: (t) => {
            const figure = this.figures.get(by)
            if (figure) {
              figure.scale = 1 - 0.18 * Math.sin(t * Math.PI)
              this.place(figure)
            }
            if (t >= at) once()
          },
          done: () => {
            once()
            const figure = this.figures.get(by)
            if (!figure) return
            figure.scale = 1
            this.place(figure)
          },
        }, by)
        break
      }
      case 'character-added':
        this.enqueue({
          duration: 0,
          update: () => {
            const figure = this.addFigure(event.character)
            this.updateBadges()
            this.renderCell(key(figure.cell))
            if (duration > 0) figure.scale = 0
            this.place(figure)
          },
        }, event.character.id)
        // Neue Figuren erscheinen mit kleinem Federn
        if (duration > 0) {
          this.enqueueFigure(event.character.id, duration * 0.8, (figure, t) => {
            figure.scale = t < 0.7 ? easeInOut(t / 0.7) * 1.15 : 1.15 - 0.15 * ((t - 0.7) / 0.3)
          })
        }
        break
      case 'character-removed':
        this.enqueue({ duration: 0, update: () => this.removeFigure(event.id) }, event.id)
        break
      case 'reset':
        this.animations.clear()
        this.rebuild()
        break
    }
  }
}
