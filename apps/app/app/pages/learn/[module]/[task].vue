<script setup lang="ts">
import type { GeneratedProgram } from '~/utils/blocks/generator'
import { codeSolution, collectTables, compareOutcome, findModule, isCodeLanguage, LEARN_MANIFEST, moduleCode, parseManifest, scenarioCount, serializeManifest, starterSource, taskFile, taskFolderFiles, TRACK_LANGUAGES, type CheckFailure, type LearnLanguage, type LearnManifest, type Outcome } from '@klonk/learn'
import { World } from '@klonk/world'
import { ProgramRunner, type RunError, type RunLanguage, type RunnerSnapshot, type SqlResult } from '@klonk/runtime'
import RunnerWorker from '@klonk/runtime/worker?worker'
import { checkTask, computeExpected, runSqlTask, scenarioTables, scenarioWorld, taskMaxCharacters, TaskDatabases, type LearnCheckResult, type ScenarioTables } from '~/utils/learn-check'
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
const track = module?.track ?? 'basics'
useSeoMeta({ title: () => task?.title[lang.value] ?? t('learn.title') })

// Programm der Aufgabe: im Projekt des Moduls (Cloud, Browser oder Ordner) – das eigene oder (Gruppenleitung, `?project=`)
// das Cloud-Projekt einer anderen Person, nur lesen
const foreign = typeof route.query.project === 'string' ? { id: route.query.project, name: String(route.query.name ?? '') } : null
// Rücksprung zum Lernstand – nur Seiten der App unter Unterricht
const foreignBack = typeof route.query.back === 'string' && /^\/teaching\/[\w/-]+$/.test(route.query.back) ? route.query.back : '/teaching'
/** Sprache und Programm je Sprache (fehlt eine Datei, gilt die Startvorlage) */
const program = reactive<{ language: LearnLanguage, sources: Partial<Record<LearnLanguage, string>> }>({ language: TRACK_LANGUAGES[track][0]!, sources: {} })
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
let saved: { language: string, sources: Partial<Record<LearnLanguage, string>> } = { language: '', sources: {} }

/** Zuletzt gewählte Programmiersprache (Reihen F und A) – Vorgabe für neue Aufgaben */
const PREFERRED_KEY = 'klonk:learn-language'
function preferredLanguage(): LearnLanguage | null {
  // Zuletzt in diesem Modul genutzte Sprache, sonst die zuletzt überhaupt gewählte
  const used = Object.values(manifest?.languages ?? {}).filter(l => allowedLanguages.value.includes(l))
  if (used.length) return used.at(-1)!
  try {
    const stored = localStorage.getItem(PREFERRED_KEY) as LearnLanguage | null
    return stored && allowedLanguages.value.includes(stored) ? stored : null
  }
  catch {
    return null
  }
}

/**
 * Aufgabenordner (Text, Welten, Datenbanken, Programm) anlegen, falls das Projekt noch keinen hat (Projekte aus der
 * ersten Fassung hatten die Programme direkt im Projektordner – deren Inhalt zieht mit um)
 */
async function ensureTaskFolder() {
  if (!project || isReadOnly(project) || !manifest || !module || !task || manifest.tasks[task.id]) return
  const index = module.tasks.indexOf(task)
  const entry = taskFolderFiles(task, index, lang.value, allowedLanguages.value[0] ?? TRACK_LANGUAGES[track][0]!, track)
  await project.createFolder(entry.folder)
  for (const file of entry.files) if (!await project.exists(file.path)) await project.write(file.path, file.content)
  for (const language of TRACK_LANGUAGES[track]) {
    const old = await project.read(taskFile(manifest, task.id, language)).catch(() => null)
    if (old === null) continue
    await project.write(`${entry.program}.${taskFile(manifest, task.id, language).split('.').pop()}`, old)
    await project.remove(taskFile(manifest, task.id, language))
  }
  manifest.tasks[task.id] = entry.program
  await project.write(LEARN_MANIFEST, serializeManifest(manifest))
}

