<script setup lang="ts">
import type { SqlTable } from '@klonk/runtime'
import { databaseEngine, databaseName } from '~/utils/project-fs'

// Datenbankdatei des Projekts: Tabellen mit Spalten links, SQL-Konsole rechts (Änderungen speichert useDatabases)
const props = defineProps<{ path: string }>()

const { t } = useI18n()
const toast = useToast()
const databases = useDatabases()

const engine = computed(() => databaseEngine(props.path) ?? 'sqlite')
const targets = computed(() => [{ value: props.path, label: databaseName(props.path), engine: engine.value }])

// Konsole: Text je Datenbank im Browser gemerkt
const storageKey = computed(() => `klonk:sql:${props.path}`)
const source = ref('')
watch(storageKey, (key) => {
  try {
    source.value = localStorage.getItem(key) ?? ''
  }
  catch {
    source.value = ''
  }
}, { immediate: true })
watch(source, (value) => {
  try {
    localStorage.setItem(storageKey.value, value)
  }
  catch {
    // z. B. privater Modus
  }
})

const tables = shallowRef<SqlTable[]>([])
const loadError = ref<string | null>(null)
const loading = ref(true)
async function load() {
  try {
    tables.value = await databases.tables(props.path)
    loadError.value = null
  }
  catch (error) {
    loadError.value = String((error as Error)?.message ?? error)
  }
  finally {
    loading.value = false
  }
}
watch([() => props.path, databases.version], load, { immediate: true })

/** Ziel eines Fremdschlüssels (Spalte ⇒ Tabelle) */
const foreignTarget = (table: SqlTable, column: string) => table.foreignKeys?.find(fk => fk.columns.includes(column))?.table

const sqlConsole = useTemplateRef<{ run: () => Promise<void> }>('sqlConsole')
const quote = (name: string) => (/^[a-z_][a-z0-9_]*$/i.test(name) ? name : `"${name.replace(/"/g, '""')}"`)
/** Tabelle anklicken ⇒ ihre ersten Zeilen zeigen */
async function showTable(table: SqlTable) {
  source.value = `SELECT * FROM ${quote(table.name)} LIMIT 100;`
  await nextTick()
  await sqlConsole.value?.run()
}

// Rechts: SQL-Konsole oder ER-Diagramm (Tabelle im Diagramm anklicken ⇒ ihre Zeilen in der Konsole)
const view = ref<'sql' | 'er'>('sql')
async function onDiagramTable(name: string) {
  const table = tables.value.find(x => x.name === name)
  if (!table) return
  view.value = 'sql'
  await showTable(table)
}

async function exportFile() {
  await databases.exportSqlite(props.path).catch(() => toast.add({ title: t('project.errors.generic'), color: 'error' }))
}

defineExpose({ run: () => sqlConsole.value?.run() })
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col lg:flex-row"
    data-testid="database-editor"
  >
    <aside class="max-h-56 shrink-0 overflow-y-auto border-b border-(--ui-border) p-3 text-sm lg:max-h-none lg:w-60 lg:border-e lg:border-b-0">
      <div class="mb-2 flex items-center gap-2">
        <UIcon
          name="i-lucide-database"
          class="shrink-0 text-(--ui-primary)"
        />
        <span class="truncate font-semibold">{{ databaseName(path) }}</span>
        <UBadge
          :label="t(`database.engines.${engine}`)"
          variant="subtle"
          color="neutral"
          size="sm"
          class="ms-auto"
        />
      </div>
      <UButton
        v-if="engine === 'sqlite'"
        icon="i-lucide-download"
        variant="ghost"
        color="neutral"
        size="xs"
        block
        class="mb-2 justify-start"
        :label="t('database.export')"
        data-testid="database-export"
        @click="exportFile"
      />
      <p class="mb-1 text-xs font-semibold uppercase text-(--ui-text-muted)">
        {{ t('database.tables') }}
      </p>
      <p
        v-if="loading"
        class="text-(--ui-text-muted)"
      >
        {{ t('database.loading') }}
      </p>
      <UAlert
        v-else-if="loadError"
        color="error"
        variant="subtle"
        :title="t('database.loadFailed')"
        :description="loadError"
      />
      <p
        v-else-if="!tables.length"
        class="text-(--ui-text-muted)"
      >
        {{ t('database.noTables') }}
      </p>
      <ul
        v-else
        class="space-y-2"
      >
        <li
          v-for="table in tables"
          :key="table.name"
          :data-testid="`database-table-${table.name}`"
        >
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-start hover:bg-(--ui-bg-elevated)"
            @click="showTable(table)"
          >
            <UIcon
              :name="table.kind === 'view' ? 'i-lucide-eye' : 'i-lucide-table'"
              class="shrink-0 text-(--ui-text-muted)"
            />
            <span class="truncate font-medium">{{ table.name }}</span>
            <span
              v-if="table.rows !== null"
              class="ms-auto text-xs text-(--ui-text-dimmed)"
            >{{ table.rows }}</span>
          </button>
          <ul class="ms-6 text-xs text-(--ui-text-muted)">
            <li
              v-for="column in table.columns"
              :key="column.name"
              class="flex items-center gap-1"
            >
              <UIcon
                v-if="column.primaryKey"
                name="i-lucide-key-round"
                class="size-3 text-amber-500"
                :aria-label="t('database.primaryKey')"
              />
              <span>{{ column.name }}</span>
              <UIcon
                v-if="foreignTarget(table, column.name)"
                name="i-lucide-arrow-up-right"
                class="size-3 text-(--ui-primary)"
                :title="foreignTarget(table, column.name)"
                :aria-label="t('database.foreignKey', { table: foreignTarget(table, column.name) })"
              />
              <span class="text-(--ui-text-dimmed)">{{ column.type.toLowerCase() }}</span>
            </li>
          </ul>
        </li>
      </ul>
    </aside>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        class="flex items-center gap-1 border-b border-(--ui-border) px-2 py-1"
        role="tablist"
      >
        <UButton
          v-for="tab in (['sql', 'er'] as const)"
          :key="tab"
          role="tab"
          size="xs"
          :aria-selected="view === tab"
          :variant="view === tab ? 'soft' : 'ghost'"
          :color="view === tab ? 'primary' : 'neutral'"
          :icon="tab === 'sql' ? 'i-lucide-terminal' : 'i-lucide-network'"
          :label="t(`database.views.${tab}`)"
          :data-testid="`database-view-${tab}`"
          @click="view = tab"
        />
      </div>
      <SqlConsole
        v-show="view === 'sql'"
        ref="sqlConsole"
        v-model="source"
        :targets="targets"
      />
      <ErDiagram
        v-if="view === 'er'"
        :tables="tables"
        :name="databaseName(path)"
        @table="onDiagramTable"
      />
    </div>
  </div>
</template>
