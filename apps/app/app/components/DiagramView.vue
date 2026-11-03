<script setup lang="ts">
import type { DiagramTheme } from '@klonk/diagrams'
import { canvasMeasure, exportPng, exportSvg, themeColors, type DiagramRenderer } from '~/utils/diagrams'

/** Element des Diagramms, das angeklickt wurde (Daten aus `data-*` der SVG-Elemente) */
export type DiagramSelection = { line?: number, path?: string, className?: string, table?: string }

// Zeigt ein Diagramm (SVG) mit Zoom und Export; Klicks auf Elemente melden Zeile/Klasse/Tabelle
const props = defineProps<{
  render: DiagramRenderer | null
  /** Dateiname beim Export (ohne Endung) */
  name: string
}>()
const emit = defineEmits<{ select: [selection: DiagramSelection] }>()

const { t } = useI18n()
const colorMode = useColorMode()

// Farben hängen am Hell/Dunkel-Modus; erst im Browser lesbar
const theme = shallowRef<DiagramTheme | null>(null)
onMounted(() => {
  watch(() => colorMode.value, async () => {
    await nextTick()
    theme.value = themeColors()
  }, { immediate: true })
})

const diagram = computed(() => {
  if (!props.render || !theme.value) return null
  try {
    return props.render({ theme: theme.value, measure: canvasMeasure })
  }
  catch (error) {
    console.warn('Diagramm:', error)
    return null
  }
})

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2]
const zoom = ref(1)
const zoomBy = (step: number) => {
  const index = ZOOMS.findIndex(z => z >= zoom.value - 0.001)
  zoom.value = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (index < 0 ? 3 : index) + step))]!
}

function onClick(event: MouseEvent) {
  const target = (event.target as Element | null)?.closest('[data-line], [data-class], [data-table]') as SVGElement | null
  if (!target) return
  const data = target.dataset
  emit('select', {
    line: data.line ? Number(data.line) : undefined,
    path: target.closest('[data-path]')?.getAttribute('data-path') ?? undefined,
    className: target.closest('[data-class]')?.getAttribute('data-class') ?? undefined,
    table: data.table,
  })
}

const exportItems = computed(() => [[
  { label: t('diagrams.exportSvg'), icon: 'i-lucide-file-code', onSelect: () => props.render && exportSvg(props.render, props.name) },
  { label: t('diagrams.exportPng'), icon: 'i-lucide-image', onSelect: () => props.render && exportPng(props.render, props.name) },
]])
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col">
    <div
      v-if="diagram"
      class="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md bg-(--ui-bg)/90 p-0.5 shadow-sm ring ring-(--ui-border)"
    >
      <UButton
        icon="i-lucide-zoom-out"
        size="xs"
        variant="ghost"
        color="neutral"
        :aria-label="t('diagrams.zoomOut')"
        @click="zoomBy(-1)"
      />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        class="min-w-12 justify-center tabular-nums"
        :label="`${Math.round(zoom * 100)} %`"
        :aria-label="t('diagrams.zoomReset')"
        @click="zoom = 1"
      />
      <UButton
        icon="i-lucide-zoom-in"
        size="xs"
        variant="ghost"
        color="neutral"
        :aria-label="t('diagrams.zoomIn')"
        @click="zoomBy(1)"
      />
      <UDropdownMenu :items="exportItems">
        <UButton
          icon="i-lucide-download"
          size="xs"
          variant="ghost"
          color="neutral"
          :aria-label="t('diagrams.export')"
          data-testid="diagram-export"
        />
      </UDropdownMenu>
    </div>
    <div
      class="min-h-0 flex-1 overflow-auto p-3"
      data-testid="diagram"
    >
      <!-- SVG stammt aus @klonk/diagrams: alle Texte und Attribute dort maskiert (escapeXml) -->
      <!-- eslint-disable vue/no-v-html -->
      <div
        v-if="diagram"
        class="cursor-default [&_[data-line]]:cursor-pointer [&_[data-table]]:cursor-pointer [&>svg]:h-auto [&>svg]:w-full"
        :style="{ width: `${diagram.width * zoom}px` }"
        @click="onClick"
        v-html="diagram.svg"
      />
      <!-- eslint-enable vue/no-v-html -->
      <slot v-else />
    </div>
  </div>
</template>
