<script setup lang="ts">
import type { RobotDesign } from '@klonk/world'
import type { EditorTool } from '~/composables/useWorldEditor'

const { t } = useI18n()
useSeoMeta({ title: () => t('world.title') })

const editor = useWorldEditor()
const { world, mode, tool, brickColor, markColor, characterModel, selectedCharacter, status, characters, maxCharacters } = editor

const speed = ref(350)

// Welt im Projekt laden/speichern (wenn in der IDE ein Projekt geöffnet ist)
const proj = useProject()
const toast = useToast()
async function loadFromProject() {
  try {
    const data = await proj.readWorld()
    if (data && editor.loadData(data)) toast.add({ title: t('project.worldLoaded', { name: proj.worldPath.value }), color: 'success' })
  }
  catch {
    toast.add({ title: t('project.errors.invalidWorld'), color: 'error' })
  }
}
async function saveToProject() {
  const path = proj.worldPath.value ?? `${t('project.defaultName.world')}.klonkworld.json`
  await proj.writeWorld(path, editor.start.value.toJSON())
  proj.selectWorld(path)
  toast.add({ title: t('project.worldSaved', { name: path }), color: 'success' })
}
// Aus dem Explorer „Im Welt-Editor bearbeiten“ ⇒ gewählte Projektwelt gleich laden
const route = useRoute()
onMounted(async () => {
  if (route.query.load === undefined || !proj.worldPath.value) return
  await loadFromProject()
  await navigateTo({ query: {} }, { replace: true })
})
const view = useTemplateRef('view')

const tools = computed<{ value: EditorTool, icon: string, label: string }[]>(() => [
  { value: 'brick', icon: 'i-lucide-box', label: t('world.tools.brick') },
  { value: 'mark', icon: 'i-lucide-square-dashed', label: t('world.tools.mark') },
  { value: 'block', icon: 'i-lucide-brick-wall', label: t('world.tools.block') },
  { value: 'character', icon: 'i-lucide-person-standing', label: t('world.tools.character') },
  { value: 'erase', icon: 'i-lucide-eraser', label: t('world.tools.erase') },
])

// Aussehen neuer Figuren: Standardmodelle und (mit Lizenz) die Designs des Projekts
const { can } = useLicense()
const designs = shallowRef<Record<string, RobotDesign>>({})
watch([proj.project, proj.files], async () => {
  designs.value = proj.project.value && can('models') ? await proj.readDesigns() : {}
}, { immediate: true })
const characterItems = computed(() => [
  ...editor.CHARACTER_MODELS.map(m => ({ label: t(`world.characters.${m}`), value: m as string })),
  ...Object.keys(designs.value).map(name => ({ label: `${t('project.design')}: ${name}`, value: `design:${name}` })),
])
const characterLook = computed({
  get: () => (editor.characterDesign.value ? `design:${Object.keys(designs.value).find(k => designs.value[k] === editor.characterDesign.value) ?? ''}` : characterModel.value),
  set: (value: string) => {
    if (value.startsWith('design:')) editor.characterDesign.value = designs.value[value.slice(7)] ?? null
    else {
      editor.characterDesign.value = null
      characterModel.value = value as typeof characterModel.value
    }
  },
})
const selectedItems = computed(() => characters.value.map(c => ({ label: c.id, value: c.id })))

// Namen der Figuren (Eingabe wird beim Verlassen/Enter übernommen; ungültig ⇒ alter Name)
function rename(id: string, event: Event) {
  const input = event.target as HTMLInputElement
  if (!editor.renameCharacter(id, input.value)) input.value = id
}

// Neue Welt
const sizeOpen = ref(false)
const size = reactive({ width: 10, depth: 10, height: 6 })
function createWorld() {
  editor.newWorld(size.width, size.depth, size.height)
  sizeOpen.value = false
}

