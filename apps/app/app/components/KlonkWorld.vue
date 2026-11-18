<script setup lang="ts">
import type { Position, World } from '@klonk/world'
import type { WorldViewMode } from '~/composables/useWorldView'

// Ansicht einer Welt – 3D oder Draufsicht (2D), umschaltbar; meldet Klicks auf Felder (für den Editor).
// Nur im Browser verwenden (<ClientOnly>).
// `parallel`: gemeinsame Welt – Figuren mehrerer Personen bewegen sich gleichzeitig
// `view`: Darstellung fest vorgeben (ohne Umschalter), `toggle: false`: Umschalter platziert die Seite selbst (<WorldViewToggle>)
const props = withDefaults(defineProps<{
  world: World
  speed?: number
  editable?: boolean
  showNames?: boolean
  parallel?: boolean
  view?: WorldViewMode
  toggle?: boolean
}>(), { speed: 350, editable: false, showNames: true, parallel: false, view: undefined, toggle: true })
const emit = defineEmits<{ cellClick: [position: Position, event: MouseEvent], ready: [] }>()

const container = ref<HTMLDivElement>()
let renderer: WorldRenderer | WorldPlanRenderer | undefined
/** Tatsächlich gezeigte Darstellung (ohne WebGL immer 2D) */
const shown = ref<WorldViewMode>()
const ready = ref(false)

const colorMode = useColorMode()
const worldView = useWorldView()
const mode = computed<WorldViewMode>(() => (props.view && worldView.webgl.value ? props.view : worldView.mode.value))

async function mount() {
  renderer?.dispose()
  renderer = undefined
  ready.value = false
  let next: WorldRenderer | WorldPlanRenderer
  if (mode.value === '3d') {
    try {
      next = new WorldRenderer(container.value!)
    }
    catch {
      // Kein WebGL ⇒ Draufsicht, 3D im Umschalter gesperrt
      worldView.webgl.value = false
      next = new WorldPlanRenderer(container.value!)
    }
  }
  else {
    next = new WorldPlanRenderer(container.value!)
  }
  shown.value = next instanceof WorldPlanRenderer ? '2d' : '3d'
  next.speed = props.speed
  next.showNames = props.showNames
  next.parallel = props.parallel
  next.dark = colorMode.value === 'dark'
  renderer = next
  await next.setWorld(props.world)
  // Inzwischen umgeschaltet?
  if (renderer !== next) return
  ready.value = true
  emit('ready')
}

onMounted(() => {
  worldView.load()
  void mount()
})

onBeforeUnmount(() => renderer?.dispose())

watch(mode, (next) => {
  if (next !== shown.value) void mount()
})
watch(() => props.world, world => renderer?.setWorld(world))
// Namensschilder passend zum Farbschema neu zeichnen
watch(() => colorMode.value, (mode) => {
  if (!renderer) return
  renderer.dark = mode === 'dark'
  void renderer.setWorld(props.world)
})
watch(() => props.speed, (speed) => {
  if (renderer) renderer.speed = speed
})
watch(() => props.parallel, (parallel) => {
  if (renderer) renderer.parallel = parallel
})

// Klick vs. Kamera ziehen unterscheiden
let down: { x: number, y: number } | undefined
function onPointerDown(event: PointerEvent) {
  down = { x: event.clientX, y: event.clientY }
}
function onPointerUp(event: PointerEvent) {
  if (!props.editable || !renderer || !down) return
  const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5
  down = undefined
  if (moved) return
  const cell = renderer.pick(event)
  if (cell) emit('cellClick', cell, event)
}
function onPointerMove(event: PointerEvent) {
  if (props.editable) renderer?.setHover(renderer.pick(event))
}

defineExpose({
  resetCamera: () => renderer?.resetCamera(),
  snapshot: () => renderer?.snapshot(),
  /** Figuren jubeln lassen (alle oder eine) */
  cheer: (id?: string) => renderer?.cheer(id),
  /** Figuren vor diesem Feld zucken zurück (Fehler wie Wand/Quader) */
  bumpAt: (position: Position) => renderer?.bumpAt(position),
})
</script>

<template>
  <div class="relative h-full w-full">
    <div
      ref="container"
      class="absolute inset-0 touch-none select-none overflow-hidden"
      :data-ready="ready"
      :data-mode="shown"
      data-testid="world-view"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @pointermove="onPointerMove"
      @pointerleave="renderer?.setHover(null)"
      @contextmenu.prevent
    />
    <WorldViewToggle
      v-if="toggle && !view"
      class="absolute right-3 top-3"
    />
  </div>
</template>
