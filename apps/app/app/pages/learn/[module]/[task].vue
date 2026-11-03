<script setup lang="ts">
import type { GeneratedProgram } from '~/utils/blocks/generator'
import { compareOutcome, expectedOutcomes, findModule, type CheckFailure, type Outcome } from '@klonk/learn'
import { World } from '@klonk/world'
import { ProgramRunner, type RunError, type RunnerSnapshot } from '@klonk/runtime'
import RunnerWorker from '@klonk/runtime/worker?worker'
import type { LearnCheckResult } from '~/utils/learn-check'

// Nächste Aufgabe = gleiche Seite mit anderen Parametern ⇒ neu aufbauen (Runner, Welt, Editor)
definePageMeta({ key: route => route.fullPath })

const { t, te, locale } = useI18n()
const route = useRoute()
const learn = useLearn()
const { user } = useAuth()
const { maxCharacters } = useLicense()
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))

const module = findModule(String(route.params.module))
const task = module?.tasks.find(x => x.id === String(route.params.task))
const taskIndex = module && task ? module.tasks.indexOf(task) : -1
useSeoMeta({ title: () => task?.title[lang.value] ?? t('learn.title') })

// Programm der Aufgabe (im Browser gespeichert)
const program = module && task ? learn.program(module.id, task.id) : reactive({ language: 'blocks' as const, blocks: '', klonk: '' })
const language = computed({
  get: () => program.language,
  set: (value) => {
    program.language = value
  },
})
const languageItems = computed(() => (['blocks', 'klonk'] as const).map(value => ({ label: t(`editor.languages.${value}`), value })))
const isBlocks = computed(() => language.value === 'blocks')
const blocksProgram = shallowRef<GeneratedProgram>({ code: '', lineToBlock: {} })
function onBlocksProgram(generated: GeneratedProgram) {
  blocksProgram.value = generated
}
const lineToBlock = (line: number | null | undefined) => (line ? blocksProgram.value.lineToBlock[line] ?? null : null)
const source = computed(() => (isBlocks.value ? blocksProgram.value.code : program.klonk))
const breakpoints = ref<number[]>([])

// Startwelten und Zielzustände (Ergebnis der Musterlösung)
const variant = ref(0)
const expected = shallowRef<Outcome[] | null>(null)
onMounted(async () => {
  if (task) expected.value = await expectedOutcomes(task)
})
const startWorld = () => new World(task!.worlds[variant.value]!)
const world = shallowRef(task ? startWorld() : World.empty())
const showGoal = ref(false)
const goalWorld = computed(() => (expected.value ? new World(expected.value[variant.value]!.world) : null))
const shownWorld = computed(() => (showGoal.value && goalWorld.value ? goalWorld.value : world.value))

// Ausführen mit Animation auf der gewählten Welt
const speed = ref(300)
const idle: RunnerSnapshot = { state: 'idle', line: null, pausedRange: null, variables: {}, output: [], error: null }
const snapshot = ref<RunnerSnapshot>(idle)
/** Ergebnis des letzten Laufs auf der angezeigten Welt (null = Ziel erreicht) */
const runResult = ref<{ failure: CheckFailure | null } | null>(null)
let runner: ProgramRunner | undefined
onMounted(() => {
  runner = new ProgramRunner(() => new RunnerWorker(), (s) => {
    snapshot.value = s
    if (s.state === 'done' && expected.value && task) {
      const failure = compareOutcome(task.check, task.worlds[variant.value]!, expected.value[variant.value]!, { world: world.value.toJSON(), output: s.output })
      runResult.value = { failure }
    }
  })
})
onBeforeUnmount(() => runner?.dispose())

const running = computed(() => snapshot.value.state === 'running' || snapshot.value.state === 'paused')
const paused = computed(() => snapshot.value.state === 'paused')
const errorLine = computed(() => (snapshot.value.state === 'error' ? snapshot.value.error?.range?.line ?? null : null))
const errorText = (error: RunError) => scriptErrorMessage(t, te, error.code, error.params)
const errorMessage = computed(() => (snapshot.value.error ? errorText(snapshot.value.error) : null))

function run(pauseOnStart = false) {
  if (!runner || !task) return
  showGoal.value = false
  runResult.value = null
  world.value = startWorld()
  runner.run(world.value, {
    language: 'klonk',
    source: source.value,
    breakpoints: isBlocks.value ? [] : breakpoints.value,
    delay: speed.value,
    allowImports: false,
    files: {},
    maxCharacters: maxCharacters.value,
    pauseOnStart,
  })
}
function stepOrStart() {
  if (paused.value) runner?.step()
  else if (!running.value) run(true)
}
function reset() {
  runner?.stop()
  snapshot.value = idle
  runResult.value = null
  world.value = startWorld()
}
function selectVariant(index: number) {
  if (running.value) return
  variant.value = index
  reset()
}
watch(breakpoints, lines => runner?.setBreakpoints(lines))
watch(speed, delay => runner?.setDelay(delay))

