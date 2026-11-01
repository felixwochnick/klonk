<script setup lang="ts">
import type { GeneratedProgram } from '~/utils/blocks/generator'
import { World } from '@klonk/world'
import { ProgramRunner, type RunLanguage, type RunnerSnapshot } from '@klonk/runtime'
import RunnerWorker from '@klonk/runtime/worker?worker'

const { t, te } = useI18n()
useSeoMeta({ title: () => t('editor.title') })

const { language, source, breakpoints, translateTo } = useProgram()
const isBlocks = computed(() => language.value === 'blocks')
/** Sprache, die tatsächlich läuft (Blöcke werden zu Klonk-Script) */
const runLanguage = computed<RunLanguage>(() => (language.value === 'blocks' ? 'klonk' : language.value))

// Blöcke: erzeugtes Klonk-Script, Zuordnung Zeile ⇒ Block und Haltepunkte (Block-IDs)
const blocksProgram = shallowRef<GeneratedProgram>({ code: '', lineToBlock: {} })
const blockBreakpoints = ref<string[]>([])
const showCode = ref(false)
function onBlocksProgram(program: GeneratedProgram, breakpointIds: string[]) {
  blocksProgram.value = program
  blockBreakpoints.value = breakpointIds
}
const blockBreakpointLines = computed(() => Object.entries(blocksProgram.value.lineToBlock)
  .filter(([, id]) => blockBreakpoints.value.includes(id))
  .map(([line]) => Number(line)))
const lineToBlock = (line: number | null | undefined) => (line ? blocksProgram.value.lineToBlock[line] ?? null : null)

/** Was tatsächlich ausgeführt wird (Blöcke ⇒ Klonk-Script) */
const runSource = computed(() => (isBlocks.value ? blocksProgram.value.code : source.value))
const runBreakpoints = computed(() => (isBlocks.value ? blockBreakpointLines.value : breakpoints.value))
const languageItems = computed(() => PROGRAM_LANGUAGES.map(l => ({ label: t(`editor.languages.${l}`), value: l })))
const { start } = useWorldEditor()
const { can } = useLicense()

// Angezeigte Welt: Kopie der Startwelt, auf der das Programm läuft
const world = shallowRef(new World(start.value.toJSON()))
const speed = ref(300)

const snapshot = ref<RunnerSnapshot>({ state: 'idle', line: null, pausedRange: null, variables: {}, output: [], error: null })
let runner: ProgramRunner | undefined
onMounted(() => {
  runner = new ProgramRunner(() => new RunnerWorker(), (s) => {
    snapshot.value = s
  })
})
onBeforeUnmount(() => runner?.dispose())

const running = computed(() => snapshot.value.state === 'running' || snapshot.value.state === 'paused')
const paused = computed(() => snapshot.value.state === 'paused')
const errorMessage = computed(() => {
  const error = snapshot.value.error
  return error ? scriptErrorMessage(t, te, error.code, error.params) : null
})

function resetWorld() {
  world.value = new World(start.value.toJSON())
}

function run(pauseOnStart = false) {
  if (!runner) return
  resetWorld()
  runner.run(world.value, {
    language: runLanguage.value,
    source: runSource.value,
    breakpoints: runBreakpoints.value,
    delay: speed.value,
    allowImports: can('libraries'),
    pauseOnStart,
  })
}

function stepOrStart() {
  if (paused.value) runner?.step()
  else if (!running.value) run(true)
}

function stop() {
  runner?.stop()
}

function reset() {
  runner?.stop()
  snapshot.value = { state: 'idle', line: null, pausedRange: null, variables: {}, output: [], error: null }
  resetWorld()
}

watch(runBreakpoints, lines => runner?.setBreakpoints(lines))
watch(speed, delay => runner?.setDelay(delay))
// Neue Startwelt (z. B. im Welt-Editor geändert) übernehmen, solange nichts läuft
watch(start, () => {
  if (!running.value) resetWorld()
})

const toast = useToast()
const translateItems = computed(() => [[
  { label: 'Deutsch', onSelect: () => translateTo('de') || toast.add({ title: t('editor.translateFailed'), color: 'error' }) },
  { label: 'English', onSelect: () => translateTo('en') || toast.add({ title: t('editor.translateFailed'), color: 'error' }) },
]])