// Dateien
const fileInput = useTemplateRef('fileInput')
function download() {
  const blob = new Blob([editor.exportJson()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'welt.klonkworld.json'
  a.click()
  URL.revokeObjectURL(a.href)
}
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  // Robot-Karol-Welt (.kdw) ⇒ in eine Klonk-Welt umwandeln
  if (file && isKarolFile(file.name)) {
    try {
      const converted = convertKarolFile(file.name, new Uint8Array(await file.arrayBuffer()), 'klonk')
      editor.importJson(converted.content)
      if (converted.hints.length) toast.add({ title: t('karol.worldHints'), description: converted.hints.map(h => t(`karol.hints.${h.code}`, h.params)).join('\n'), color: 'warning' })
    }
    catch {
      toast.add({ title: t('karol.failed'), color: 'error' })
    }
  }
  else if (file) editor.importJson(await file.text())
  ;(event.target as HTMLInputElement).value = ''
}

// Tastatur: Pfeiltasten steuern die Figur im Probemodus
function onKey(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return
  const map: Record<string, Parameters<typeof editor.command>[0]> = {
    ArrowUp: 'step', ArrowLeft: 'turnLeft', ArrowRight: 'turnRight', h: 'placeBrick', a: 'pickBrick', m: 'setMark',
  }
  const name = map[event.key]
  if (!name) return
  event.preventDefault()
  editor.command(name)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="flex h-[calc(100dvh-var(--ui-header-height))] flex-col lg:flex-row">
    <!-- Werkzeuge -->
    <aside class="flex shrink-0 flex-col gap-4 overflow-y-auto border-(--ui-border) p-4 lg:w-72 lg:border-r">
      <div class="flex gap-2">
        <UButton
          :variant="mode === 'edit' ? 'solid' : 'outline'"
          icon="i-lucide-pencil-ruler"
          :label="t('world.modes.edit')"
          class="flex-1 justify-center"
          @click="editor.edit()"
        />
        <UButton
          :variant="mode === 'play' ? 'solid' : 'outline'"
          icon="i-lucide-gamepad-2"
          :label="t('world.modes.play')"
          class="flex-1 justify-center"
          data-testid="mode-play"
          @click="editor.play()"
        />
      </div>

      <template v-if="mode === 'edit'">
        <div>
          <p class="mb-2 text-sm font-semibold">
            {{ t('world.tool') }}
          </p>
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
                @click="tool = item.value"
              />
            </UTooltip>
          </div>
          <p class="mt-2 text-xs text-(--ui-text-muted)">
            {{ t(`world.toolHelp.${tool}`) }}
          </p>
        </div>

        <div v-if="tool === 'brick'">
          <p class="mb-2 text-sm font-semibold">
            {{ t('world.color') }}
          </p>
          <WorldColorPicker
            v-model="brickColor"
            :colors="editor.BRICK_COLORS"
            kind="brick"
          />
        </div>
        <div v-if="tool === 'mark'">
          <p class="mb-2 text-sm font-semibold">
            {{ t('world.color') }}
          </p>
          <WorldColorPicker
            v-model="markColor"
            :colors="editor.MARK_COLORS"
            kind="mark"
          />
        </div>
        <UFormField
          v-if="tool === 'character'"
          :label="t('world.character')"
          :help="maxCharacters === Infinity ? undefined : t('world.characterLimit', { max: maxCharacters })"
        >
          <USelect
            v-model="characterLook"
            :items="characterItems"
            class="w-full"
            data-testid="character-look"
          />
        </UFormField>

        <div
          v-if="characters.length"
          data-testid="character-names"
        >
          <p class="mb-1 text-sm font-semibold">
            {{ t('world.names') }}
          </p>
          <p class="mb-2 text-xs text-(--ui-text-muted)">
            {{ t('world.namesHelp') }}
          </p>
          <div class="space-y-1">
            <UInput
              v-for="c in characters"
              :key="c.id"
              :model-value="c.id"
              :icon="c.model === 'female' ? 'i-lucide-user-round' : c.model === 'diverse' ? 'i-lucide-user-round-cog' : 'i-lucide-user'"
              size="sm"
              class="w-full"
              :aria-label="t('world.nameOf', { model: t(`world.characters.${c.model}`) })"
              :data-testid="`character-name-${c.id}`"
              @change="rename(c.id, $event)"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </div>
        </div>

        <USeparator />

        <div class="grid grid-cols-2 gap-2">
          <UButton
            variant="outline"
            color="neutral"
            icon="i-lucide-file-plus"
            :label="t('world.new')"
            @click="sizeOpen = true"
          />
          <UButton
            variant="outline"
            color="neutral"
            icon="i-lucide-folder-open"
            :label="t('world.open')"
            @click="fileInput?.click()"
          />
          <UButton
            variant="outline"
            color="neutral"
            icon="i-lucide-download"
            :label="t('world.save')"
            class="col-span-2"
            @click="download"
          />
          <template v-if="proj.project.value">
            <UButton
              variant="outline"
              color="neutral"
              icon="i-lucide-folder-input"
              :label="t('project.loadWorld')"
              :disabled="!proj.worldPath.value"
              class="col-span-2"
              data-testid="world-load-project"
              @click="loadFromProject"
            />
            <UButton
              variant="outline"
              icon="i-lucide-folder-output"
              :label="t('project.saveWorld')"
              class="col-span-2"
              data-testid="world-save-project"
              @click="saveToProject"
            />
          </template>
          <input
            ref="fileInput"
            type="file"
            accept=".json,application/json,.kdw"
            class="hidden"
            data-testid="world-file"
            @change="upload"
          >
        </div>
      </template>

      <template v-else>
        <UFormField
          v-if="selectedItems.length > 1"
          :label="t('world.character')"
        >
          <USelect
            v-model="selectedCharacter"
            :items="selectedItems"
            class="w-full"
          />
        </UFormField>
        <div class="grid grid-cols-3 gap-2">
          <span />
          <UButton
            icon="i-lucide-arrow-up"
            :aria-label="t('world.commands.step')"
            class="justify-center"
            @click="editor.command('step')"
          />
          <span />
          <UButton
            icon="i-lucide-rotate-ccw"
            :aria-label="t('world.commands.turnLeft')"
            class="justify-center"
            @click="editor.command('turnLeft')"
          />
          <span />
          <UButton
            icon="i-lucide-rotate-cw"
            :aria-label="t('world.commands.turnRight')"
            class="justify-center"
            @click="editor.command('turnRight')"
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            variant="outline"
            icon="i-lucide-package-plus"
            :label="t('world.commands.placeBrick')"
            @click="editor.command('placeBrick')"
          />
          <UButton
            variant="outline"
            icon="i-lucide-package-minus"
            :label="t('world.commands.pickBrick')"
            @click="editor.command('pickBrick')"
          />
          <UButton
            variant="outline"
            icon="i-lucide-flag"
            :label="t('world.commands.setMark')"
            @click="editor.command('setMark')"
          />
          <UButton
            variant="outline"
            icon="i-lucide-flag-off"
            :label="t('world.commands.removeMark')"
            @click="editor.command('removeMark')"
          />
        </div>
        <WorldColorPicker
          v-model="brickColor"
          :colors="editor.BRICK_COLORS"
          kind="brick"
        />
        <p class="text-xs text-(--ui-text-muted)">
          {{ t('world.keyboardHelp') }}
        </p>
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-undo-2"
          :label="t('world.reset')"
          @click="editor.resetRun()"
        />
      </template>

      <USeparator />

      <UFormField :label="t('world.speed')">
        <USlider
          v-model="speed"
          :min="0"
          :max="1000"
          :step="50"
          inverted
        />
      </UFormField>
    </aside>

    <!-- 3D-Ansicht -->
    <main class="relative min-h-80 flex-1 bg-(--ui-bg-muted)">
      <ClientOnly>
        <KlonkWorld
          ref="view"
          :world="world"
          :speed="speed"
          :editable="mode === 'edit'"
          @cell-click="(cell, event) => editor.applyTool(cell, event.button === 2 || event.shiftKey)"
        />
      </ClientOnly>
      <div class="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
        <div
          v-if="status"
          class="pointer-events-auto rounded-md bg-(--ui-bg)/90 px-3 py-2 text-sm shadow"
          data-testid="world-status"
        >
          <span data-testid="status-position">{{ t('world.status.position', { x: status.x + 1, z: status.z + 1 }) }}</span>
          · <span data-testid="status-direction">{{ t(`world.directions.${status.direction}`) }}</span>
          · <span data-testid="status-front">{{ status.wall ? t('world.status.wall') : t('world.status.bricks', { count: status.bricksInFront }) }}</span>
          <template v-if="status.mark">
            · <span data-testid="status-mark">{{ t('world.status.onMark') }}</span>
          </template>
        </div>
        <UButton
          class="pointer-events-auto"
          color="neutral"
          variant="outline"
          icon="i-lucide-scan"
          :aria-label="t('world.resetCamera')"
          @click="view?.resetCamera()"
        />
      </div>
    </main>

    <UModal
      v-model:open="sizeOpen"
      :title="t('world.new')"
    >
      <template #body>
        <form
          id="new-world"
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
          form="new-world"
          :label="t('world.create')"
        />
      </template>
    </UModal>
  </div>
</template>
