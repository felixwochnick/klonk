<script setup lang="ts">
import type { GeneratedProgram } from '~/utils/blocks/generator'
import { translate } from '@klonk/klonk-script'
import { findModule } from '@klonk/learn'
import { World, type WorldData } from '@klonk/world'
import { databaseEngine } from '~/utils/project-fs'
import { ProgramRunner, type RunLanguage, type RunnerSnapshot } from '@klonk/runtime'
import RunnerWorker from '@klonk/runtime/worker?worker'

const { t, te, locale } = useI18n()
const toast = useToast()
useSeoMeta({ title: () => t('editor.title') })

const program = useProgram()
const proj = useProject()
const inProject = computed(() => !!proj.project.value)
const showProject = ref(false)
watch(inProject, (open) => {
  if (open) showProject.value = true
})

const KIND_LANGUAGE = { blocks: 'blocks', klonk: 'klonk', javascript: 'javascript', typescript: 'typescript', python: 'python', java: 'java', csharp: 'csharp' } as const
/** Im Projekt: Datei der passenden Art geöffnet? (Welten/Sonstiges sind keine Programme) */
const isDesign = computed(() => inProject.value && proj.kind.value === 'design')
/** SQL-Abfrage (`.sql`) bzw. Datenbankdatei: eigene Ansichten, „Ausführen“ führt SQL aus */
const isSql = computed(() => inProject.value && proj.kind.value === 'sql')
const isDatabase = computed(() => inProject.value && proj.kind.value === 'database')
const hasDocument = computed(() => !inProject.value || (!!proj.kind.value && proj.kind.value in KIND_LANGUAGE))

// Dokument: Projektdatei oder (ohne Projekt) das im Browser gemerkte Programm
const language = computed<ProgramLanguage>({
  get: () => (inProject.value ? KIND_LANGUAGE[proj.kind.value as keyof typeof KIND_LANGUAGE] ?? 'klonk' : program.language.value),
  set: (value) => {
    program.language.value = value
  },
})
const source = computed({
  get: () => (inProject.value ? proj.content.value : program.source.value),
  set: (value: string) => {
    if (inProject.value) proj.update(value)
    else program.source.value = value
  },
})
const breakpoints = computed({
  get: () => (inProject.value ? proj.breakpoints.value : program.breakpoints.value),
  set: (value: number[]) => {
    if (inProject.value) proj.breakpoints.value = value
    else program.breakpoints.value = value
  },
})
function translateTo(target: 'de' | 'en') {
  try {
    source.value = translate(source.value, target)
    return true
  }
  catch {
    return false
  }
}
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
const { start, loadData } = useWorldEditor()
const databases = useDatabases()
const { can, maxCharacters } = useLicense()

// Startwelt: aus dem Projekt (falls gewählt) oder die im Welt-Editor gemerkte
const projectWorld = shallowRef<WorldData | null>(null)
async function loadProjectWorld() {
  try {
    projectWorld.value = await proj.readWorld()
  }
  catch {
    projectWorld.value = null
    toast.add({ title: t('project.errors.invalidWorld'), color: 'error' })
  }
  if (!running.value) resetWorld()
}
watch([proj.worldPath, proj.project], loadProjectWorld)
// Projekt kann schon offen sein (z. B. aus dem Explorer kommend)
onMounted(() => proj.project.value && loadProjectWorld())
const startData = () => projectWorld.value ?? start.value.toJSON()

// Angezeigte Welt: Kopie der Startwelt, auf der das Programm läuft
const world = shallowRef(new World(start.value.toJSON()))
const speed = ref(300)

