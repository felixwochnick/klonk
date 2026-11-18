<script setup lang="ts">
import { parseWorld, type WorldData } from '@klonk/world'
import type { EditorTool } from '~/composables/useWorldEditor'

// Startwelt einer Aufgabe bearbeiten (eigene Lernmodule): Werkzeuge wie im Welt-Editor, Welt aus Datei (auch Robot Karol)
// oder aus dem geöffneten Projekt, neue Größe. Jede Änderung geht sofort an `v-model`.
const props = defineProps<{ readOnly?: boolean }>()
const world = defineModel<WorldData>({ required: true })

const { t } = useI18n()
const toast = useToast()

// Zuletzt gemeldeter Stand – kommt er über v-model zurück, bleibt der Editor, wie er ist
let emitted = ''
const editor = useWorldEditor({
  persist: false,
  onChange: (w) => {
    const data = w.toJSON()
    emitted = JSON.stringify(data)
    world.value = data
  },
})
watch(world, (data) => {
  if (JSON.stringify(data) !== emitted) editor.show(data)
}, { immediate: true })
const { tool, brickColor, markColor, characterModel, characters } = editor

const tools = computed<{ value: EditorTool, icon: string, label: string }[]>(() => [
  { value: 'brick', icon: 'i-lucide-box', label: t('world.tools.brick') },
  { value: 'mark', icon: 'i-lucide-square-dashed', label: t('world.tools.mark') },
  { value: 'block', icon: 'i-lucide-brick-wall', label: t('world.tools.block') },
  { value: 'character', icon: 'i-lucide-person-standing', label: t('world.tools.character') },
  { value: 'erase', icon: 'i-lucide-eraser', label: t('world.tools.erase') },
])
const modelItems = computed(() => editor.CHARACTER_MODELS.map(m => ({ label: t(`world.characters.${m}`), value: m })))

function rename(id: string, event: Event) {
  const input = event.target as HTMLInputElement
  if (!editor.renameCharacter(id, input.value)) input.value = id
}

// Neue Größe: leere Welt mit einer Figur
const sizeOpen = ref(false)
const size = reactive({ width: 6, depth: 6, height: 6 })
watch(sizeOpen, (open) => {
  if (open) Object.assign(size, world.value.size)
})
function createWorld() {
  editor.newWorld(size.width, size.depth, size.height)
  sizeOpen.value = false
}

// Welt aus Datei (.klonkworld.json, Robot-Karol-Welt .kdw) oder aus dem geöffneten Projekt
const fileInput = useTemplateRef('fileInput')
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  try {
    const text = isKarolFile(file.name)
      ? convertKarolFile(file.name, new Uint8Array(await file.arrayBuffer()), 'klonk').content
      : await file.text()
    editor.show(parseWorld(JSON.parse(text)))
  }
  catch {
    toast.add({ title: t('project.errors.invalidWorld'), color: 'error' })
  }
}
const proj = useProject()
async function fromProject() {
  try {
    const data = await proj.readWorld()
    if (data) editor.show(data)
  }
  catch {
    toast.add({ title: t('project.errors.invalidWorld'), color: 'error' })
  }
}
const view = useTemplateRef('view')
// Kamera zurücksetzen gibt es nur in 3D
const worldView = useWorldView()
</script>

<template>
  <div
    class="grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)]"
    data-testid="custom-world-editor"
  >
    <div
      v-if="!props.readOnly"
      class="flex flex-col gap-3"
    >
      <div class="grid grid-cols-5 gap-1">
        <UTooltip
          v-for="item in tools"
          :key="item.value"
          :text="item.label"
        >
          <UButton
            :icon="item.icon"
            :variant="tool === item.value ? 'solid' : 'ghost'"
            color="neutral"
            :aria-label="item.label"
            :aria-pressed="tool === item.value"
            class="justify-center"
            :data-testid="`custom-world-tool-${item.value}`"
            @click="tool = item.value"
          />
        </UTooltip>
      </div>
      <p class="text-xs text-(--ui-text-muted)">
        {{ t(`world.toolHelp.${tool}`) }}
      </p>
      <WorldColorPicker
        v-if="tool === 'brick'"
        v-model="brickColor"
        :colors="editor.BRICK_COLORS"
        kind="brick"
      />
      <WorldColorPicker
        v-if="tool === 'mark'"
        v-model="markColor"
        :colors="editor.MARK_COLORS"
        kind="mark"
      />
      <USelect
        v-if="tool === 'character'"
        v-model="characterModel"
        :items="modelItems"
        size="sm"
        :aria-label="t('world.character')"
      />
      <div
        v-if="characters.length"
        class="space-y-1"
      >
        <p class="text-xs font-semibold">
          {{ t('world.names') }}
        </p>
        <UInput
          v-for="c in characters"
          :key="c.id"
          :model-value="c.id"
          size="sm"
          class="w-full"
          :aria-label="t('world.nameOf', { model: t(`world.characters.${c.model}`) })"
          @change="rename(c.id, $event)"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
      </div>
      <div class="grid grid-cols-2 gap-1">
        <UButton
          size="sm"
          variant="outline"
          color="neutral"
          icon="i-lucide-scaling"
          :label="t('teaching.custom.worldSize')"
          @click="sizeOpen = true"
        />
        <UButton
          size="sm"
          variant="outline"
          color="neutral"
          icon="i-lucide-folder-open"
          :label="t('world.open')"
          @click="fileInput?.click()"
        />
        <UButton
          v-if="proj.project.value && proj.worldPath.value"
          size="sm"
          variant="outline"
          color="neutral"
          icon="i-lucide-folder-input"
          :label="t('teaching.custom.worldFromProject')"
          class="col-span-2"
          @click="fromProject"
        />
      </div>
      <input
        ref="fileInput"
        type="file"
        accept=".json,application/json,.kdw"
        class="hidden"
        data-testid="custom-world-file"
        @change="upload"
      >
    </div>

    <div class="relative h-80 overflow-hidden rounded-md border border-(--ui-border) bg-(--ui-bg-muted) lg:h-96">
      <ClientOnly>
        <KlonkWorld
          ref="view"
          :world="editor.world.value"
          :editable="!props.readOnly"
          @cell-click="(cell, event) => editor.applyTool(cell, event.button === 2 || event.shiftKey)"
        />
      </ClientOnly>
      <UButton
        v-if="worldView.mode.value === '3d'"
        class="absolute right-2 bottom-2"
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-scan"
        :aria-label="t('world.resetCamera')"
        @click="view?.resetCamera()"
      />
    </div>

    <UModal
      v-model:open="sizeOpen"
      :title="t('teaching.custom.worldSize')"
      :description="t('teaching.custom.worldSizeHint')"
    >
      <template #body>
        <form
          id="custom-world-size"
          class="grid grid-cols-3 gap-3"
          @submit.prevent="createWorld"
        >
          <UFormField :label="t('world.size.width')">
            <UInputNumber
              v-model="size.width"
              :min="1"
              :max="64"
            />
          </UFormField>
          <UFormField :label="t('world.size.depth')">
            <UInputNumber
              v-model="size.depth"
              :min="1"
              :max="64"
            />
          </UFormField>
          <UFormField :label="t('world.size.height')">
            <UInputNumber
              v-model="size.height"
              :min="1"
              :max="32"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="custom-world-size"
          :label="t('world.create')"
        />
      </template>
    </UModal>
  </div>
</template>
