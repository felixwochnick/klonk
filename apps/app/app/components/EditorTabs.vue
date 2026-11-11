<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { fileKind } from '~/utils/project-fs'

// Offene Dateien der IDE als Tabs (wie in VS Code): Klick wählt, × bzw. Mittelklick schließt, Ziehen sortiert um
const props = defineProps<{ tabs: string[], active: string | null }>()
const emit = defineEmits<{
  select: [path: string]
  close: [path: string]
  closeOthers: [path: string]
  closeRight: [path: string]
  closeAll: []
  move: [path: string, before: string | null]
}>()
const { t } = useI18n()

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
/** Gleicher Dateiname in mehreren Tabs ⇒ Ordner dazuschreiben */
const items = computed(() => props.tabs.map((path) => {
  const name = baseName(path)
  const twins = props.tabs.filter(p => baseName(p) === name).length > 1
  return { path, name, folder: twins && path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', kind: fileKind(path) }
}))

function menu(path: string): DropdownMenuItem[][] {
  const index = props.tabs.indexOf(path)
  return [[
    { label: t('editor.tabsMenu.close'), icon: 'i-lucide-x', onSelect: () => emit('close', path) },
    { label: t('editor.tabsMenu.closeOthers'), disabled: props.tabs.length < 2, onSelect: () => emit('closeOthers', path) },
    { label: t('editor.tabsMenu.closeRight'), disabled: index === props.tabs.length - 1, onSelect: () => emit('closeRight', path) },
    { label: t('editor.tabsMenu.closeAll'), onSelect: () => emit('closeAll') },
  ]]
}

// Aktiven Tab sichtbar halten
const strip = ref<HTMLElement>()
watch(() => props.active, async (path) => {
  await nextTick()
  strip.value?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path ?? '')}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
})

// Umsortieren per Ziehen
const DRAG_TYPE = 'application/x-klonk-tab'
const dragOver = ref<string | null>(null)
function onDragStart(event: DragEvent, path: string) {
  event.dataTransfer?.setData(DRAG_TYPE, path)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function onDragOver(event: DragEvent, path: string | null) {
  if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return
  event.preventDefault()
  dragOver.value = path ?? ''
}
function onDrop(event: DragEvent, before: string | null) {
  const path = event.dataTransfer?.getData(DRAG_TYPE)
  dragOver.value = null
  if (!path || path === before) return
  event.preventDefault()
  emit('move', path, before)
}
</script>

<template>
  <div
    ref="strip"
    class="flex shrink-0 overflow-x-auto border-b border-(--ui-border) bg-(--ui-bg-muted) [scrollbar-width:thin]"
    role="tablist"
    data-testid="editor-tabs"
    @dragover="onDragOver($event, null)"
    @dragleave="dragOver = null"
    @drop="onDrop($event, null)"
  >
    <UContextMenu
      v-for="item in items"
      :key="item.path"
      :items="menu(item.path)"
    >
      <div
        role="tab"
        :aria-selected="item.path === active"
        :title="item.path"
        :data-path="item.path"
        :data-testid="`editor-tab-${item.path}`"
        draggable="true"
        class="group relative flex max-w-56 shrink-0 cursor-pointer items-center gap-1.5 border-r border-(--ui-border) py-1.5 ps-3 pe-1 text-sm select-none"
        :class="[
          item.path === active ? 'bg-(--ui-bg) text-(--ui-text-highlighted)' : 'text-(--ui-text-muted) hover:bg-(--ui-bg-elevated)/60',
          dragOver === item.path ? 'ring-1 ring-inset ring-(--ui-primary)' : '',
        ]"
        @click="emit('select', item.path)"
        @auxclick.prevent="$event.button === 1 && emit('close', item.path)"
        @dragstart="onDragStart($event, item.path)"
        @dragover.stop="onDragOver($event, item.path)"
        @drop.stop="onDrop($event, item.path)"
      >
        <span
          v-if="item.path === active"
          class="absolute inset-x-0 top-0 h-0.5 bg-(--ui-primary)"
        />
        <FileIcon :kind="item.kind" />
        <span class="truncate">{{ item.name }}</span>
        <span
          v-if="item.folder"
          class="truncate text-xs text-(--ui-text-dimmed)"
        >{{ item.folder }}</span>
        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          icon="i-lucide-x"
          class="shrink-0 p-0.5"
          :class="item.path === active ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'"
          :aria-label="t('editor.tabsMenu.closeFile', { name: item.name })"
          :data-testid="`editor-tab-close-${item.path}`"
          @click.stop="emit('close', item.path)"
        />
      </div>
    </UContextMenu>
  </div>
</template>