async function loadProgram() {
  if (!project || !module || !task) return
  manifest = parseManifest(await project.read(LEARN_MANIFEST).catch(() => null), module.id)
  await ensureTaskFolder()
  const sources: Partial<Record<LearnLanguage, string>> = {}
  for (const language of TRACK_LANGUAGES[track]) {
    const text = await project.read(taskFile(manifest, task.id, language)).catch(() => null)
    if (text !== null) sources[language] = text
  }
  const stored = manifest.languages[task.id]
  program.language = stored && (readOnly.value || allowedLanguages.value.includes(stored))
    ? stored
    : (readOnly.value && Object.keys(sources)[0] as LearnLanguage) || preferredLanguage() || allowedLanguages.value[0] || TRACK_LANGUAGES[track][0]!
  program.sources = sources
  solvedHere.value = !!manifest.solved[task.id]
  saved = { language: program.language, sources: { ...sources } }
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
  for (const language of TRACK_LANGUAGES[track]) {
    const text = program.sources[language]
    if (text !== undefined && text !== saved.sources[language]) await project.write(taskFile(manifest, task.id, language), text)
  }
  if (program.language !== saved.language) {
    manifest.languages[task.id] = program.language
    await project.write(LEARN_MANIFEST, serializeManifest(manifest))
  }
  saved = { language: program.language, sources: { ...program.sources } }
}
watch(() => [program.language, ...TRACK_LANGUAGES[track].map(l => program.sources[l])], () => {
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
    if (isCodeLanguage(value)) {
      try {
        localStorage.setItem(PREFERRED_KEY, value)
      }
      catch {
        // kein Speicher (privater Modus)
      }
    }
  },
})
// Sprachvorgabe der Gruppenleitung (fremde Programme: so, wie sie geschrieben wurden)
const allowedLanguages = computed<LearnLanguage[]>(() => (foreign || !module ? TRACK_LANGUAGES[track] : learn.status.value?.languages[module.id] ?? TRACK_LANGUAGES[track]))
const languageItems = computed(() => allowedLanguages.value.map(value => ({ label: t(`editor.languages.${value}`), value })))
const isBlocks = computed(() => language.value === 'blocks')
const isSql = computed(() => language.value === 'sql')
/** Text des Programms in der gewählten Sprache (Blöcke: Blockly-JSON) */
const code = computed({
  get: () => program.sources[language.value] ?? starterSource(language.value, track, lang.value),
  set: (value: string) => {
    program.sources[language.value] = value
  },
})
const blocksSource = computed({
  get: () => program.sources.blocks ?? '',
  set: (value: string) => {
    program.sources.blocks = value
  },
})
const blocksProgram = shallowRef<GeneratedProgram>({ code: '', lineToBlock: {} })
function onBlocksProgram(generated: GeneratedProgram) {
  blocksProgram.value = generated
}
const lineToBlock = (line: number | null | undefined) => (line ? blocksProgram.value.lineToBlock[line] ?? null : null)
const source = computed(() => (isBlocks.value ? blocksProgram.value.code : code.value))
const runLanguage = computed<RunLanguage>(() => (isBlocks.value ? 'klonk' : language.value as RunLanguage))
const editorLanguage = computed(() => (isSql.value ? 'sql' : language.value as RunLanguage))
const breakpoints = ref<number[]>([])

// Startsituationen (Welten bzw. Datensätze) und Zielzustände (Ergebnis der Musterlösung)
const scenarios = task ? scenarioCount(task) : 1
const hasWorld = !!task?.worlds.length
/** Startsituationen unterscheiden sich in der Welt (sonst nur in den Daten: „Daten 1“ statt „Welt 1“) */
const byWorld = !!task && task.worlds.length >= scenarios
const hasDatabase = !!task && (!!task.databases?.length || !!task.worldDatabase)
const variant = ref(0)
const expected = shallowRef<Outcome[] | null>(null)
const expectedError = ref(false)
const startWorld = () => new World(scenarioWorld(task!, variant.value) ?? World.empty().toJSON())
const world = shallowRef(task ? startWorld() : World.empty())
onMounted(async () => {
  if (!module || !task) return
  try {
    expected.value = await computeExpected(module, task, { lang: lang.value, maxCharacters: maxCharacters.value })
  }
  catch {
    expectedError.value = true
  }
})
const showGoal = ref(false)
const goal = computed(() => expected.value?.[variant.value] ?? null)
const goalWorld = computed(() => (goal.value?.world ? new World(goal.value.world) : null))
const shownWorld = computed(() => (showGoal.value && goalWorld.value ? goalWorld.value : world.value))

