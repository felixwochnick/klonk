import { applyDesign, nameLabel, needsOutfits } from './character-look'
import type { BrickColor, CharacterData, CharacterModel, Direction, MarkColor, Position, World, WorldEvent } from '@klonk/world'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/** Maße passend zu den Blender-Modellen (assets/blender/build_models.py) */
/** Ein Feld = 4×4 Noppen (Raster 0,25) */
export const BRICK_HEIGHT = 0.3
export const PLATE_HEIGHT = 0.1
/** Marken sind Fliesen in Plattenhöhe, die die Noppen abdecken */
const TILE_HEIGHT = 0.1

export const BRICK_HEX: Record<BrickColor, number> = {
  red: 0xC91A09,
  blue: 0x0055BF,
  yellow: 0xF2CD37,
  green: 0x237841,
  orange: 0xFE8A18,
  purple: 0x81007B,
  white: 0xF4F4F4,
  black: 0x1B2A34,
}

export const MARK_HEX: Record<MarkColor, number> = {
  yellow: 0xF2CD37,
  red: 0xC91A09,
  blue: 0x0055BF,
  green: 0x4B9F4A,
}

const BLOCK_HEX = 0x6C6E68
const FLOOR_HEX = 0x9BA19D
const ROTATION: Record<Direction, number> = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 }

type Models = {
  brick: THREE.BufferGeometry
  plate: THREE.BufferGeometry
  tile: THREE.BufferGeometry
  characters: Record<CharacterModel, THREE.Object3D>
  /** Animationen der Figuren (Clips aus Blender, je Modell dieselben Namen) */
  clips: Record<CharacterModel, THREE.AnimationClip[]>
}

/** Clips aus assets/blender/build_models.py (CLIPS) */
type ClipName = 'Walk' | 'Climb' | 'Turn' | 'Place' | 'Pick' | 'Mark' | 'Wave' | 'Cheer' | 'Bump' | 'Idle'

type CharacterView = {
  root: THREE.Object3D
  model: THREE.Object3D
  mixer: THREE.AnimationMixer
  clips: Map<string, THREE.AnimationClip>
  action?: THREE.AnimationAction
}

type Animation = { duration: number, update: (t: number) => void, done?: () => void }

let modelsPromise: Promise<Models> | undefined

/** Modelle einmalig laden und zwischen Ansichten teilen */
function loadModels(): Promise<Models> {
  modelsPromise ??= (async () => {
    const loader = new GLTFLoader()
    const load = (name: string) => loader.loadAsync(`/models/${name}.glb`)
    const mesh = (scene: THREE.Object3D) => {
      let geometry: THREE.BufferGeometry | undefined
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) geometry ??= (o as THREE.Mesh).geometry
      })
      return geometry!
    }
    const [brick, plate, tile, male, female, diverse] = await Promise.all(
      ['brick', 'plate', 'tile', 'character-male', 'character-female', 'character-diverse'].map(load),
    )
    for (const character of [male!, female!, diverse!]) {
      character.scene.traverse((o) => {
        o.castShadow = true
      })
    }
    return {
      brick: mesh(brick!.scene),
      plate: mesh(plate!.scene),
      tile: mesh(tile!.scene),
      characters: { male: male!.scene, female: female!.scene, diverse: diverse!.scene },
      clips: { male: male!.animations, female: female!.animations, diverse: diverse!.animations },
    }
  })()
  return modelsPromise
}

let outfitsPromise: Promise<THREE.Object3D> | undefined

/** Skins und Zubehör erst laden, wenn ein Design sie braucht */
function loadOutfits(): Promise<THREE.Object3D> {
  outfitsPromise ??= new GLTFLoader().loadAsync('/models/outfits.glb').then(g => g.scene)
  return outfitsPromise
}

let outfits: THREE.Object3D | undefined

/**
 * Stellt eine {@link World} mit three.js dar und animiert ihre Ereignisse (Laufen, Drehen, Ziegel …).
 * Unabhängig von Vue – die Komponente `KlonkWorld` bindet ihn ein.
 */
export class WorldRenderer {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls

  /** Dauer einer Bewegung in ms (0 = sofort) */
  speed = 350

