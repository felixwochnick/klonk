<script setup lang="ts">
import type { GeneratedProgram } from '~/utils/blocks/generator'
import { compareOutcome, expectedOutcomes, findModule, LEARN_LANGUAGES, LEARN_MANIFEST, parseManifest, serializeManifest, taskFile, taskFolderFiles, type CheckFailure, type LearnLanguage, type LearnManifest, type Outcome } from '@klonk/learn'
import { World } from '@klonk/world'
import { ProgramRunner, type RunError, type RunnerSnapshot } from '@klonk/runtime'
import RunnerWorker from '@klonk/runtime/worker?worker'
import type { LearnCheckResult } from '~/utils/learn-check'
import { CloudProject } from '~/utils/cloud-project'
import type { Project } from '~/utils/project-fs'

// Nächste Aufgabe = gleiche Seite mit anderen Parametern ⇒ neu aufbauen (Runner, Welt, Editor)
definePageMeta({ key: route => route.fullPath })

const { t, te, locale } = useI18n()
const route = useRoute()
const learn = useLearn()
const { user } = useAuth()
const { maxCharacters } = useLicense()
const apiError = useApiError()
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))

const module = findModule(String(route.params.module))
const task = module?.tasks.find(x => x.id === String(route.params.task))
const taskIndex = module && task ? module.tasks.indexOf(task) : -1
useSeoMeta({ title: () => task?.title[lang.value] ?? t('learn.title') })

// Programm der Aufgabe: im Projekt des Moduls (Cloud, Browser oder Ordner) – das eigene oder (Gruppenleitung, `?project=`)
// das Cloud-Projekt einer anderen Person, nur lesen
const foreign = typeof route.query.project === 'string' ? { id: route.query.project, name: String(route.query.name ?? '') } : null
// Rücksprung zum Lernstand – nur Seiten der App unter Unterricht
const foreignBack = typeof route.query.back === 'string' && /^\/teaching\/[\w/-]+$/.test(route.query.back) ? route.query.back : '/teaching'
const program = reactive<{ language: LearnLanguage, blocks: string, klonk: string }>({ language: 'blocks', blocks: '', klonk: '' })
const ready = ref(false)
const loadError = ref<string | null>(null)
/** Nur Ordner erlaubt bzw. Ordnerfreigabe verloren ⇒ Nutzeraktion nötig */
const needsAction = ref<'choose' | 'permission' | null>(null)
const isReadOnly = (p: Project | undefined) => p instanceof CloudProject && p.readOnly
const readOnly = ref(!!foreign)
const solvedHere = ref(false)
let project: Project | undefined
let shared = false
let manifest: LearnManifest | undefined
let saved = { language: '', blocks: '', klonk: '' }

/**
 * Aufgabenordner (Text, Welten, Programm) anlegen, falls das Projekt noch keinen hat (Projekte aus der ersten Fassung
 * hatten die Programme direkt im Projektordner – deren Inhalt zieht mit um)
 */
async function ensureTaskFolder() {
  if (!project || isReadOnly(project) || !manifest || !module || !task || manifest.tasks[task.id]) return
  const index = module.tasks.indexOf(task)
  const entry = taskFolderFiles(task, index, lang.value, allowedLanguages.value[0] ?? 'blocks')
  await project.createFolder(entry.folder)
  for (const file of entry.files) if (!await project.exists(file.path)) await project.write(file.path, file.content)
  for (const language of LEARN_LANGUAGES) {
    const old = await project.read(`${task.id}.${language}`).catch(() => null)
    if (old === null) continue
    await project.write(`${entry.program}.${language}`, old)
    await project.remove(`${task.id}.${language}`)
  }
  manifest.tasks[task.id] = entry.program
  await project.write(LEARN_MANIFEST, serializeManifest(manifest))
}

async function loadProgram() {
  if (!project || !module || !task) return
  manifest = parseManifest(await project.read(LEARN_MANIFEST).catch(() => null), module.id)
  await ensureTaskFolder()
  const read = (language: LearnLanguage) => project!.read(taskFile(manifest!, task.id, language)).catch(() => '')
  const stored = manifest.languages[task.id]
  program.language = stored && (readOnly.value || allowedLanguages.value.includes(stored)) ? stored : allowedLanguages.value[0] ?? 'blocks'
  program.blocks = await read('blocks')
  program.klonk = await read('klonk')
  solvedHere.value = !!manifest.solved[task.id]
  saved = { ...program }
}