// Rechte Seite: Welt und/oder Tabellen der Aufgabendatenbank
const view = ref<'world' | 'database'>(hasWorld ? 'world' : 'database')
const tables = shallowRef<ScenarioTables | null>(null)
async function loadTables() {
  if (!task || !hasDatabase) return
  tables.value = await scenarioTables(task, variant.value, lang.value).catch(() => null)
}
onMounted(loadTables)
watch(variant, loadTables)

// Ausführen mit Animation auf der gewählten Welt
const speed = ref(300)
const idle: RunnerSnapshot = { state: 'idle', line: null, pausedRange: null, variables: {}, heap: null, output: [], error: null }
const snapshot = ref<RunnerSnapshot>(idle)
/** Ergebnis des letzten Laufs in der angezeigten Startsituation (null = Ziel erreicht) */
const runResult = ref<{ failure: CheckFailure | null } | null>(null)
/** SQL: Ergebnisse des letzten Laufs */
const sqlResults = shallowRef<SqlResult[]>([])
let runner: ProgramRunner | undefined
let runDatabases: TaskDatabases | undefined
onMounted(() => {
  runner = new ProgramRunner(() => new RunnerWorker(), (s) => {
    snapshot.value = s
    if (s.state === 'done' && expected.value && task) {
      const want = expected.value[variant.value]!
      const output = s.output
      const finished = world.value.toJSON()
      void (runDatabases?.all() ?? Promise.resolve([])).then(sessions => collectTables(task, lang.value, sessions)).then((tables) => {
        runResult.value = { failure: compareOutcome(task.check, want, { world: finished, output, tables }) }
      })
    }
  })
  runner.onDatabase = request => runDatabases?.answer(request) ?? Promise.resolve({ ok: false, code: 'db_unavailable', params: {} })
})
onBeforeUnmount(() => {
  runner?.dispose()
  runDatabases?.close()
})

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

async function runSql() {
  if (!task) return
  showGoal.value = false
  runResult.value = null
  world.value = startWorld()
  snapshot.value = { ...idle, state: 'running' }
  const run = await runSqlTask(task, code.value, variant.value, lang.value)
  sqlResults.value = run.results
  if ('error' in run) {
    snapshot.value = { ...idle, state: 'error', error: run.error }
    return
  }
  if (run.outcome.world && task.worldDatabase) world.value = new World(run.outcome.world)
  snapshot.value = { ...idle, state: 'done' }
  if (expected.value) runResult.value = { failure: compareOutcome(task.check, expected.value[variant.value]!, run.outcome) }
}