const snapshot = ref<RunnerSnapshot>({ state: 'idle', line: null, pausedRange: null, variables: {}, output: [], error: null })
let runner: ProgramRunner | undefined
onMounted(() => {
  runner = new ProgramRunner(() => new RunnerWorker(), (s) => {
    snapshot.value = s
  })
  // Programme speichern Designs ins Projekt (saveDesign)
  runner.onSaveDesign = (name, design) => {
    proj.writeDesign(name, design).catch(() => toast.add({ title: t('project.errors.generic'), color: 'error' }))
  }
  // Datenbanken des Projekts und temporäre (Database.open/memory)
  runner.onDatabase = databases.answer
})
onBeforeUnmount(() => runner?.dispose())

const running = computed(() => snapshot.value.state === 'running' || snapshot.value.state === 'paused')
const paused = computed(() => snapshot.value.state === 'paused')
const errorMessage = computed(() => {
  const error = snapshot.value.error
  return error ? scriptErrorMessage(t, te, error.code, error.params) : null
})

// Bibliotheken des Projekts für die Prüfung im Editor (Compiler sollen eigene Klassen/Module kennen)
const checkFiles = shallowRef<Record<string, string>>({})
watch([proj.currentPath, proj.files], async () => {
  // Editor sieht die Projektdateien immer (Vorschläge, Prüfung); ausführen lassen sie sich nur mit Lizenz
  checkFiles.value = inProject.value ? await proj.importableFiles().catch(() => ({})) : {}
}, { immediate: true })

// „Fehler in Zeile …“ anklicken ⇒ Zeile im Editor zeigen
const codeEditor = useTemplateRef<{ revealLine: (line: number) => void, insertText: (text: string) => void, replaceAll: (text: string) => void }>('codeEditor')
const errorLine = computed(() => (snapshot.value.state === 'error' ? snapshot.value.error?.range?.line ?? null : null))

function resetWorld() {
  world.value = new World(startData())
  worldFromSql.value = false
}

async function run(pauseOnStart = false) {
  if (isSql.value || isDatabase.value) return runSql()
  if (!runner) return
  databases.beginRun()
  // Beim Ausführen die Welt zeigen
  rightTab.value = 'world'
  resetWorld()
  // Bibliotheken: Klonk-Script-/Python-Dateien des Projekts (nur mit Lizenz)
  // Projektdateien immer mitgeben: genutzt werden sie nur mit Lizenz, ohne erkennt der Runner den Grund für Fehler
  const files = inProject.value ? await proj.importableFiles() : {}
  // Eigene Designs für erstelle/Klonk.create nur mit Lizenz
  const designs = inProject.value && can('models') ? await proj.readDesigns() : {}
  runner.run(world.value, {
    // Ohne Lizenz keine eigenen Designs (auch nicht als JSON im Programm)
    designs: can('models') ? designs : undefined,
    saveDesigns: inProject.value && can('models'),
    maxCharacters: maxCharacters.value,
    language: runLanguage.value,
    source: runSource.value,
    path: inProject.value ? proj.currentPath.value ?? undefined : undefined,
    breakpoints: runBreakpoints.value,
    delay: speed.value,
    allowImports: can('libraries'),
    files,
    pauseOnStart,
  })
}

function stepOrStart() {
  if (paused.value) runner?.step()
  else if (!running.value) run(true)
}

