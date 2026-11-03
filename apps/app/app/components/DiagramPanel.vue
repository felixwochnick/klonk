<script setup lang="ts">
import { mergeClasses, renderClassDiagram, renderObjectDiagram, renderStructograms, type HeapSnapshot, type Outline, type UmlClass } from '@klonk/diagrams'
import { CLASS_LANGUAGES, LANGUAGE_EXTENSIONS, outlineOf, type DiagramRenderer } from '~/utils/diagrams'
import type { DiagramSelection } from './DiagramView.vue'

/** Figur der Welt (für Klonk-Objekte im Objektdiagramm) */
export type RobotInfo = { x: number, y: number, direction: string }

// Diagramme zum Programm: Struktogramm, Klassendiagramm (Datei oder Projekt) und Objektdiagramm (beim Anhalten)
const props = defineProps<{
  language: string
  /** Ausgeführter Quelltext (Blöcke: erzeugtes Klonk-Script) */
  source: string
  path?: string | null
  /** Programmdateien des Projekts (Klassendiagramm über alle Dateien, Importe) */
  files: Record<string, string>
  /** Laufende bzw. angehaltene Zeile */
  activeLine?: number | null
  heap?: HeapSnapshot | null
  paused?: boolean
  robot?: (name: string) => RobotInfo | null
}>()
const emit = defineEmits<{ reveal: [line: number], open: [path: string, line?: number] }>()

const { t } = useI18n()

type View = 'structogram' | 'classes' | 'objects'
const VIEW_KEY = 'klonk:diagram-view'
const view = ref<View>('structogram')
onMounted(() => {
  try {
    const saved = localStorage.getItem(VIEW_KEY) as View | null
    if (saved && ['structogram', 'classes', 'objects'].includes(saved)) view.value = saved
  }
  catch {
    // z. B. privater Modus
  }
})
watch(view, (value) => {
  try {
    localStorage.setItem(VIEW_KEY, value)
  }
  catch {
    // egal
  }
})
const hasClasses = computed(() => CLASS_LANGUAGES.includes(props.language))
const viewItems = computed(() => (['structogram', 'classes', 'objects'] as const).map(v => ({ label: t(`diagrams.views.${v}`), value: v })))

// Struktogramm: alle Unterprogramme oder eines
const routine = ref('all')

// Auswertung (verzögert beim Tippen); bei Fehlern bleibt der letzte gültige Stand stehen
const outline = shallowRef<Outline | null>(null)
const stale = ref(false)
const unavailable = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0
async function analyze() {
  const current = ++generation
  try {
    const result = await outlineOf(props.language, props.source, props.path, props.files)
    if (current !== generation) return
    unavailable.value = result === null && props.language === 'csharp'
    if (result) outline.value = result
    stale.value = false
  }
  catch {
    if (current === generation) stale.value = true
  }
}
watch(() => [props.language, props.source, props.path], () => {
  clearTimeout(timer)
  timer = setTimeout(analyze, outline.value ? 300 : 0)
}, { immediate: true })
watch(() => props.language, () => {
  outline.value = null
  routine.value = 'all'
})
onBeforeUnmount(() => clearTimeout(timer))

const routineItems = computed(() => [
  { label: t('diagrams.allRoutines'), value: 'all' },
  ...(outline.value?.routines ?? []).map(r => ({ label: r.kind === 'main' ? t('diagrams.main') : r.className && !r.signature.startsWith(r.className) ? `${r.className}.${r.name}` : r.name, value: r.id })),
])
watch(outline, (value) => {
  if (routine.value !== 'all' && !value?.routines.some(r => r.id === routine.value)) routine.value = 'all'
})
const shownRoutines = computed(() => (outline.value?.routines ?? []).filter(r => routine.value === 'all' || r.id === routine.value))

// Klassendiagramm: diese Datei oder alle Dateien der Sprache im Projekt
const scope = ref<'file' | 'project'>('file')
const inProject = computed(() => !!props.path)
const scopeItems = computed(() => (['file', 'project'] as const).map(s => ({ label: t(`diagrams.scope.${s}`), value: s })))
const projectClasses = shallowRef<UmlClass[]>([])
async function analyzeProject() {
  if (scope.value !== 'project' || !hasClasses.value) return
  const extension = LANGUAGE_EXTENSIONS[props.language]
  const lists: UmlClass[][] = [outline.value?.classes ?? []]
  for (const [path, text] of Object.entries(props.files)) {
    if (!extension?.test(path) || path === props.path) continue
    const result = await outlineOf(props.language, text, path, props.files).catch(() => null)
    if (result) lists.push(result.classes)
  }
  projectClasses.value = mergeClasses(lists).classes
}
watch([scope, outline, () => props.files], analyzeProject)
const classes = computed(() => (scope.value === 'project' && inProject.value ? projectClasses.value : outline.value?.classes ?? []))
const activeClass = computed(() => outline.value?.classes[0]?.name ?? null)

