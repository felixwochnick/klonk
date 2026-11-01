<script setup lang="ts">
import type { EditorTool } from '~/composables/useWorldEditor'

const { t } = useI18n()
useSeoMeta({ title: () => t('world.title') })

const editor = useWorldEditor()
const { world, mode, tool, brickColor, markColor, characterModel, selectedCharacter, status, characters, maxCharacters } = editor

const speed = ref(350)
const view = useTemplateRef('view')

const tools = computed<{ value: EditorTool, icon: string, label: string }[]>(() => [
  { value: 'brick', icon: 'i-lucide-box', label: t('world.tools.brick') },
  { value: 'mark', icon: 'i-lucide-square-dashed', label: t('world.tools.mark') },
  { value: 'block', icon: 'i-lucide-brick-wall', label: t('world.tools.block') },
  { value: 'character', icon: 'i-lucide-person-standing', label: t('world.tools.character') },
  { value: 'erase', icon: 'i-lucide-eraser', label: t('world.tools.erase') },
])

const characterItems = computed(() => editor.CHARACTER_MODELS.map(m => ({ label: t(`world.characters.${m}`), value: m })))
const selectedItems = computed(() => characters.value.map(c => ({ label: `${t(`world.characters.${c.model}`)} (${c.id})`, value: c.id })))

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
  if (file) editor.importJson(await file.text())
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
            v-model="characterModel"
            :items="characterItems"
            class="w-full"
          />
        </UFormField>

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
          <input
            ref="fileInput"
            type="file"
            accept=".json,application/json"
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