// SQL: Abfrage auf eine Projektdatenbank oder die Welt (Ziel je Datei gemerkt)
const sqlView = useTemplateRef<{ run: () => Promise<void> }>('sqlView')
function runSql() {
  rightTab.value = 'world'
  return sqlView.value?.run()
}
const sqlTargets = computed(() => [
  ...proj.databaseFiles.value.map(f => ({ value: f.path, label: f.path, engine: databaseEngine(f.path) ?? 'sqlite' as const })),
  { value: 'world:sqlite', label: t('database.worldTarget', { engine: t('database.engines.sqlite') }), engine: 'sqlite' as const },
  { value: 'world:postgres', label: t('database.worldTarget', { engine: t('database.engines.postgres') }), engine: 'postgres' as const },
])
const sqlTargetKey = computed(() => `klonk:sql-target:${proj.currentPath.value}`)
const sqlTarget = ref<string | null>(null)
watch(sqlTargetKey, (key) => {
  try {
    sqlTarget.value = localStorage.getItem(key)
  }
  catch {
    sqlTarget.value = null
  }
}, { immediate: true })
watch(sqlTarget, (value) => {
  try {
    if (value) localStorage.setItem(sqlTargetKey.value, value)
  }
  catch {
    // z. B. privater Modus
  }
})
/** Welt per SQL geändert ⇒ anzeigen; auf Wunsch als Startwelt übernehmen */
const worldFromSql = ref(false)
function onSqlWorld(data: WorldData) {
  world.value = new World(data)
  worldFromSql.value = true
}
async function keepSqlWorld() {
  const data = world.value.toJSON()
  try {
    if (inProject.value && proj.worldPath.value) {
      await proj.writeWorld(proj.worldPath.value, data)
      projectWorld.value = data
    }
    else if (!loadData(data)) return
    worldFromSql.value = false
    toast.add({ title: t('database.worldKept'), color: 'success' })
  }
  catch {
    toast.add({ title: t('project.errors.generic'), color: 'error' })
  }
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

const translateItems = computed(() => [[
  { label: 'Deutsch', onSelect: () => translateTo('de') || toast.add({ title: t('editor.translateFailed'), color: 'error' }) },
  { label: 'English', onSelect: () => translateTo('en') || toast.add({ title: t('editor.translateFailed'), color: 'error' }) },
]])

// Tastenkürzel wie in üblichen IDEs
function onKey(event: KeyboardEvent) {
  if (event.key === 'F5') {
    event.preventDefault()
    if (isSql.value || isDatabase.value) void runSql()
    else if (event.shiftKey) stop()
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

// Fehlerkasten: zur Zeile springen, vom KI-Assistenten erklären lassen
const errorActions = computed(() => [
  ...(errorLine.value && !isBlocks.value ? [{ label: t('editor.showErrorLine'), icon: 'i-lucide-locate', variant: 'outline' as const, color: 'error' as const, size: 'xs' as const, onClick: () => codeEditor.value?.revealLine(errorLine.value!) }] : []),
  ...(ai.enabled.value ? [{ label: t('ai.explainError'), icon: 'i-lucide-sparkles', variant: 'outline' as const, color: 'error' as const, size: 'xs' as const, onClick: explainError }] : []),
])

// Code in voller Breite (z. B. auf dem Tablet): Projekt und Welt ausblenden, Ausgabe kompakt unter dem Code
const focus = ref(false)
function toggleFocus() {
  focus.value = !focus.value
}

// Rechts: 3D-Welt, Kurzreferenz der Sprache oder KI-Assistent (die Welt bleibt dabei geladen)
const rightTab = ref<'world' | 'docs' | 'ai'>('world')

// Datei aus einem Lernmodul (Aufgabenordner): Hinweis mit Link in die Lernansicht, wo geprüft wird
const learnManifest = shallowRef<{ module: string, tasks: Record<string, string> } | null>(null)
watch([proj.project, proj.files], async () => {
  const text = inProject.value ? await proj.project.value!.read('klonk.json').catch(() => null) : null
  try {
    const learn = (JSON.parse(text ?? '') as { learn?: { module?: unknown, tasks?: Record<string, string> } }).learn
    learnManifest.value = typeof learn?.module === 'string' ? { module: learn.module, tasks: learn.tasks ?? {} } : null
  }
  catch {
    learnManifest.value = null
  }
}, { immediate: true })
const learnTask = computed(() => {
  const manifest = learnManifest.value
  const path = proj.currentPath.value
  if (!manifest || !path) return null
  const module = findModule(manifest.module)
  const entry = Object.entries(manifest.tasks).find(([, program]) => program.includes('/') && path.startsWith(`${program.slice(0, program.lastIndexOf('/'))}/`))
  const task = entry && module?.tasks.find(x => x.id === entry[0])
  return module && task ? { module, task } : null
})
const ai = useAi()
const rightTabs = computed(() => (ai.enabled.value ? ['world', 'docs', 'ai'] as const : ['world', 'docs'] as const))
const TAB_ICONS = { world: 'i-lucide-boxes', docs: 'i-lucide-book-open', ai: 'i-lucide-sparkles' }

/** Kontext für den KI-Assistenten: Sprache, API-Referenz, Code mit Zeilennummern, letzter Fehler, Ausgabe */
function aiContext() {
  const lang = locale.value === 'en' ? 'en' : 'de'
  const code = runSource.value.split('\n').map((line, i) => `${String(i + 1).padStart(3)} | ${line}`).join('\n')
  const parts = [
    `Language: ${t(`editor.languages.${language.value}`)}${isBlocks.value ? ' (Blockly blocks, shown as generated Klonk-Script)' : ''}`,
    inProject.value && proj.currentPath.value ? `File: ${proj.currentPath.value}` : '',
    `API reference:\n${languageReferenceText(language.value, lang)}`,
    `Current program (line numbers added):\n${code}`,
    errorMessage.value ? `Last error${snapshot.value.error?.range ? ` in line ${snapshot.value.error.range.line}` : ''}: ${errorMessage.value}` : '',
    snapshot.value.output.length ? `Program output (last lines):\n${snapshot.value.output.slice(-20).join('\n')}` : '',
  ]
  return parts.filter(Boolean).join('\n\n')
}

function explainError() {
  rightTab.value = 'ai'
  void ai.ask(t('ai.explainPrompt'), aiContext())
}

// Fenstergrößen (ab lg): Trenner ziehen wie in Code-Editoren, im Browser gemerkt
const LAYOUT_KEY = 'klonk:layout'
const panes = ref({ project: 256, code: 0, output: 224 })
const panesRow = ref<HTMLElement>()
const worldColumn = ref<HTMLElement>()
onMounted(() => {
  try {
    Object.assign(panes.value, JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}'))
  }
  catch {
    // ungültig ⇒ Standard
  }
  // Ohne gemerkte Breite: Code und Welt teilen sich den Platz
  if (!panes.value.code && panesRow.value) panes.value.code = Math.round((panesRow.value.clientWidth - (showProject.value ? panes.value.project : 0)) / 2)
})
const clamp = (value: number, min: number, max: number) => Math.round(Math.min(Math.max(value, min), Math.max(min, max)))
function resizeProject(delta: number) {
  panes.value.project = clamp(panes.value.project + delta, 180, 480)
}
function resizeCode(delta: number) {
  const row = panesRow.value?.clientWidth ?? 1200
  panes.value.code = clamp(panes.value.code + delta, 280, row - (showProject.value ? panes.value.project : 0) - 320)
}
function resizeOutput(delta: number) {
  panes.value.output = clamp(panes.value.output - delta, 80, (worldColumn.value?.clientHeight ?? 600) - 160)
}
function savePanes() {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(panes.value))
  }
  catch {
    // z. B. privater Modus
  }
}
const paneStyle = computed(() => ({
  '--pane-project': `${panes.value.project}px`,
  '--pane-code': panes.value.code ? `${panes.value.code}px` : '50%',
  '--pane-output': `${panes.value.output}px`,
}))
</script>

<template>
  <div
    class="flex h-[calc(100dvh-var(--ui-header-height))] flex-col"
    data-testid="ide"
    :data-focus="focus"
  >
    <!-- Werkzeugleiste -->
    <div class="flex flex-wrap items-center gap-2 border-b border-(--ui-border) px-3 py-2">
      <UTooltip :text="t('project.title')">
        <UButton
          :icon="showProject ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
          variant="ghost"
          color="neutral"
          :aria-label="t('project.title')"
          data-testid="toggle-project"
          @click="showProject = !showProject"
        />
      </UTooltip>
      <UButton
        v-if="!running"
        icon="i-lucide-play"
        :label="t('editor.run')"
        :disabled="!hasDocument && !isSql && !isDatabase"
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
          :disabled="running || inProject"
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
        <UTooltip :text="focus ? t('editor.focusExit') : t('editor.focus')">
          <UButton
            :icon="focus ? 'i-lucide-columns-2' : 'i-lucide-rectangle-horizontal'"
            variant="ghost"
            color="neutral"
            :aria-label="focus ? t('editor.focusExit') : t('editor.focus')"
            :aria-pressed="focus"
            data-testid="focus-mode"
            @click="toggleFocus"
          />
        </UTooltip>
      </div>
    </div>

    <div
      v-if="learnTask"
      class="flex flex-wrap items-center gap-2 border-b border-(--ui-border) bg-(--ui-bg-muted) px-3 py-1.5 text-sm"
      data-testid="learn-task-hint"
    >
      <UIcon
        name="i-lucide-graduation-cap"
        class="shrink-0 text-(--ui-primary)"
      />
      <span>{{ t('learn.learnTaskHint', { task: learnTask.task.title[locale === 'en' ? 'en' : 'de'], module: learnTask.module.title[locale === 'en' ? 'en' : 'de'] }) }}</span>
      <UButton
        :to="`/learn/${learnTask.module.id}/${learnTask.task.id}`"
        :label="t('learn.openInLearn')"
        trailing-icon="i-lucide-arrow-right"
        size="xs"
        variant="soft"
        class="ms-auto"
        data-testid="learn-task-open"
      />
    </div>

    <div
      ref="panesRow"
      class="flex min-h-0 flex-1 flex-col lg:flex-row"
      :style="paneStyle"
    >
      <!-- Projekt -->
      <template v-if="showProject && !focus">
        <aside
          class="shrink-0 border-b border-(--ui-border) lg:w-(--pane-project) lg:border-b-0"
          data-testid="project-pane"
        >
          <ClientOnly>
            <ProjectPanel />
          </ClientOnly>
        </aside>
        <SplitHandle
          orientation="vertical"
          :label="t('editor.resizeProject')"
          data-testid="split-project"
          @move="resizeProject"
          @end="savePanes"
        />
      </template>

      <!-- Code -->
      <section
        class="flex min-h-64 flex-1 flex-col"
        :class="focus ? '' : 'lg:w-(--pane-code) lg:max-w-[calc(100%-20rem)] lg:flex-none'"
        data-testid="code-pane"
      >
        <ClientOnly v-if="isDesign">
          <DesignEditor v-model="source" />
        </ClientOnly>
        <ClientOnly v-else-if="isDatabase">
          <DatabaseEditor
            ref="sqlView"
            :path="proj.currentPath.value!"
          />
        </ClientOnly>
        <ClientOnly v-else-if="isSql">
          <SqlConsole
            ref="sqlView"
            v-model="source"
            v-model:target="sqlTarget"
            :targets="sqlTargets"
            :world="() => world.toJSON()"
            :path="proj.currentPath.value"
            :read-only="proj.readOnly.value"
            @world="onSqlWorld"
          />
        </ClientOnly>
        <div
          v-else-if="!hasDocument"
          class="flex flex-1 items-center justify-center p-6 text-center text-(--ui-text-muted)"
          data-testid="no-document"
        >
          {{ t('project.noDocument') }}
        </div>
        <ClientOnly v-else-if="isBlocks">
          <div class="relative min-h-0 flex-1">
            <KlonkBlocks
              v-model="source"
              :read-only="running || proj.readOnly.value"
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
        <ClientOnly v-if="hasDocument && !isBlocks">
          <KlonkEditor
            ref="codeEditor"
            v-model="source"
            v-model:breakpoints="breakpoints"
            :language="runLanguage"
            :read-only="running || proj.readOnly.value"
            :active-line="running ? snapshot.line : null"
            :error-line="errorLine"
            :error-message="errorMessage"
            :files="checkFiles"
            :path="inProject ? proj.currentPath.value : null"
          />
        </ClientOnly>
        <!-- Vollbild: kompakte Ausgabe unter dem Code -->
        <div
          v-if="focus && snapshot.state !== 'idle'"
          class="max-h-36 shrink-0 overflow-y-auto border-t border-(--ui-border) px-3 py-2 text-xs"
          data-testid="focus-output"
        >
          <div class="mb-1 flex items-center gap-2">
            <UBadge
              :color="snapshot.state === 'error' ? 'error' : snapshot.state === 'done' ? 'success' : 'neutral'"
              variant="subtle"
              size="sm"
              :label="t(`editor.state.${snapshot.state}`)"
            />
            <span
              v-if="errorMessage"
              class="text-(--ui-error)"
            >{{ snapshot.error?.range ? t('editor.errorAt', { line: snapshot.error.range.line }) + ': ' : '' }}{{ errorMessage }}</span>
          </div>
          <pre class="whitespace-pre-wrap font-mono">{{ snapshot.output.join('\n') }}</pre>
        </div>
      </section>

      <SplitHandle
        v-if="!focus"
        orientation="vertical"
        :label="t('editor.resizeCode')"
        data-testid="split-code"
        @move="resizeCode"
        @end="savePanes"
      />

      <!-- Welt + Ausgabe -->
      <section
        v-show="!focus"
        ref="worldColumn"
        class="flex min-h-0 min-w-0 flex-1 flex-col border-t border-(--ui-border) lg:border-t-0"
      >
        <div
          class="flex items-center gap-1 border-b border-(--ui-border) px-2 py-1"
          role="tablist"
        >
          <UButton
            v-for="tab in rightTabs"
            :key="tab"
            role="tab"
            size="xs"
            :aria-selected="rightTab === tab"
            :variant="rightTab === tab ? 'soft' : 'ghost'"
            :color="rightTab === tab ? 'primary' : 'neutral'"
            :icon="TAB_ICONS[tab]"
            :label="t(`editor.tabs.${tab}`)"
            :data-testid="`tab-${tab}`"
            @click="rightTab = tab"
          />
        </div>
        <div
          v-if="rightTab === 'docs'"
          class="min-h-64 flex-1"
        >
          <LanguageDocs :language="language" />
        </div>
        <div
          v-if="rightTab === 'ai' && ai.enabled.value"
          class="min-h-64 flex-1"
        >
          <AiChat
            :context="aiContext"
            :can-apply="hasDocument && !isBlocks && !isDesign && !running && !proj.readOnly.value"
            @insert="code => codeEditor?.insertText(code)"
            @replace="code => codeEditor?.replaceAll(code)"
          />
        </div>
        <div
          v-show="rightTab === 'world'"
          class="relative min-h-64 flex-1 bg-(--ui-bg-muted)"
        >
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
          <div
            v-if="worldFromSql && !running"
            class="absolute right-3 top-3 flex items-center gap-2 rounded-md bg-(--ui-bg)/90 px-2 py-1 text-xs shadow"
            data-testid="sql-world-changed"
          >
            <span>{{ t('database.worldChanged') }}</span>
            <UButton
              size="xs"
              icon="i-lucide-save"
              :label="t('database.keepWorld')"
              data-testid="sql-keep-world"
              @click="keepSqlWorld"
            />
          </div>
        </div>

        <SplitHandle
          orientation="horizontal"
          :label="t('editor.resizeOutput')"
          data-testid="split-output"
          @move="resizeOutput"
          @end="savePanes"
        />
        <div
          class="h-56 shrink-0 overflow-y-auto border-t border-(--ui-border) p-3 text-sm lg:h-(--pane-output) lg:border-t-0"
          data-testid="output-pane"
        >
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="subtle"
            icon="i-lucide-octagon-alert"
            :title="snapshot.error?.range ? t('editor.errorAt', { line: snapshot.error.range.line }) : t('editor.error')"
            :description="errorMessage"
            :actions="errorActions"
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