function run(pauseOnStart = false) {
  if (!runner || !task) return
  if (isSql.value) {
    void runSql()
    return
  }
  showGoal.value = false
  runResult.value = null
  world.value = startWorld()
  runDatabases?.close()
  runDatabases = new TaskDatabases(task, variant.value, lang.value)
  runner.run(world.value, {
    language: runLanguage.value,
    source: source.value,
    breakpoints: isBlocks.value ? [] : breakpoints.value,
    delay: speed.value,
    allowImports: false,
    files: {},
    maxCharacters: taskMaxCharacters(task, maxCharacters.value),
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
  sqlResults.value = []
  world.value = startWorld()
}
function selectVariant(index: number) {
  if (running.value) return
  variant.value = index
  reset()
}
watch(breakpoints, lines => runner?.setBreakpoints(lines))
watch(speed, delay => runner?.setDelay(delay))

// Prüfen: alle Startsituationen ohne Animation
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
  if (!source.value.trim() || source.value.trim() === starterSource(language.value, track, lang.value).trim()) {
    result.value = null
    useToast().add({ title: t('learn.check.empty'), color: 'warning' })
    return
  }
  checking.value = true
  try {
    result.value = await checkTask(task, expected.value, language.value, source.value, { lang: lang.value, maxCharacters: maxCharacters.value })
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
  const where = byWorld ? t('learn.inWorld', { n: worldNumber }) : t('learn.inDataset', { n: worldNumber })
  switch (failure.code) {
    case 'direction':
      return t('learn.check.direction', { where, name: failure.name, direction: directionName(failure.direction), expected: directionName(failure.expected) })
    case 'output':
      return t('learn.check.output', { where, expected: failure.expected || t('learn.check.nothing'), actual: failure.actual || t('learn.check.nothing') })
    default:
      return t(`learn.check.${failure.code}`, { where, ...failure })
  }
}
const resultText = computed(() => {
  const r = result.value
  if (!r) return null
  const where = (n: number) => (byWorld ? t('learn.inWorld', { n }) : t('learn.inDataset', { n }))
  switch (r.status) {
    case 'solved': return t(byWorld ? 'learn.check.solved' : 'learn.check.solvedData')
    case 'syntax': return t('learn.check.syntax', { message: errorText(r.error) })
    case 'missing': return t('learn.check.missing', { constructs: r.constructs.map(c => t(`learn.constructs.${c}`)).join(', ') })
    case 'failed': return failureText(r.failure, r.world + 1)
    case 'error': return t('learn.check.error', { where: where(r.world + 1), message: errorText(r.error) })
    case 'timeout': return t('learn.check.timeout', { where: where(r.world + 1) })
  }
  return null
})

const solved = computed(() => solvedHere.value)
const next = computed(() => (module && task && !foreign ? learn.following(module.id, task.id) : null))
// Musterlösung: nach dem Lösen, für Lehrkräfte/Admins und für Privatkonten (ohne Organisation) jederzeit
const canSeeSolution = computed(() => solved.value || !user.value || !user.value.organizationId || user.value.role !== 'member' || user.value.platformRole !== 'user')
const showSolution = ref(false)
const solutionText = computed(() => {
  if (!task) return ''
  if (task.solutions) return codeSolution(task.solutions, isCodeLanguage(language.value) ? language.value : 'javascript', lang.value)
  return task.solution?.[lang.value] ?? ''
})
/** Sprache der Codebeispiele in Einführung und Tipps (Reihen F und A) */
const textLanguage = computed(() => (isCodeLanguage(language.value) ? language.value : null))
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
        :label="foreign ? t('learn.backToProgress') : `${moduleCode(module.id)} · ${module.title[lang]}`"
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
      <UTooltip
        v-if="!isSql"
        :text="t('editor.stepHelp')"
      >
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
        v-if="!isSql"
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
      <div
        v-if="!isSql"
        class="ms-2 flex w-32 items-center gap-2"
      >
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
          v-if="languageItems.length > 1 || !isSql"
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
          :title="expectedError ? t('learn.expectedFailed') : undefined"
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
          :language="textLanguage"
          data-testid="learn-text"
        />
        <p
          v-if="scenarios > 1"
          class="mt-3 text-xs text-(--ui-text-muted)"
        >
          {{ byWorld ? t('learn.severalWorlds', { n: scenarios }) : t('learn.severalDatasets', { n: scenarios }) }}
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
                :language="textLanguage"
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
          >{{ solutionText }}</pre>
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
              v-model="blocksSource"
              :read-only="running || readOnly"
              :active-block="running ? lineToBlock(snapshot.line) : null"
              :error-block="snapshot.state === 'error' ? lineToBlock(snapshot.error?.range?.line) : null"
              @program="onBlocksProgram"
            />
          </div>
        </ClientOnly>
        <ClientOnly v-else>
          <KlonkEditor
            v-model="code"
            v-model:breakpoints="breakpoints"
            :language="editorLanguage"
            :read-only="running || readOnly"
            :active-line="running ? snapshot.line : null"
            :error-line="errorLine"
            :error-message="errorMessage"
            :sql-tables="isSql ? tables?.schema ?? [] : []"
            @run="run()"
          />
        </ClientOnly>
      </section>

      <!-- Welt bzw. Datenbank, darunter Ausgabe oder Ergebnis -->
      <section class="flex min-h-0 flex-col">
        <div class="flex flex-wrap items-center gap-1 border-b border-(--ui-border) px-2 py-1">
          <template v-if="scenarios > 1">
            <UButton
              v-for="i in scenarios"
              :key="i"
              size="xs"
              :variant="variant === i - 1 ? 'soft' : 'ghost'"
              :color="variant === i - 1 ? 'primary' : 'neutral'"
              :label="byWorld ? t('learn.world', { n: i }) : t('learn.dataset', { n: i })"
              :disabled="running"
              :data-testid="`learn-world-${i}`"
              @click="selectVariant(i - 1)"
            />
          </template>
          <UTabs
            v-if="hasWorld && hasDatabase"
            v-model="view"
            :items="[{ label: t('learn.views.world'), value: 'world', icon: 'i-lucide-box' }, { label: t('learn.views.database'), value: 'database', icon: 'i-lucide-database' }]"
            :content="false"
            size="xs"
            variant="link"
            class="ms-2"
            data-testid="learn-view"
          />
          <USwitch
            v-model="showGoal"
            :label="t('learn.showGoal')"
            :disabled="running || !expected"
            size="sm"
            class="ms-auto"
            data-testid="learn-show-goal"
          />
        </div>
        <div
          v-if="view === 'world' && hasWorld"
          class="relative min-h-80 flex-1 bg-(--ui-bg-muted)"
        >
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
        <!-- Tabellen der Aufgabendatenbank in dieser Startsituation -->
        <div
          v-else
          class="min-h-60 flex-1 space-y-4 overflow-y-auto p-3"
          data-testid="learn-tables"
        >
          <div
            class="flex gap-2"
            data-testid="run-state"
            :data-state="snapshot.state"
          >
            <UBadge
              v-if="runResult && !showGoal"
              :color="runResult.failure ? 'warning' : 'success'"
              variant="subtle"
              :icon="runResult.failure ? 'i-lucide-circle-x' : 'i-lucide-flag'"
              :label="runResult.failure ? t('learn.goalMissed') : t('learn.goalReached')"
              data-testid="learn-run-result"
            />
          </div>
          <p
            v-if="!tables"
            class="text-sm text-(--ui-text-muted)"
          >
            {{ t('learn.loadingTables') }}
          </p>
          <div
            v-for="table in tables?.tables ?? []"
            :key="table.name"
          >
            <p class="mb-1 flex items-center gap-1 text-sm font-semibold">
              <UIcon
                name="i-lucide-table"
                class="text-(--ui-text-muted)"
              />
              {{ table.name }}
              <span class="font-normal text-(--ui-text-muted)">· {{ t('database.rows', { count: table.rows.length }, table.rows.length) }}</span>
            </p>
            <SqlResultTable
              :columns="table.columns"
              :rows="table.rows"
            />
          </div>
        </div>
        <div
          class="shrink-0 overflow-y-auto border-t border-(--ui-border) p-3 text-sm"
          :class="isSql ? 'max-h-[45%]' : 'max-h-48'"
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
          <!-- SQL: erwartetes bzw. eigenes Ergebnis -->
          <template v-if="isSql">
            <div
              v-if="showGoal && goal?.result"
              data-testid="learn-goal-result"
            >
              <p class="mb-1 text-xs font-semibold text-(--ui-text-muted)">
                {{ t('learn.goalResult') }}
              </p>
              <SqlResultTable
                :columns="goal.result.columns"
                :rows="goal.result.rows"
              />
            </div>
            <template v-else>
              <p
                v-if="!sqlResults.length && !errorMessage"
                class="text-(--ui-text-muted)"
              >
                {{ t('learn.noResultYet') }}
              </p>
              <div
                v-for="(item, i) in sqlResults"
                :key="i"
                class="mb-3"
                data-testid="sql-result"
              >
                <p
                  v-if="!item.columns.length"
                  class="text-(--ui-text-muted)"
                >
                  <UIcon
                    name="i-lucide-check"
                    class="me-1 align-middle text-(--ui-success)"
                  />
                  {{ item.changes ? t('database.changed', { count: item.changes }, item.changes) : t('database.ok') }}
                </p>
                <template v-else>
                  <p class="mb-1 text-xs text-(--ui-text-muted)">
                    {{ t('database.rows', { count: item.rows.length }, item.rows.length) }}
                  </p>
                  <SqlResultTable
                    :columns="item.columns"
                    :rows="item.rows"
                  />
                </template>
              </div>
            </template>
          </template>
          <pre
            v-else
            class="whitespace-pre-wrap font-mono text-xs"
            data-testid="output"
          >{{ snapshot.output.join('\n') || t('editor.noOutput') }}</pre>
        </div>
      </section>
    </div>
  </div>
</template>