// Prüfen: alle Startwelten ohne Animation
const checking = ref(false)
const result = ref<LearnCheckResult | null>(null)
async function check() {
  if (!task || !module || !expected.value || running.value) return
  if (!source.value.trim()) {
    result.value = null
    useToast().add({ title: t('learn.check.empty'), color: 'warning' })
    return
  }
  checking.value = true
  try {
    result.value = await checkTask(task, expected.value, source.value, maxCharacters.value)
  }
  finally {
    checking.value = false
  }
  if (result.value.status === 'solved') learn.markSolved(module.id, task.id)
  else if ('world' in result.value && result.value.world !== variant.value) selectVariant(result.value.world)
}

const directionName = (direction: string) => t(`learn.directions.${direction}`)
function failureText(failure: CheckFailure, worldNumber: number) {
  switch (failure.code) {
    case 'direction':
      return t('learn.check.direction', { world: worldNumber, direction: directionName(failure.direction), expected: directionName(failure.expected) })
    case 'output':
      return t('learn.check.output', { world: worldNumber, expected: failure.expected || t('learn.check.nothing'), actual: failure.actual || t('learn.check.nothing') })
    default:
      return t(`learn.check.${failure.code}`, { world: worldNumber, ...failure })
  }
}
const resultText = computed(() => {
  const r = result.value
  if (!r) return null
  switch (r.status) {
    case 'solved': return t('learn.check.solved')
    case 'syntax': return t('learn.check.syntax', { message: errorText(r.error) })
    case 'missing': return t('learn.check.missing', { constructs: r.constructs.map(c => t(`learn.constructs.${c}`)).join(', ') })
    case 'failed': return failureText(r.failure, r.world + 1)
    case 'error': return t('learn.check.error', { world: r.world + 1, message: errorText(r.error) })
    case 'timeout': return t('learn.check.timeout', { world: r.world + 1 })
  }
  return null
})

const solved = computed(() => !!module && !!task && learn.isSolved(module.id, task.id))
const next = computed(() => (module && task ? learn.following(module.id, task.id) : null))
// Musterlösung: nach dem Lösen, für Lehrkräfte/Admins und für Privatkonten (ohne Organisation) jederzeit
const canSeeSolution = computed(() => solved.value || !user.value || !user.value.organizationId || user.value.role !== 'member' || user.value.platformRole !== 'user')
const showSolution = ref(false)
</script>

