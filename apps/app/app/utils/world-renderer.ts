import type { BrickColor, CharacterData, CharacterModel, Direction, MarkColor, Position, World, WorldEvent } from '@klonk/world'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/** Maße passend zu den Blender-Modellen (assets/blender/build_models.py) */
export const BRICK_HEIGHT = 0.6
export const PLATE_HEIGHT = 0.2
/** Noppenhöhe – Marken (Fliesen) liegen auf den Noppen */
export const STUD_HEIGHT = 0.1
const TILE_HEIGHT = 0.07

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

type Models = { brick: THREE.BufferGeometry, plate: THREE.BufferGeometry, tile: THREE.BufferGeometry, characters: Record<CharacterModel, THREE.Object3D> }

type CharacterView = {
  root: THREE.Object3D
  limbs: { armL?: THREE.Object3D, armR?: THREE.Object3D, legL?: THREE.Object3D, legR?: THREE.Object3D }
}

type Animation = { duration: number, update: (t: number) => void, done?: () => void }

let modelsPromise: Promise<Models> | undefined

/** Modelle einmalig laden und zwischen Ansichten teilen */
function loadModels(): Promise<Models> {
  modelsPromise ??= (async () => {
    const loader = new GLTFLoader()
    const load = (name: string) => loader.loadAsync(`/models/${name}.glb`).then(g => g.scene)
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
      character.traverse((o) => {
        o.castShadow = true
      })
    }
    return { brick: mesh(brick!), plate: mesh(plate!), tile: mesh(tile!), characters: { male: male!, female: female!, diverse: diverse! } }
  })()
  return modelsPromise
}

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
  private resizeObserver: ResizeObserver
  private raycaster = new THREE.Raycaster()

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
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
    const distance = Math.max(width, depth) * 1.2 + 4
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
    this.hover.visible = !!position && !!this.world
    if (!position || !this.world) return
    this.hover.position.set(position.x, this.surface(position) + 0.03, position.z)
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
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    this.tick(performance.now())
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  private tick(now: number) {
    if (!this.current) {
      const next = this.queue.shift()
      if (!next) return
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
    for (const character of world.getCharacters()) this.addCharacterView(character)
  }

  private rebuildBricks() {
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
        this.marks.setMatrixAt(count, m.makeTranslation(x, this.surface({ x, z }) + STUD_HEIGHT, z))
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
    const root = this.models!.characters[character.model].clone(true)
    const view: CharacterView = {
      root,
      limbs: {
        armL: root.getObjectByName('ArmL'),
        armR: root.getObjectByName('ArmR'),
        legL: root.getObjectByName('LegL'),
        legR: root.getObjectByName('LegR'),
      },
    }
    // Markierungen liegen obenauf – Figuren stehen auf der Oberkante darunter
    root.position.set(character.x, this.surface(character) + this.markOffset(character), character.z)
    root.rotation.y = ROTATION[character.direction]
    root.name = `character:${character.id}`
    this.scene.add(root)
    this.characters.set(character.id, view)
  }

  private markOffset(position: Position) {
    return this.world?.cell(position).mark ? STUD_HEIGHT + TILE_HEIGHT : 0
  }

  private onEvent(event: WorldEvent) {
    const duration = this.speed
    switch (event.type) {
      case 'move': {
        const view = this.characters.get(event.id)
        if (!view) return
        const from = new THREE.Vector3(event.from.x, PLATE_HEIGHT + event.from.y * BRICK_HEIGHT, event.from.z)
        const to = new THREE.Vector3(event.to.x, PLATE_HEIGHT + event.to.y * BRICK_HEIGHT, event.to.z)
        const toMark = this.markOffset(event.to)
        this.enqueue({
          duration,
          update: (t) => {
            view.root.position.lerpVectors(from, to, t)
            // Kleiner Hüpfer beim Steigen und Schritt-Animation
            view.root.position.y += Math.sin(t * Math.PI) * (from.y !== to.y ? 0.35 : 0.06) + toMark * t
            const swing = Math.sin(t * Math.PI * 2) * 0.6
            if (view.limbs.armL) view.limbs.armL.rotation.x = swing
            if (view.limbs.armR) view.limbs.armR.rotation.x = -swing
            if (view.limbs.legL) view.limbs.legL.rotation.x = -swing
            if (view.limbs.legR) view.limbs.legR.rotation.x = swing
          },
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
          },
        })
        break
      }
      case 'brick-placed':
      case 'brick-removed':
      case 'block-set':
      case 'mark-set':
      case 'mark-removed': {
        // Stapel/Marken neu aufbauen, sobald die Animation an der Reihe ist
        this.enqueue({
          duration: duration * 0.4,
          update: () => {},
          done: () => {
            this.rebuildBricks()
            this.rebuildMarks()
            this.updateCharacterHeights()
          },
        })
        break
      }
      case 'character-added':
        this.enqueue({ duration: 0, update: () => this.addCharacterView(event.character) })
        break
      case 'character-removed':
        this.enqueue({
          duration: 0,
          update: () => {
            const view = this.characters.get(event.id)
            if (view) this.scene.remove(view.root)
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

  private updateCharacterHeights() {
    for (const character of this.world!.getCharacters()) {
      const view = this.characters.get(character.id)
      if (view) view.root.position.y = this.surface(character) + this.markOffset(character)
    }
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}
