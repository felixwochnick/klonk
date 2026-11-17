<script setup lang="ts">
import { World, type WorldData } from '@klonk/world'
import { databaseEngine } from '~/utils/project-fs'

// Datenbanken: SQL-Abfragen (`.sql`) und Datenbankdateien des Projekts mit eigenen Tabs – getrennt von der IDE,
// damit es dort nur ein „Ausführen“ (für Programme) gibt und hier nur das SQL-Ausführen
const { t } = useI18n()
const toast = useToast()
useSeoMeta({ title: () => t('databases.title') })

const proj = useProject()
const { project, dbPath, dbTabs, dbKind } = proj
const isSql = computed(() => dbKind.value === 'sql')
const isDatabase = computed(() => dbKind.value === 'database')

const source = computed({
  get: () => proj.dbContent.value,
  set: (value: string) => proj.updateDb(value),
})

// Ziel einer Abfrage: Projektdatenbank oder die Welt (je Datei im Browser gemerkt)
const sqlTargets = computed(() => [
  ...proj.databaseFiles.value.map(f => ({ value: f.path, label: f.path, engine: databaseEngine(f.path) ?? 'sqlite' as const })),
  { value: 'world:sqlite', label: t('database.worldTarget', { engine: t('database.engines.sqlite') }), engine: 'sqlite' as const },
  { value: 'world:postgres', label: t('database.worldTarget', { engine: t('database.engines.postgres') }), engine: 'postgres' as const },
])
const sqlTargetKey = computed(() => `klonk:sql-target:${dbPath.value}`)
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
/** Abfrage läuft auf der Welt ⇒ Welt rechts zeigen (ohne gewähltes Ziel nimmt die Konsole das erste) */
const onWorld = computed(() => isSql.value && (sqlTarget.value ?? sqlTargets.value[0]?.value ?? '').startsWith('world:'))

// Welt: wie zuletzt in der IDE angezeigt (nach einem Programmlauf), sonst Projektwelt bzw. die im Welt-Editor gemerkte;
// per SQL geändert ⇒ auf Wunsch als Startwelt übernehmen
const { start, loadData } = useWorldEditor()
const shownWorld = useShownWorld()
const projectWorld = shallowRef<WorldData | null>(null)
const world = shallowRef(new World(shownWorld.value ?? start.value.toJSON()))
const worldFromSql = ref(false)
async function loadWorld(keepShown: boolean) {
  try {
    projectWorld.value = await proj.readWorld()
  }
  catch {
    projectWorld.value = null
    toast.add({ title: t('project.errors.invalidWorld'), color: 'error' })
  }
  if (!keepShown) shownWorld.value = null
  world.value = new World(shownWorld.value ?? projectWorld.value ?? start.value.toJSON())
  worldFromSql.value = false
}
watch([proj.worldPath, project], () => loadWorld(false))
onMounted(() => project.value && loadWorld(true))

function onSqlWorld(data: WorldData) {
  world.value = new World(data)
  shownWorld.value = data
  worldFromSql.value = true
}
async function keepSqlWorld() {
  const data = world.value.toJSON()
  try {
    if (project.value && proj.worldPath.value) {
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
function resetWorld() {
  shownWorld.value = null
  world.value = new World(projectWorld.value ?? start.value.toJSON())
  worldFromSql.value = false
}

const sqlView = useTemplateRef<{ run: () => Promise<void> }>('sqlView')

// Strg+S speichert (Umschalt: alle), F5 führt aus
function onKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (!project.value) return
    if (event.shiftKey) void proj.saveAll()
    else if (dbPath.value) void proj.savePath(dbPath.value)
  }
  else if (event.key === 'F5') {
    event.preventDefault()
    void sqlView.value?.run()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const showProject = ref(true)
</script>

<template>
  <div
    class="flex h-[calc(100dvh-var(--ui-header-height))] flex-col lg:flex-row"
    data-testid="databases-page"
  >
    <aside
      v-if="showProject"
      class="max-h-72 shrink-0 overflow-y-auto border-b border-(--ui-border) lg:max-h-none lg:w-72 lg:border-e lg:border-b-0"
      data-testid="project-pane"
    >
      <ClientOnly>
        <ProjectPanel />
      </ClientOnly>
    </aside>

    <section class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div class="flex items-center border-b border-(--ui-border) bg-(--ui-bg-muted)">
        <UTooltip :text="t('project.title')">
          <UButton
            :icon="showProject ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
            variant="ghost"
            color="neutral"
            class="m-1 shrink-0"
            :aria-label="t('project.title')"
            data-testid="toggle-project"
            @click="showProject = !showProject"
          />
        </UTooltip>
        <ClientOnly>
          <EditorTabs
            v-if="dbTabs.length"
            class="min-w-0 flex-1 border-b-0!"
            :tabs="dbTabs"
            :active="dbPath"
            :unsaved="proj.unsaved.value"
            @select="path => proj.select(path)"
            @close="path => proj.closeTab(path)"
            @close-others="path => proj.closeTabs({ keep: path, databases: true })"
            @close-right="path => proj.closeTabs({ rightOf: path, databases: true })"
            @close-all="proj.closeTabs({ databases: true })"
            @move="(path, before) => proj.moveTab(path, before)"
          />
        </ClientOnly>
      </div>
      <ClientOnly>
        <LearnTaskHint :path="dbPath" />
      </ClientOnly>

      <ClientOnly>
        <div
          v-if="!project || !dbPath"
          class="m-auto flex max-w-md flex-col items-center gap-3 p-6 text-center"
          data-testid="databases-empty"
        >
          <UIcon
            name="i-lucide-database"
            class="size-16 text-(--ui-text-dimmed)"
          />
          <p class="text-lg font-semibold">
            {{ t('databases.title') }}
          </p>
          <p class="text-(--ui-text-muted)">
            {{ project ? t('databases.noFile') : t('databases.noProject') }}
          </p>
        </div>
        <div
          v-else
          class="flex min-h-0 flex-1 flex-col lg:flex-row"
        >
          <DatabaseEditor
            v-if="isDatabase"
            :key="dbPath"
            ref="sqlView"
            :path="dbPath"
          />
          <SqlConsole
            v-else-if="isSql"
            ref="sqlView"
            v-model="source"
            v-model:target="sqlTarget"
            :targets="sqlTargets"
            :world="() => world.toJSON()"
            :path="dbPath"
            :read-only="proj.readOnly.value"
            @world="onSqlWorld"
            @run="proj.saveAll()"
          />
          <!-- Abfrage auf die Welt: Welt daneben zeigen -->
          <div
            v-if="onWorld"
            class="relative min-h-64 shrink-0 border-t border-(--ui-border) bg-(--ui-bg-muted) lg:w-[40%] lg:border-s lg:border-t-0"
            data-testid="sql-world"
          >
            <KlonkWorld :world="world" />
            <div class="absolute right-3 top-3 flex items-center gap-2">
              <div
                v-if="worldFromSql"
                class="flex items-center gap-2 rounded-md bg-(--ui-bg)/90 px-2 py-1 text-xs shadow"
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
              <UTooltip :text="t('editor.reset')">
                <UButton
                  size="xs"
                  icon="i-lucide-undo-2"
                  color="neutral"
                  variant="outline"
                  :aria-label="t('editor.reset')"
                  data-testid="sql-world-reset"
                  @click="resetWorld"
                />
              </UTooltip>
            </div>
          </div>
        </div>
      </ClientOnly>
    </section>
  </div>
</template>
