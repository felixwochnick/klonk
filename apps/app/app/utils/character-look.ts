import * as THREE from 'three'
import { ACCESSORY_COLORS, SKIN_COLORS, type Accessory, type RobotDesign } from '@klonk/world'

/** Gelenke der Figuren (assets/blender/build_models.py) – Skins/Zubehör hängen an denselben Namen */
const JOINTS = ['Hips', 'Body', 'Head', 'ArmL', 'ArmR', 'HandL', 'HandR', 'LegL', 'LegR']

/** Kopfbedeckungen ersetzen die Frisur oben (inkl. Kopfnoppe), große Helme auch die langen Haare */
const ACCESSORY_HIDES: Partial<Record<Accessory, string[]>> = {
  cap: ['HairTop'],
  hat: ['HairTop'],
  helmet: ['HairTop'],
  beanie: ['HairTop'],
  chefHat: ['HairTop'],
  cowboyHat: ['HairTop'],
  wizardHat: ['HairTop'],
  pirateHat: ['HairTop'],
  spaceHelmet: ['HairTop', 'HairBack'],
  knightHelmet: ['HairTop', 'HairBack'],
}

/** Braucht das Design Teile aus `outfits.glb` (Skin oder Zubehör)? */
export function needsOutfits(design: RobotDesign) {
  return (design.skin ?? 'none') !== 'none' || (design.accessory ?? 'none') !== 'none'
}

/**
 * Aussehen der Figuren: Farben eines Designs auf ein Standardmodell übertragen (Materialien
 * `<modell>-skin|shirt|pants|hair`, `eye`), Skin und Zubehör aus `outfits` an die Gelenke hängen
 * (Empties `skin__<skin>__<Gelenk>` / `acc__<zubehör>__<Gelenk>`) und deren Hauptfarbe setzen.
 * Ohne `outfits` (noch nicht geladen) werden nur die Farben übernommen.
 */
export function applyDesign(model: THREE.Object3D, design: RobotDesign, outfits?: THREE.Object3D | null) {
  const accessory = design.accessory ?? 'none'
  const skin = design.skin ?? 'none'
  if (outfits) {
    if (skin !== 'none') attach(model, outfits, `skin__${skin}__`)
    if (accessory !== 'none') attach(model, outfits, `acc__${accessory}__`)
    const hides = ACCESSORY_HIDES[accessory] ?? []
    model.traverse((o) => {
      if (hides.some(prefix => o.name.startsWith(prefix))) o.visible = false
    })
  }
  const colorFor = (name: string) => {
    if (name.endsWith('-skin')) return design.colors.skin
    if (name.endsWith('-shirt')) return design.colors.shirt
    if (name.endsWith('-pants')) return design.colors.pants
    if (name.endsWith('-hair')) return design.colors.hair
    if (name === 'eye') return design.colors.eyes
    if (name.startsWith('outfit-main') && skin !== 'none') return design.colors.outfit ?? SKIN_COLORS[skin]
    if (name.startsWith('acc-main') && accessory !== 'none') return design.colors.accessory ?? ACCESSORY_COLORS[accessory]
    return null
  }
  // Materialien werden zwischen Klonen geteilt ⇒ vor dem Umfärben kopieren
  const copies = new Map<THREE.Material, THREE.Material>()
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const recolor = (material: THREE.Material) => {
      if (copies.has(material)) return copies.get(material)!
      const color = colorFor(material.name)
      if (!color) return material
      const copy = material.clone() as THREE.MeshStandardMaterial
      copy.color = new THREE.Color(color)
      copies.set(material, copy)
      copies.set(copy, copy)
      return copy
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolor) : recolor(mesh.material)
  })
}

/** Teile unter `prefix<Gelenk>` an das gleichnamige Gelenk der Figur hängen (gleiche Ruhelage ⇒ Transformation bleibt) */
function attach(model: THREE.Object3D, outfits: THREE.Object3D, prefix: string) {
  for (const joint of JOINTS) {
    const source = outfits.getObjectByName(prefix + joint)
    const target = model.getObjectByName(joint)
    if (!source || !target) continue
    for (const part of source.children) {
      if (!part.name.endsWith('Mesh')) continue
      const copy = part.clone(true)
      copy.traverse((o) => {
        o.castShadow = true
      })
      target.add(copy)
    }
  }
}

/** Namensschild über einer Figur (zeigt immer zur Kamera) */
export function nameLabel(name: string, dark: boolean) {
  const scale = 4
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  const font = `600 ${16 * scale}px Nunito, sans-serif`
  context.font = font
  const width = Math.ceil(context.measureText(name).width) + 20 * scale
  const height = 28 * scale
  canvas.width = width
  canvas.height = height
  context.font = font
  context.fillStyle = dark ? 'rgba(24,24,27,0.85)' : 'rgba(255,255,255,0.9)'
  const r = height / 2
  context.beginPath()
  context.roundRect(0, 0, width, height, r)
  context.fill()
  context.fillStyle = dark ? '#f4f4f5' : '#18181b'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(name, width / 2, height / 2 + scale)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
  sprite.renderOrder = 10
  const worldHeight = 0.22
  sprite.scale.set(worldHeight * width / height, worldHeight, 1)
  sprite.name = 'name-label'
  return sprite
}