async function openProject() {
  if (!module || !task) return
  loadError.value = null
  needsAction.value = null
  try {
    const opened = foreign ? await learn.openForeign(foreign.id, foreign.name) : await learn.openOwn(module.id, lang.value)
    project = opened.project
    shared = opened.shared
    readOnly.value = isReadOnly(project)
    await loadProgram()
    // Gruppenleitung sieht Änderungen der Lernenden, sobald sie hochgeladen sind
    if (project instanceof CloudProject && project.readOnly && !shared) project.onRemoteChange = () => void loadProgram()
    ready.value = true
  }
  catch (error) {
    const code = (error as Error)?.message
    if (code === 'learn_choose_storage') needsAction.value = 'choose'
    else if (code === 'learn_permission') needsAction.value = 'permission'
    else loadError.value = code === 'learn_no_storage' ? t('learn.noStorage') : apiError(error)
  }
}
onMounted(openProject)

// Speichern (lokal, die Cloud-Kopie lädt im Hintergrund hoch)
let saveTimer: ReturnType<typeof setTimeout> | undefined
async function save() {
  if (!project || isReadOnly(project) || !manifest || !task || !ready.value) return
  if (program.blocks !== saved.blocks) await project.write(taskFile(manifest, task.id, 'blocks'), program.blocks)
  if (program.klonk !== saved.klonk) await project.write(taskFile(manifest, task.id, 'klonk'), program.klonk)
  if (program.language !== saved.language) {
    manifest.languages[task.id] = program.language
    await project.write(LEARN_MANIFEST, serializeManifest(manifest))
  }
  saved = { ...program }
}
watch(() => [program.language, program.blocks, program.klonk], () => {
  if (!ready.value || readOnly.value) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void save(), 400)
})
onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  void save().finally(() => {
    if (!shared && project instanceof CloudProject) project.stop()
  })
})

async function markSolved() {
  if (!project || isReadOnly(project) || !manifest || !module || !task) return
  manifest.solved[task.id] ??= new Date().toISOString()
  await project.write(LEARN_MANIFEST, serializeManifest(manifest))
  solvedHere.value = true
  learn.markSolved(module.id, task.id)
}
const language = computed({
  get: () => program.language,
  set: (value) => {
    program.language = value
  },
})
// Sprachvorgabe der Gruppenleitung (fremde Programme: so, wie sie geschrieben wurden)
const allowedLanguages = computed<LearnLanguage[]>(() => (foreign || !module ? LEARN_LANGUAGES : learn.status.value?.languages[module.id] ?? LEARN_LANGUAGES))
const languageItems = computed(() => allowedLanguages.value.map(value => ({ label: t(`editor.languages.${value}`), value })))
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
const idle: RunnerSnapshot = { state: 'idle', line: null, pausedRange: null, variables: {}, heap: null, output: [], error: null }
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

// Figuren reagieren auf Fehler vor einem Feld (Wand, Quader …): kurz zurückzucken
const worldView = ref<{ cheer: (id?: string) => void, bumpAt: (position: { x: number, z: number }) => void } | null>(null)
watch(() => snapshot.value.error, (error) => {
  const x = error?.params.x
  const z = error?.params.z
  if (typeof x === 'number' && typeof z === 'number') worldView.value?.bumpAt({ x, z })
})
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

// Aufgabenstellung einklappbar (merkt sich der Browser); ein Prüfergebnis klappt sie wieder auf
const TASK_COLLAPSED_KEY = 'klonk-learn-task-collapsed'
const taskCollapsed = ref(false)
onMounted(() => {
  try {
    taskCollapsed.value = localStorage.getItem(TASK_COLLAPSED_KEY) === '1'
  }
  catch {
    // kein Speicher (privater Modus)
  }
})
watch(taskCollapsed, (collapsed) => {
  try {
    localStorage.setItem(TASK_COLLAPSED_KEY, collapsed ? '1' : '0')
  }
  catch {
    // kein Speicher (privater Modus)
  }
})
watch(result, (value) => {
  if (value) taskCollapsed.value = false
})
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
  if (result.value.status === 'solved') {
    await markSolved()
    worldView.value?.cheer()
  }
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

