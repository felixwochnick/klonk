<script setup lang="ts">
import { erModel, renderEr, renderRelationalSchema, type ErNotation, type SchemaTable } from '@klonk/diagrams'
import type { DiagramRenderer } from '~/utils/diagrams'
import type { DiagramSelection } from './DiagramView.vue'

// ER-Diagramm einer Datenbank (Chen 1:n bzw. (min,max), Krähenfuß) oder das Relationenschema
const props = defineProps<{ tables: SchemaTable[], name: string }>()
const emit = defineEmits<{ table: [name: string] }>()

const { t } = useI18n()

type Notation = ErNotation | 'schema'
const NOTATION_KEY = 'klonk:er-notation'
const notation = ref<Notation>('chen')
onMounted(() => {
  try {
    const saved = localStorage.getItem(NOTATION_KEY) as Notation | null
    if (saved && ['chen', 'minmax', 'crowsfoot', 'schema'].includes(saved)) notation.value = saved
  }
  catch {
    // z. B. privater Modus
  }
})
watch(notation, (value) => {
  try {
    localStorage.setItem(NOTATION_KEY, value)
  }
  catch {
    // egal
  }
})
const notationItems = computed(() => (['chen', 'minmax', 'crowsfoot', 'schema'] as const).map(n => ({ label: t(`diagrams.er.notations.${n}`), value: n })))

const model = computed(() => erModel(props.tables))
const render = computed<DiagramRenderer | null>(() => {
  const value = model.value
  if (!value.tables.some(table => table.kind === 'table')) return null
  const selected = notation.value
  return selected === 'schema' ? options => renderRelationalSchema(value, options) : options => renderEr(value, { ...options, notation: selected })
})

function onSelect(selection: DiagramSelection) {
  if (selection.table) emit('table', selection.table)
}
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col"
    data-testid="er-diagram"
  >
    <div class="flex items-center gap-2 border-b border-(--ui-border) px-3 py-1.5">
      <span class="text-xs text-(--ui-text-muted)">{{ t('diagrams.er.notation') }}</span>
      <USelect
        v-model="notation"
        :items="notationItems"
        size="xs"
        class="w-48"
        :aria-label="t('diagrams.er.notation')"
        data-testid="er-notation"
      />
    </div>
    <DiagramView
      :render="render"
      :name="`${name}-${t('diagrams.files.er')}`"
      @select="onSelect"
    >
      <p class="p-4 text-sm text-(--ui-text-muted)">
        {{ t('database.noTables') }}
      </p>
    </DiagramView>
  </div>
</template>