// Objektdiagramm: Klonk-Figuren bekommen Lage und Blickrichtung aus der Welt
const heap = computed<HeapSnapshot | null>(() => {
  const snapshot = props.heap
  if (!snapshot) return null
  return {
    ...snapshot,
    objects: snapshot.objects.map((object) => {
      const info = object.robot ? props.robot?.(object.robot) : null
      return info ? { ...object, fields: [...object.fields, ['x', { value: String(info.x) }], ['y', { value: String(info.y) }], ['direction', { value: JSON.stringify(info.direction) }]] } : object
    }),
  }
})

const structogramLabels = computed(() => ({ main: t('diagrams.main'), yes: t('diagrams.yes'), no: t('diagrams.no'), otherwise: t('diagrams.otherwise') }))
const umlLabels = { interface: 'interface', enumeration: 'enumeration', abstract: 'abstract', record: 'record', struct: 'struct' }

const render = computed<DiagramRenderer | null>(() => {
  if (view.value === 'structogram') {
    const routines = shownRoutines.value
    if (!routines.length) return null
    const labels = structogramLabels.value
    const line = props.activeLine ?? null
    return options => renderStructograms(routines, { ...options, labels, activeLine: line })
  }
  if (view.value === 'classes') {
    if (!hasClasses.value || !classes.value.length) return null
    const model = { classes: classes.value }
    const active = scope.value === 'project' ? activeClass.value : null
    return options => renderClassDiagram(model, { ...options, labels: umlLabels, activeClass: active })
  }
  const snapshot = heap.value
  if (!snapshot || (!snapshot.objects.length && !snapshot.variables.length)) return null
  const labels = { variables: t('diagrams.variables'), more: t('diagrams.more') }
  return options => renderObjectDiagram(snapshot, { ...options, labels })
})

const exportName = computed(() => `${(props.path ?? 'programm').split('/').pop()!.replace(/\.[^.]+$/, '')}-${t(`diagrams.files.${view.value}`)}`)

const emptyText = computed(() => {
  if (view.value === 'structogram') return t('diagrams.empty.structogram')
  if (view.value === 'classes') return hasClasses.value ? t('diagrams.empty.classes') : t('diagrams.empty.noClasses')
  return props.paused ? t('diagrams.empty.noObjects') : t('diagrams.empty.objects')
})

function onSelect(selection: DiagramSelection) {
  if (!selection.line) return
  if (selection.path && props.path && selection.path !== props.path) emit('open', selection.path, selection.line)
  else emit('reveal', selection.line)
}
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col"
    data-testid="diagram-panel"
  >
    <div class="flex flex-wrap items-center gap-2 border-b border-(--ui-border) px-2 py-1.5">
      <UTabs
        v-model="view"
        :items="viewItems"
        :content="false"
        size="xs"
        variant="link"
        data-testid="diagram-views"
      />
      <USelect
        v-if="view === 'structogram' && routineItems.length > 2"
        v-model="routine"
        :items="routineItems"
        size="xs"
        class="w-44"
        :aria-label="t('diagrams.routine')"
        data-testid="diagram-routine"
      />
      <USelect
        v-if="view === 'classes' && hasClasses && inProject"
        v-model="scope"
        :items="scopeItems"
        size="xs"
        class="w-40"
        :aria-label="t('diagrams.scopeLabel')"
        data-testid="diagram-scope"
      />
      <UBadge
        v-if="view === 'objects' && heap && !paused"
        :label="t('diagrams.lastPause')"
        size="sm"
        variant="subtle"
        color="neutral"
      />
      <UBadge
        v-if="view === 'objects' && heap?.truncated"
        :label="t('diagrams.truncated')"
        size="sm"
        variant="subtle"
        color="warning"
      />
      <UTooltip
        v-if="stale && view !== 'objects'"
        :text="t('diagrams.stale')"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="text-(--ui-warning)"
          data-testid="diagram-stale"
        />
      </UTooltip>
    </div>
    <DiagramView
      :render="render"
      :name="exportName"
      @select="onSelect"
    >
      <p
        class="p-4 text-sm text-(--ui-text-muted)"
        data-testid="diagram-empty"
      >
        {{ unavailable && view !== 'objects' ? t('diagrams.unavailable') : emptyText }}
      </p>
    </DiagramView>
  </div>
</template>
