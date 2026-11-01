<script setup lang="ts">
import type { Position, World } from '@klonk/world'

// 3D-Ansicht einer Welt; meldet Klicks auf Felder (für den Editor). Nur im Browser verwenden (<ClientOnly>).
const props = withDefaults(defineProps<{ world: World, speed?: number, editable?: boolean }>(), { speed: 350, editable: false })
const emit = defineEmits<{ cellClick: [position: Position, event: MouseEvent], ready: [] }>()

const container = ref<HTMLDivElement>()
let renderer: WorldRenderer | undefined
const ready = ref(false)

onMounted(async () => {
  renderer = new WorldRenderer(container.value!)
  renderer.speed = props.speed
  await renderer.setWorld(props.world)
  ready.value = true
  emit('ready')
})

onBeforeUnmount(() => renderer?.dispose())

watch(() => props.world, world => renderer?.setWorld(world))
watch(() => props.speed, (speed) => {
  if (renderer) renderer.speed = speed
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
})
</script>

<template>
  <div
    ref="container"
    class="relative h-full w-full touch-none select-none overflow-hidden"
    :data-ready="ready"
    data-testid="world-view"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointermove="onPointerMove"
    @pointerleave="renderer?.setHover(null)"
    @contextmenu.prevent
  />
</template>
