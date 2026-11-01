<script setup lang="ts">
// Farbauswahl für Ziegel und Marken
const props = defineProps<{ colors: readonly string[], kind: 'brick' | 'mark' }>()
const model = defineModel<string>({ required: true })
const { t } = useI18n()

const hex = (color: string) => `#${((props.kind === 'brick' ? BRICK_HEX : MARK_HEX) as Record<string, number>)[color]!.toString(16).padStart(6, '0')}`
</script>

<template>
  <div
    class="flex flex-wrap gap-2"
    role="radiogroup"
  >
    <button
      v-for="color in colors"
      :key="color"
      type="button"
      role="radio"
      :aria-checked="model === color"
      :aria-label="t(`world.colors.${color}`)"
      :title="t(`world.colors.${color}`)"
      class="size-8 rounded-md border-2 transition"
      :class="model === color ? 'border-(--ui-text) scale-110' : 'border-transparent'"
      :style="{ background: hex(color) }"
      @click="model = color"
    />
  </div>
</template>