const solved = computed(() => solvedHere.value)
const next = computed(() => (module && task && !foreign ? learn.following(module.id, task.id) : null))
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
        :to="foreign ? foreignBack : `/learn/${module.id}`"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
        :label="foreign ? t('learn.backToProgress') : module.title[lang]"
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
          :disabled="running || readOnly || !ready"
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
          :disabled="running || !expected || !ready"
          data-testid="learn-check"
          @click="check"
        />
      </div>
    </div>

    <div
      class="grid min-h-0 flex-1 grid-cols-1"
      :class="taskCollapsed ? 'lg:grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)]' : 'lg:grid-cols-[22rem_minmax(0,1fr)_minmax(0,1fr)]'"
    >
      <!-- Aufgabe eingeklappt: schmale Leiste (breit) bzw. eine Zeile (schmal) -->
      <aside
        v-if="taskCollapsed"
        class="flex items-center gap-2 border-b border-(--ui-border) px-2 py-1 lg:flex-col lg:border-b-0 lg:border-e lg:py-2"
        data-testid="learn-task-collapsed"
      >
        <UTooltip :text="t('learn.showTask')">
          <UButton
            icon="i-lucide-panel-left-open"
            variant="ghost"
            color="neutral"
            size="sm"
            :aria-label="t('learn.showTask')"
            data-testid="learn-task-toggle"
            @click="taskCollapsed = false"
          />
        </UTooltip>
        <button
          type="button"
          class="min-w-0 truncate text-start text-sm font-semibold text-(--ui-text-muted) hover:text-(--ui-text) lg:rotate-180 lg:[writing-mode:vertical-rl]"
          @click="taskCollapsed = false"
        >
          {{ t('learn.taskNumber', { n: taskIndex + 1, total: module.tasks.length }) }} · {{ task.title[lang] }}
        </button>
      </aside>
      <!-- Aufgabe -->
      <aside
        v-else
        class="overflow-y-auto border-b border-(--ui-border) p-4 lg:border-b-0 lg:border-e"
      >
        <UAlert
          v-if="foreign"
          class="mb-4"
          color="info"
          variant="subtle"
          icon="i-lucide-eye"
          :title="t('learn.viewing', { name: foreign.name })"
          :description="t('learn.viewingHint')"
          data-testid="learn-viewing"
        />
        <UAlert
          v-if="loadError"
          class="mb-4"
          color="error"
          variant="subtle"
          icon="i-lucide-cloud-off"
          :description="loadError"
          data-testid="learn-load-error"
        />
        <!-- Ordner: erst wählen (Modulseite) bzw. Zugriff erneut erlauben (braucht einen Klick) -->
        <UAlert
          v-if="needsAction"
          class="mb-4"
          color="warning"
          variant="subtle"
          icon="i-lucide-folder-lock"
          :description="needsAction === 'choose' ? t('learn.chooseStorageFirst') : t('learn.folderPermission')"
          :actions="needsAction === 'choose'
            ? [{ label: t('learn.toModule'), to: `/learn/${module.id}`, size: 'xs' }]
            : [{ label: t('learn.grantFolder'), icon: 'i-lucide-folder-open', size: 'xs', onClick: () => void openProject() }]"
          data-testid="learn-needs-action"
        />
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
            {{ t('learn.taskNumber', { n: taskIndex + 1, total: module.tasks.length }) }}
          </p>
          <UTooltip :text="t('learn.hideTask')">
            <UButton
              icon="i-lucide-panel-left-close"
              variant="ghost"
              color="neutral"
              size="xs"
              class="-my-1"
              :aria-label="t('learn.hideTask')"
              data-testid="learn-task-toggle"
              @click="taskCollapsed = true"
            />
          </UTooltip>
        </div>
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
        <div
          v-if="!ready"
          class="flex flex-1 items-center justify-center text-(--ui-text-muted)"
        >
          <UIcon
            v-if="!loadError && !needsAction"
            name="i-lucide-loader-circle"
            class="size-6 animate-spin"
          />
        </div>
        <ClientOnly v-else-if="isBlocks">
          <div class="relative min-h-80 flex-1">
            <KlonkBlocks
              v-model="program.blocks"
              :read-only="running || readOnly"
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
            :read-only="running || readOnly"
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
              ref="worldView"
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
