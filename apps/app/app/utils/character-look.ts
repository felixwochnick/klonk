import * as THREE from 'three'
import type { RobotDesign } from '@klonk/world'

/**
 * Aussehen der Figuren: Farben eines Designs auf ein Standardmodell übertragen (Materialien aus
 * assets/blender/build_models.py: `<modell>-skin|shirt|pants|hair`, `eye`) und Zubehör auf den Kopf setzen.
 */
export function applyDesign(model: THREE.Object3D, design: RobotDesign) {
  const colorFor = (name: string) => {
    if (name.endsWith('-skin')) return design.colors.skin
    if (name.endsWith('-shirt')) return design.colors.shirt
    if (name.endsWith('-pants')) return design.colors.pants
    if (name.endsWith('-hair')) return design.colors.hair
    if (name === 'eye') return design.colors.eyes
    return null
  }
  // Materialien werden zwischen Klonen geteilt ⇒ vor dem Umfärben kopieren
  const copies = new Map<THREE.Material, THREE.Material>()
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const recolor = (material: THREE.Material) => {
      const color = colorFor(material.name)
      if (!color) return material
      if (!copies.has(material)) {
        const copy = material.clone() as THREE.MeshStandardMaterial
        copy.color = new THREE.Color(color)
        copies.set(material, copy)
      }
      return copies.get(material)!
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolor) : recolor(mesh.material)
  })
  const accessory = buildAccessory(design)
  if (!accessory) return
  // Auf den Kopf: Oberkante des Kopfes (inkl. Haare) im Modellraum
  model.updateMatrixWorld(true)
  const head = model.getObjectByName('Head')
  const box = new THREE.Box3()
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o.name.startsWith('Head') || o.name.startsWith('Hair'))) box.expandByObject(o)
  })
  if (box.isEmpty() && head) box.setFromObject(head)
  const inverse = new THREE.Matrix4().copy(model.matrixWorld).invert()
  const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2).applyMatrix4(inverse)
  const width = (box.max.x - box.min.x) / (model.scale.x || 1)
  accessory.scale.setScalar(Math.max(width, 0.2) / 0.4)
  accessory.position.copy(top)
  model.add(accessory)
}

function buildAccessory(design: RobotDesign): THREE.Object3D | null {
  const kind = design.accessory ?? 'none'
  if (kind === 'none') return null
  const material = new THREE.MeshStandardMaterial({ color: design.colors.accessory ?? (kind === 'crown' ? '#f2cd37' : '#3a3a3a'), roughness: kind === 'crown' ? 0.25 : 0.5, metalness: kind === 'crown' || kind === 'helmet' ? 0.4 : 0 })
  const group = new THREE.Group()
  const add = (geometry: THREE.BufferGeometry, y: number, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(0, y, z)
    mesh.castShadow = true
    group.add(mesh)
    return mesh
  }
  // Maße für eine Kopfbreite von 0,4 (wird passend skaliert)
  switch (kind) {
    case 'cap':
      add(new THREE.CylinderGeometry(0.2, 0.21, 0.1, 24), 0.0)
      add(new THREE.BoxGeometry(0.3, 0.02, 0.18), -0.04, -0.17)
      break
    case 'hat':
      add(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 32), -0.02)
      add(new THREE.CylinderGeometry(0.18, 0.19, 0.24, 32), 0.1)
      break
    case 'helmet':
      add(new THREE.SphereGeometry(0.24, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), -0.08)
      break
    case 'crown': {
      add(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 24, 1, true), 0.02)
      for (let i = 0; i < 6; i++) {
        const spike = add(new THREE.ConeGeometry(0.04, 0.1, 8), 0.1)
        spike.position.x = Math.cos(i / 6 * Math.PI * 2) * 0.17
        spike.position.z = Math.sin(i / 6 * Math.PI * 2) * 0.17
      }
      material.side = THREE.DoubleSide
      break
    }
  }
  return group
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