  private models?: Models
  private world?: World
  private unsubscribe?: () => void
  private floor?: THREE.InstancedMesh
  private bricks?: THREE.InstancedMesh
  private marks?: THREE.InstancedMesh
  private characters = new Map<string, CharacterView>()
  private hover: THREE.Mesh
  private queue: Animation[] = []
  private current?: { animation: Animation, start: number }
  private frame = 0
  /** Nur bei Bedarf rendern (Animation, Kamera, Änderungen) – spart Leistung und lässt dem Browser Leerlaufzeit */
  private dirty = true
  private resizeObserver: ResizeObserver
  private raycaster = new THREE.Raycaster()

  /** Namensschilder über den Figuren (aus z. B. in der Design-Vorschau) */
  showNames = true
  /** Dunkles Farbschema (Namensschilder) */
  dark = false

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.addEventListener('change', () => this.invalidate())
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05

    this.scene.add(new THREE.HemisphereLight(0xFFFFFF, 0x8D8D8D, 2.2))
    const sun = new THREE.DirectionalLight(0xFFFFFF, 2.2)
    sun.position.set(-8, 16, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    this.scene.add(sun)
    this.scene.add(sun.target)
    this.sun = sun

    this.hover = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.05, 1),
      new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.35, depthWrite: false }),
    )
    this.hover.visible = false
    this.scene.add(this.hover)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.loop()
  }

  private sun: THREE.DirectionalLight

  /** Welt anzeigen; Änderungen der Welt werden automatisch animiert */
  async setWorld(world: World) {
    this.models ??= await loadModels()
    this.unsubscribe?.()
    this.world = world
    this.unsubscribe = world.on(event => this.onEvent(event))
    this.queue = []
    this.current = undefined
    this.rebuild()
    this.resetCamera()
  }

  resetCamera() {
    if (!this.world) return
    const { width, depth } = this.world
    const center = new THREE.Vector3(width / 2 - 0.5, 0, depth / 2 - 0.5)
    const distance = Math.max(width, depth) * 0.95 + 3
    this.camera.position.set(center.x - distance * 0.35, distance * 0.8, center.z + distance * 0.9)
    this.controls.target.copy(center)
    this.controls.update()

    const size = Math.max(width, depth)
    const shadow = this.sun.shadow.camera
    shadow.left = -size
    shadow.right = size
    shadow.top = size
    shadow.bottom = -size
    shadow.updateProjectionMatrix()
    this.sun.position.set(center.x - 8, 16, center.z + 10)
    this.sun.target.position.copy(center)
    this.invalidate()
  }

  /** Feld unter dem Mauszeiger (für den Editor) */
  pick(event: { clientX: number, clientY: number }): Position | null {
    if (!this.world || !this.floor) return null
    const rect = this.renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(pointer, this.camera)
    const targets = [this.floor, this.bricks, this.marks].filter(Boolean) as THREE.Object3D[]
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    if (!hit) return null
    // Etwas in die Fläche hinein, damit Treffer an Kanten eindeutig sind
    const point = hit.point.clone().addScaledVector(this.raycaster.ray.direction, 0.01)
    const position = { x: Math.round(point.x), z: Math.round(point.z) }
    return this.world.isInside(position) ? position : null
  }

  setHover(position: Position | null) {
    if (this.hover.visible !== (!!position && !!this.world)) this.invalidate()
    this.hover.visible = !!position && !!this.world
    if (!position || !this.world) return
    this.hover.position.set(position.x, this.surface(position) + 0.03, position.z)
    this.invalidate()
  }

  /** Bild der Szene (z. B. für Vorschaubilder) */
  snapshot() {
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement.toDataURL('image/png')
  }

  /** Läuft gerade noch eine Animation? */
  get busy() {
    return !!this.current || this.queue.length > 0
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.unsubscribe?.()
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // ---------------------------------------------------------------------------

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }

  /** Nächstes Bild neu zeichnen */
  invalidate() {
    this.dirty = true
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    const animating = this.busy
    this.tick(performance.now())
    // update() liefert true, solange die gedämpfte Kamerabewegung ausläuft
    if (this.controls.update() || animating) this.dirty = true
    if (!this.dirty) return
    this.dirty = false
    this.renderer.render(this.scene, this.camera)
  }

  private tick(now: number) {
    if (!this.current) {
      const next = this.queue.shift()
      if (!next) {
        this.tickIdle(now)
        return
      }
      this.stopIdle()
      this.current = { animation: next, start: now }
    }
    const { animation, start } = this.current
    const t = animation.duration > 0 ? Math.min(1, (now - start) / animation.duration) : 1
    animation.update(t)
    if (t >= 1) {
      animation.done?.()
      this.current = undefined
      // Restliche Sofort-Animationen im selben Frame abarbeiten
      if (this.queue[0]?.duration === 0) this.tick(now)
    }
  }

  private enqueue(animation: Animation) {
    this.queue.push(animation)
  }

  /** Oberkante eines Feldes (Boden + Ziegel bzw. Quader) */
  private surface(position: Position) {
    return PLATE_HEIGHT + (this.world?.levelAt(position) ?? 0) * BRICK_HEIGHT
  }

  private rebuild() {
    this.invalidate()
    const world = this.world!
    const models = this.models!

    for (const obj of [this.floor, this.bricks, this.marks]) {
      if (obj) {
        this.scene.remove(obj)
        obj.dispose()
      }
    }

    // Boden aus Platten
    const floorMaterial = new THREE.MeshStandardMaterial({ color: FLOOR_HEX, roughness: 0.45 })
    this.floor = new THREE.InstancedMesh(models.plate, floorMaterial, world.width * world.depth)
    this.floor.receiveShadow = true
    const m = new THREE.Matrix4()
    let i = 0
    for (let x = 0; x < world.width; x++) {
      for (let z = 0; z < world.depth; z++) this.floor.setMatrixAt(i++, m.makeTranslation(x, 0, z))
    }
    this.scene.add(this.floor)

    this.rebuildBricks()
    this.rebuildMarks()

    for (const view of this.characters.values()) this.scene.remove(view.root)
    this.characters.clear()
    this.idle = undefined
    for (const character of world.getCharacters()) this.addCharacterView(character)
  }

  private rebuildBricks() {
    this.invalidate()
    const world = this.world!
    if (this.bricks) {
      this.scene.remove(this.bricks)
      this.bricks.dispose()
    }
    const material = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 })
    this.bricks = new THREE.InstancedMesh(this.models!.brick, material, Math.max(1, world.width * world.depth * world.height))
    this.bricks.castShadow = true
    this.bricks.receiveShadow = true
    const m = new THREE.Matrix4()
    const color = new THREE.Color()
    let count = 0
    for (let x = 0; x < world.width; x++) {
      for (let z = 0; z < world.depth; z++) {
        const cell = world.cell({ x, z })
        const stack = cell.block ? Array.from({ length: world.height }, () => null) : cell.bricks
        stack.forEach((brick, level) => {
          this.bricks!.setMatrixAt(count, m.makeTranslation(x, PLATE_HEIGHT + level * BRICK_HEIGHT, z))
          this.bricks!.setColorAt(count, color.setHex(brick ? BRICK_HEX[brick] : BLOCK_HEX))
          count++
        })
      }
    }
    this.bricks.count = count
    this.bricks.instanceMatrix.needsUpdate = true
    if (this.bricks.instanceColor) this.bricks.instanceColor.needsUpdate = true
    this.scene.add(this.bricks)
  }

  private rebuildMarks() {
    const world = this.world!
    if (this.marks) {
      this.scene.remove(this.marks)
      this.marks.dispose()
    }
    const material = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.25 })
    this.marks = new THREE.InstancedMesh(this.models!.tile, material, world.width * world.depth)
    this.marks.receiveShadow = true
    const m = new THREE.Matrix4()
    const color = new THREE.Color()
    let count = 0
    for (let x = 0; x < world.width; x++) {
      for (let z = 0; z < world.depth; z++) {
        const mark = world.cell({ x, z }).mark
        if (!mark) continue
        this.marks.setMatrixAt(count, m.makeTranslation(x, this.surface({ x, z }), z))
        this.marks.setColorAt(count, color.setHex(MARK_HEX[mark]))
        count++
      }
    }
    this.marks.count = count
    this.marks.instanceMatrix.needsUpdate = true
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true
    this.scene.add(this.marks)
  }

  private addCharacterView(character: CharacterData) {
    this.invalidate()
    // Die Füße (je 1×2 Noppen mit Noppenlöchern) stecken mittig auf den inneren vier Noppen des Feldes
    const base = character.design?.base ?? character.model
    const model = this.models!.characters[base].clone(true)
    const design = character.design
    if (design) {
      applyDesign(model, design, outfits)
      if (!outfits && needsOutfits(design)) {
        void loadOutfits().then((loaded) => {
          outfits = loaded
          applyDesign(model, design, loaded)
          this.invalidate()
        }).catch(() => {})
      }
    }
    const root = new THREE.Group()
    root.add(model)
    // Name über der Figur – er identifiziert sie (Programme sprechen sie darüber an)
    if (this.showNames) {
      const label = nameLabel(character.id, this.dark)
      label.position.y = 1.62
      root.add(label)
    }
    const view: CharacterView = {
      root,
      model,
      mixer: new THREE.AnimationMixer(model),
      clips: new Map(this.models!.clips[base].map(clip => [clip.name, clip])),
    }
    // Markierungen liegen obenauf – Figuren stehen auf der Oberkante darunter
    root.position.set(character.x, this.surface(character) + this.markOffset(character), character.z)
    root.rotation.y = ROTATION[character.direction]
    root.name = `character:${character.id}`
    this.scene.add(root)
    this.characters.set(character.id, view)
  }

  /** Figur in die Haltung eines Clips zur relativen Zeit `t` (0–1) bringen */
  private pose(view: CharacterView, name: ClipName, t: number) {
    const clip = view.clips.get(name)
    if (!clip) return
    if (view.action?.getClip() !== clip) {
      view.action?.stop()
      view.action = view.mixer.clipAction(clip)
      view.action.setLoop(THREE.LoopOnce, 1)
      view.action.clampWhenFinished = true
      view.action.play()
    }
    view.mixer.setTime(Math.min(t, 0.999) * clip.duration)
  }

  /** Zurück in die Ruhehaltung (der Mixer stellt den Ausgangszustand wieder her) */
  private relax(view: CharacterView) {
    view.action?.stop()
    view.action = undefined
    view.mixer.update(0)
  }

  /** Clip als eigene Animation in die Warteschlange (z. B. Winken, Freuen) */
  private enqueueClip(id: string, name: ClipName, duration: number) {
    // Figur erst beim Abspielen suchen – sie kann gerade erst hinzukommen
    this.enqueue({
      duration,
      update: (t) => {
        const view = this.characters.get(id)
        if (view) this.pose(view, name, t)
      },
      done: () => {
        const view = this.characters.get(id)
        if (view) this.relax(view)
      },
    })
  }

  /** Figur jubeln lassen (z. B. wenn eine Aufgabe gelöst ist) */
  cheer(id?: string) {
    const ids = id ? [id] : [...this.characters.keys()]
    for (const name of ids) this.enqueueClip(name, 'Cheer', Math.max(this.speed, 300) * 3)
  }

  /** Figuren, die auf dieses Feld schauen (oder darauf stehen), zucken zurück – z. B. nach einem Fehler vor einer Wand */
  bumpAt(position: Position) {
    if (!this.world) return
    for (const character of this.world.getCharacters()) {
      const front = this.world.front(character.id)
      const facing = (front.x === position.x && front.z === position.z) || (character.x === position.x && character.z === position.z)
      if (facing) this.enqueueClip(character.id, 'Bump', Math.max(this.speed, 300) * 2)
    }
  }

  // ---------------------------------------------------------------------------
  // Gelegentliche Bewegungen im Stand (umschauen, blinzeln) – nur wenn sonst nichts animiert wird

  private idle?: { view: CharacterView, start: number }
  private nextIdle = performance.now() + 2500
  private reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  private stopIdle() {
    if (!this.idle) return
    this.relax(this.idle.view)
    this.idle = undefined
    this.dirty = true
  }

  private tickIdle(now: number) {
    if (this.idle) {
      const { view, start } = this.idle
      const clip = view.clips.get('Idle')
      const t = clip ? (now - start) / (clip.duration * 1000) : 1
      if (t >= 1) this.stopIdle()
      else this.pose(view, 'Idle', t)
      this.dirty = true
      return
    }
    if (now < this.nextIdle || this.busy || this.reducedMotion || !this.characters.size || document.hidden) return
    this.nextIdle = now + 4000 + Math.random() * 6000
    const views = [...this.characters.values()]
    const view = views[Math.floor(Math.random() * views.length)]!
    this.idle = { view, start: now }
  }

  private markOffset(position: Position) {
    return this.world?.cell(position).mark ? TILE_HEIGHT : 0
  }

  private onEvent(event: WorldEvent) {
    const duration = this.speed
    switch (event.type) {
      case 'move': {
        const view = this.characters.get(event.id)
        if (!view) return
        const from = new THREE.Vector3(event.from.x, PLATE_HEIGHT + event.from.y * BRICK_HEIGHT, event.from.z)
        const to = new THREE.Vector3(event.to.x, PLATE_HEIGHT + event.to.y * BRICK_HEIGHT, event.to.z)
        const fromMark = this.markOffset(event.from)
        const toMark = this.markOffset(event.to)
        const climb = from.y !== to.y
        this.enqueue({
          duration: climb ? duration * 1.3 : duration,
          update: (t) => {
            // Beim Steigen erst abspringen, dann vorwärts; sonst gleichmäßig laufen
            const forward = climb ? easeInOut(Math.min(1, Math.max(0, (t - 0.2) / 0.6))) : t
            view.root.position.lerpVectors(from, to, forward)
            view.root.position.y = from.y + (to.y - from.y) * forward + Math.sin(t * Math.PI) * (climb ? 0.3 : 0) + fromMark * (1 - forward) + toMark * forward
            this.pose(view, climb ? 'Climb' : 'Walk', t)
          },
          done: () => this.relax(view),
        })
        break
      }
      case 'turn': {
        const view = this.characters.get(event.id)
        if (!view) return
        const target = ROTATION[event.direction]
        let start = 0
        let delta = 0
        this.enqueue({
          duration: duration * 0.6,
          update: (t) => {
            if (t === 0 || !delta) {
              start = view.root.rotation.y
              delta = ((target - start + Math.PI * 3) % (Math.PI * 2)) - Math.PI
            }
            view.root.rotation.y = start + delta * easeInOut(t)
            this.pose(view, 'Turn', t)
          },
          done: () => this.relax(view),
        })
        break
      }
      case 'brick-placed':
      case 'brick-removed':
      case 'mark-set':
      case 'mark-removed': {
        // Mit Figur: Ablegen/Aufheben/Stampfen, die Welt ändert sich mitten in der Bewegung
        const by = event.by ? this.characters.get(event.by) : undefined
        if (!by) {
          this.enqueueWorldUpdate(duration * 0.4)
          break
        }
        const clip: ClipName = event.type === 'brick-placed' ? 'Place' : event.type === 'brick-removed' ? 'Pick' : 'Mark'
        let applied = false
        const apply = () => {
          if (applied) return
          applied = true
          this.rebuildBricks()
          this.rebuildMarks()
          this.updateCharacterHeights()
        }
        this.enqueue({
          duration: duration * 1.1,
          update: (t) => {
            this.pose(by, clip, t)
            if (t >= (clip === 'Pick' ? 0.5 : 0.4)) apply()
          },
          done: () => {
            this.relax(by)
            apply()
          },
        })
        break
      }
      case 'block-set':
        this.enqueueWorldUpdate(duration * 0.4)
        break
      case 'character-added':
        this.enqueue({ duration: 0, update: () => this.addCharacterView(event.character) })
        // Neue Figuren winken kurz
        if (duration > 0) this.enqueueClip(event.character.id, 'Wave', duration * 1.6)
        break
      case 'character-removed':
        this.enqueue({
          duration: 0,
          update: () => {
            const view = this.characters.get(event.id)
            if (view) this.scene.remove(view.root)
            if (view && this.idle?.view === view) this.idle = undefined
            this.characters.delete(event.id)
          },
        })
        break
      case 'reset':
        this.queue = []
        this.current = undefined
        this.rebuild()
        break
    }
  }

  /** Stapel/Marken neu aufbauen, sobald die Animation an der Reihe ist */
  private enqueueWorldUpdate(duration: number) {
    this.enqueue({
      duration,
      update: () => {},
      done: () => {
        this.rebuildBricks()
        this.rebuildMarks()
        this.updateCharacterHeights()
      },
    })
  }

  private updateCharacterHeights() {
    this.invalidate()
    for (const character of this.world!.getCharacters()) {
      const view = this.characters.get(character.id)
      if (view) view.root.position.y = this.surface(character) + this.markOffset(character)
    }
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}