// Tastenkürzel wie in üblichen IDEs
function onKey(event: KeyboardEvent) {
  if (event.key === 'F5') {
    event.preventDefault()
    if (event.shiftKey) stop()
    else if (paused.value) runner?.resume()
    else if (!running.value) run()
  }
  else if (event.key === 'F10' || event.key === 'F11') {
    event.preventDefault()
    stepOrStart()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const variables = computed(() => Object.entries(snapshot.value.variables))
</script>

<template>
  <div class="flex h-[calc(100dvh-var(--ui-header-height))] flex-col">
    <!-- Werkzeugleiste -->
    <div class="flex flex-wrap items-center gap-2 border-b border-(--ui-border) px-3 py-2">
      <UButton
        v-if="!running"
        icon="i-lucide-play"
        :label="t('editor.run')"
        data-testid="run"
        @click="run()"
      />
      <UButton
        v-else-if="paused"
        icon="i-lucide-play"
        :label="t('editor.resume')"
        data-testid="resume"
        @click="runner?.resume()"
      />
      <UButton
        v-else
        icon="i-lucide-pause"
        :label="t('editor.pause')"
        data-testid="pause"
        @click="runner?.pause()"
      />
      <UTooltip :text="t('editor.stepHelp')">
        <UButton
          icon="i-lucide-step-forward"
          variant="outline"
          :label="t('editor.step')"
          :disabled="running && !paused"
          data-testid="step"
          @click="stepOrStart"
        />
      </UTooltip>
      <UButton
        icon="i-lucide-square"
        variant="outline"
        color="error"
        :label="t('editor.stop')"
        :disabled="!running"
        data-testid="stop"
        @click="stop"
      />
      <UButton
        icon="i-lucide-undo-2"
        variant="ghost"
        color="neutral"
        :label="t('editor.reset')"
        data-testid="reset"
        @click="reset"
      />

      <div class="ms-2 flex w-40 items-center gap-2">
        <UIcon
          name="i-lucide-gauge"
          class="shrink-0 text-(--ui-text-muted)"
          :aria-label="t('world.speed')"
        />
        <USlider
          v-model="speed"
          :min="0"
          :max="1000"
          :step="50"
          inverted
          :aria-label="t('world.speed')"
        />
      </div>

      <div class="ms-auto flex items-center gap-2">
        <USelect
          v-model="language"
          :items="languageItems"
          :disabled="running"
          icon="i-lucide-file-code"
          class="w-44"
          data-testid="language"
          :aria-label="t('editor.language')"
        />
        <UDropdownMenu
          v-if="language === 'klonk'"
          :items="translateItems"
        >
          <UButton
            icon="i-lucide-languages"
            variant="ghost"
            color="neutral"
            :label="t('editor.translate')"
            :disabled="running"
          />
        </UDropdownMenu>
        <UButton
          icon="i-lucide-pencil-ruler"
          variant="ghost"
          color="neutral"
          :label="t('editor.editWorld')"
          to="/world"
        />
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <!-- Code -->
      <section class="flex min-h-64 flex-1 flex-col lg:max-w-[50%]">
        <ClientOnly v-if="isBlocks">
          <div class="relative min-h-0 flex-1">
            <KlonkBlocks
              v-model="source"
              :read-only="running"
              :active-block="running ? lineToBlock(snapshot.line) : null"
              :error-block="snapshot.state === 'error' ? lineToBlock(snapshot.error?.range?.line) : null"
              @program="onBlocksProgram"
            />
          </div>
          <div class="border-t border-(--ui-border)">
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              block
              :icon="showCode ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :label="showCode ? t('blocks.hideCode') : t('blocks.showCode')"
              data-testid="toggle-code"
              @click="showCode = !showCode"
            />
            <pre
              v-if="showCode"
              class="max-h-56 overflow-auto bg-(--ui-bg-muted) px-4 py-2 font-mono text-xs"
              data-testid="generated-code"
            ><span
              v-for="(line, i) in blocksProgram.code.split('\n')"
              :key="i"
              class="block"
              :class="running && snapshot.line === i + 1 ? 'bg-amber-200/60 dark:bg-amber-500/30' : ''"
            >{{ line || ' ' }}</span></pre>
          </div>
        </ClientOnly>
        <ClientOnly v-else>
          <KlonkEditor
            v-model="source"
            v-model:breakpoints="breakpoints"
            :language="runLanguage"
            :read-only="running"
            :active-line="running ? snapshot.line : null"
            :error-line="snapshot.state === 'error' ? snapshot.error?.range?.line : null"
          />
        </ClientOnly>
      </section>

      <!-- Welt + Ausgabe -->
      <section class="flex min-h-0 flex-1 flex-col border-(--ui-border) lg:border-l">
        <div class="relative min-h-64 flex-1 bg-(--ui-bg-muted)">
          <ClientOnly>
            <KlonkWorld
              :world="world"
              :speed="speed"
            />
          </ClientOnly>
          <div
            class="pointer-events-none absolute left-3 top-3"
            data-testid="run-state"
            :data-state="snapshot.state"
          >
            <UBadge
              v-if="snapshot.state !== 'idle'"
              :color="snapshot.state === 'error' ? 'error' : snapshot.state === 'done' ? 'success' : 'neutral'"
              variant="subtle"
              :label="t(`editor.state.${snapshot.state}`)"
            />
          </div>
        </div>

        <div class="h-56 shrink-0 overflow-y-auto border-t border-(--ui-border) p-3 text-sm">
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="subtle"
            icon="i-lucide-octagon-alert"
            :title="snapshot.error?.range ? t('editor.errorAt', { line: snapshot.error.range.line }) : t('editor.error')"
            :description="errorMessage"
            class="mb-3"
            data-testid="run-error"
          />

          <div
            v-if="paused && variables.length"
            class="mb-3"
            data-testid="variables"
          >
            <p class="mb-1 font-semibold">
              {{ t('editor.variables') }}
            </p>
            <table class="w-full font-mono text-xs">
              <tbody>
                <tr
                  v-for="[name, value] in variables"
                  :key="name"
                  :data-testid="`variable-${name}`"
                >
                  <td class="w-1/3 py-0.5 text-(--ui-text-muted)">
                    {{ name }}
                  </td>
                  <td>{{ value }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="mb-1 font-semibold">
            {{ t('editor.output') }}
          </p>
          <pre
            class="whitespace-pre-wrap font-mono text-xs"
            data-testid="output"
          >{{ snapshot.output.join('\n') || t('editor.noOutput') }}</pre>
        </div>
      </section>
    </div>
  </div>
</template>