<template>
  <UContainer
    v-if="!module || !task"
    class="py-8"
  >
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-search-x"
      :title="t('learn.notFound')"
    />
    <UButton
      to="/learn"
      icon="i-lucide-arrow-left"
      variant="ghost"
      color="neutral"
      :label="t('learn.allModules')"
      class="mt-4"
    />
  </UContainer>

  <div
    v-else
    class="flex flex-col lg:h-[calc(100dvh-var(--ui-header-height))]"
    data-testid="learn-task"
  >
    <!-- Werkzeugleiste -->
    <div class="flex flex-wrap items-center gap-2 border-b border-(--ui-border) px-3 py-2">
      <UButton
        :to="`/learn/${module.id}`"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
        :label="module.title[lang]"
        class="max-w-64"
      />
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
        @click="runner?.stop()"
      />
      <UButton
        icon="i-lucide-undo-2"
        variant="ghost"
        color="neutral"
        :label="t('editor.reset')"
        data-testid="reset"
        @click="reset"
      />
      <div class="ms-2 flex w-32 items-center gap-2">
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
          class="w-40"
          data-testid="language"
          :aria-label="t('editor.language')"
        />
        <UButton
          icon="i-lucide-list-checks"
          color="success"
          :label="t('learn.check.button')"
          :loading="checking"
          :disabled="running || !expected"
          data-testid="learn-check"
          @click="check"
        />
      </div>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)_minmax(0,1fr)]">
      <!-- Aufgabe -->
      <aside class="overflow-y-auto border-b border-(--ui-border) p-4 lg:border-b-0 lg:border-e">
        <p class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
          {{ t('learn.taskNumber', { n: taskIndex + 1, total: module.tasks.length }) }}
        </p>
        <h1 class="mb-3 mt-1 flex items-center gap-2 text-lg font-bold">
          {{ task.title[lang] }}
          <UIcon
            v-if="solved"
            name="i-lucide-circle-check"
            class="size-5 text-(--ui-success)"
            :aria-label="t('learn.completed')"
            data-testid="learn-solved"
          />
        </h1>
        <LearnText
          :text="task.text[lang]"
          data-testid="learn-text"
        />
        <p
          v-if="task.worlds.length > 1"
          class="mt-3 text-xs text-(--ui-text-muted)"
        >
          {{ t('learn.severalWorlds', { n: task.worlds.length }) }}
        </p>

        <UAlert
          v-if="result && resultText"
          class="mt-4"
          :color="result.status === 'solved' ? 'success' : 'warning'"
          variant="subtle"
          :icon="result.status === 'solved' ? 'i-lucide-party-popper' : 'i-lucide-circle-alert'"
          :description="resultText"
          :actions="result.status === 'solved' && next ? [{ label: t('learn.next'), trailingIcon: 'i-lucide-arrow-right', to: `/learn/${next.module}/${next.task}`, color: 'success' as const, size: 'sm' as const }] : []"
          data-testid="learn-result"
          :data-status="result.status"
        />

        <div
          v-if="task.hints?.length"
          class="mt-4 space-y-2"
        >
          <UCollapsible
            v-for="(hint, i) in task.hints"
            :key="i"
          >
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              icon="i-lucide-lightbulb"
              :label="t('learn.hint', { n: i + 1 })"
              :data-testid="`learn-hint-${i + 1}`"
            />
            <template #content>
              <LearnText
                :text="hint[lang]"
                class="px-2 pb-2"
              />
            </template>
          </UCollapsible>
        </div>

        <div
          v-if="canSeeSolution"
          class="mt-4"
        >
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            :icon="showSolution ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :label="showSolution ? t('learn.hideSolution') : t('learn.showSolution')"
            data-testid="learn-show-solution"
            @click="showSolution = !showSolution"
          />
          <pre
            v-if="showSolution"
            class="mt-2 overflow-x-auto rounded-md border border-(--ui-border) bg-(--ui-bg-muted) p-3 font-mono text-xs"
            data-testid="learn-solution"
          >{{ task.solution[lang] }}</pre>
        </div>
      </aside>

      <!-- Programm -->
      <section class="flex min-h-80 flex-col border-b border-(--ui-border) lg:border-b-0 lg:border-e">
        <ClientOnly v-if="isBlocks">
          <div class="relative min-h-80 flex-1">
            <KlonkBlocks
              v-model="program.blocks"
              :read-only="running"
              :active-block="running ? lineToBlock(snapshot.line) : null"
              :error-block="snapshot.state === 'error' ? lineToBlock(snapshot.error?.range?.line) : null"
              @program="onBlocksProgram"
            />
          </div>
        </ClientOnly>
        <ClientOnly v-else>
          <KlonkEditor
            v-model="program.klonk"
            v-model:breakpoints="breakpoints"
            language="klonk"
            :read-only="running"
            :active-line="running ? snapshot.line : null"
            :error-line="errorLine"
            :error-message="errorMessage"
          />
        </ClientOnly>
      </section>

      <!-- Welt -->
      <section class="flex min-h-0 flex-col">
        <div class="flex flex-wrap items-center gap-1 border-b border-(--ui-border) px-2 py-1">
          <template v-if="task.worlds.length > 1">
            <UButton
              v-for="(_, i) in task.worlds"
              :key="i"
              size="xs"
              :variant="variant === i ? 'soft' : 'ghost'"
              :color="variant === i ? 'primary' : 'neutral'"
              :label="t('learn.world', { n: i + 1 })"
              :disabled="running"
              :data-testid="`learn-world-${i + 1}`"
              @click="selectVariant(i)"
            />
          </template>
          <USwitch
            v-model="showGoal"
            :label="t('learn.showGoal')"
            :disabled="running || !expected"
            size="sm"
            class="ms-auto"
            data-testid="learn-show-goal"
          />
        </div>
        <div class="relative min-h-80 flex-1 bg-(--ui-bg-muted)">
          <ClientOnly>
            <KlonkWorld
              :world="shownWorld"
              :speed="speed"
            />
          </ClientOnly>
          <div
            class="pointer-events-none absolute left-3 top-3 flex gap-2"
            data-testid="run-state"
            :data-state="snapshot.state"
          >
            <UBadge
              v-if="showGoal"
              color="info"
              variant="subtle"
              icon="i-lucide-flag"
              :label="t('learn.goal')"
            />
            <template v-else>
              <UBadge
                v-if="snapshot.state !== 'idle'"
                :color="snapshot.state === 'error' ? 'error' : snapshot.state === 'done' ? 'success' : 'neutral'"
                variant="subtle"
                :label="t(`editor.state.${snapshot.state}`)"
              />
              <UBadge
                v-if="runResult"
                :color="runResult.failure ? 'warning' : 'success'"
                variant="subtle"
                :icon="runResult.failure ? 'i-lucide-circle-x' : 'i-lucide-flag'"
                :label="runResult.failure ? t('learn.goalMissed') : t('learn.goalReached')"
                data-testid="learn-run-result"
              />
            </template>
          </div>
        </div>
        <div
          class="max-h-48 shrink-0 overflow-y-auto border-t border-(--ui-border) p-3 text-sm"
          data-testid="output-pane"
        >
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="subtle"
            icon="i-lucide-octagon-alert"
            :title="snapshot.error?.range ? t('editor.errorAt', { line: snapshot.error.range.line }) : t('editor.error')"
            :description="errorMessage"
            class="mb-2"
            data-testid="run-error"
          />
          <p
            v-if="runResult?.failure"
            class="mb-2 text-(--ui-warning)"
          >
            {{ failureText(runResult.failure, variant + 1) }}
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
