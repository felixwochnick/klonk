<script setup lang="ts">
// Ziehbarer Trenner zwischen zwei Bereichen (wie in Code-Editoren). Meldet nur die Verschiebung in Pixeln;
// Grenzen und Speichern übernimmt der Elternteil. Pfeiltasten verschieben in 16-px-Schritten.
const props = defineProps<{
  /** `vertical`: senkrechter Balken, ändert Breiten; `horizontal`: waagrechter Balken, ändert Höhen */
  orientation: 'vertical' | 'horizontal'
  label: string
}>()
const emit = defineEmits<{ move: [delta: number], end: [] }>()

const dragging = ref(false)
let last = 0

function onPointerDown(event: PointerEvent) {
  dragging.value = true
  last = props.orientation === 'vertical' ? event.clientX : event.clientY
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
}
function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  const current = props.orientation === 'vertical' ? event.clientX : event.clientY
  if (current !== last) emit('move', current - last)
  last = current
}
function onPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  emit('end')
}
function onKey(event: KeyboardEvent) {
  const keys = props.orientation === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
  const index = keys.indexOf(event.key)
  if (index < 0) return
  event.preventDefault()
  emit('move', index === 0 ? -16 : 16)
  emit('end')
}
</script>

<template>
  <div
    role="separator"
    tabindex="0"
    :aria-orientation="orientation"
    :aria-label="label"
    class="group relative z-10 hidden shrink-0 touch-none select-none outline-none lg:block"
    :class="orientation === 'vertical' ? '-mx-1 w-2 cursor-col-resize' : '-my-1 h-2 cursor-row-resize'"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @keydown="onKey"
  >
    <div
      class="absolute bg-(--ui-border) transition-colors group-hover:bg-(--ui-primary) group-focus-visible:bg-(--ui-primary)"
      :class="[
        orientation === 'vertical' ? 'inset-y-0 left-1/2 w-px -translate-x-1/2 group-hover:w-1' : 'inset-x-0 top-1/2 h-px -translate-y-1/2 group-hover:h-1',
        dragging ? (orientation === 'vertical' ? 'w-1 bg-(--ui-primary)' : 'h-1 bg-(--ui-primary)') : '',
      ]"
    />
  </div>
</template>
