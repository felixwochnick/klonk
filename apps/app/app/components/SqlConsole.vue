<script setup lang="ts">
import { SqlError, WorldSqlError, type SqlEngineName, type SqlResult, type SqlTable } from '@klonk/runtime'
import type { WorldData } from '@klonk/world'

/** Ziel einer Abfrage: Projektdatenbank (Pfad) oder die Welt (`world:sqlite` / `world:postgres`) */
export type SqlTarget = { value: string, label: string, engine: SqlEngineName }

// SQL-Editor mit Datenbankauswahl und Ergebnistabellen – für `.sql`-Dateien und den Datenbank-Editor
const props = withDefaults(defineProps<{
  targets: SqlTarget[]
  /** Angezeigte Welt (für Abfragen auf die Welt) – als Funktion, die Welt ändert sich ohne Vue-Reaktivität */
  world?: (() => WorldData) | null
  /** Pfad der Datei im Projekt (Editor-Modell) */
  path?: string | null
  readOnly?: boolean
}>(), { world: null, path: null, readOnly: false })

const source = defineModel<string>({ required: true })
const target = defineModel<string | null>('target', { default: null })
const emit = defineEmits<{ world: [data: WorldData] }>()

const { t } = useI18n()
const databases = useDatabases()

const current = computed(() => props.targets.find(x => x.value === target.value) ?? props.targets[0] ?? null)
const worldEngine = (value: string) => (value.startsWith('world:') ? value.slice(6) as SqlEngineName : null)

const results = shallowRef<SqlResult[]>([])
const error = ref<{ message: string, line: number | null } | null>(null)
const running = ref(false)
const ran = ref(false)

// Tabellen der gewählten Datenbank (Vorschläge im Editor)
const tables = shallowRef<SqlTable[]>([])
async function loadTables() {
  const selected = current.value
  if (!selected) return
  const engine = worldEngine(selected.value)
  try {
    if (engine) tables.value = props.world ? await databases.worldTables(engine, props.world()) : []
    else tables.value = await databases.tables(selected.value)
  }
  catch {
    tables.value = []
  }
}
watch([() => current.value?.value, databases.version], loadTables, { immediate: true })

const editor = useTemplateRef<{ revealLine: (line: number) => void, selectedText: () => string }>('editor')

/** Ausführen: markierter Text oder alles */
async function run() {
  const selected = current.value
  if (!selected || running.value) return
  const sql = editor.value?.selectedText() || source.value
  if (!sql.trim()) return
  running.value = true
  error.value = null
  try {
    const engine = worldEngine(selected.value)
    if (engine) {
      if (!props.world) return
      const answer = await databases.runWorld(engine, props.world(), sql)
      results.value = answer.results
      if (answer.world) emit('world', answer.world)
    }
    else {
      results.value = await databases.run(selected.value, sql)
    }
    void loadTables()
  }
  catch (e) {
    if (e instanceof WorldSqlError) {
      error.value = { message: t(`database.worldErrors.${e.code}`, e.params), line: null }
    }
    else if (e instanceof SqlError) {
      results.value = e.results
      error.value = { message: e.message, line: e.line }
      const changed = (e as SqlError & { world?: WorldData | null }).world
      if (changed) emit('world', changed)
    }
    else {
      error.value = { message: String((e as Error)?.message ?? e), line: null }
    }
  }
  finally {
    running.value = false
    ran.value = true
  }
}

defineExpose({ run, running })

const display = (value: unknown) => (value === null ? null : typeof value === 'object' ? JSON.stringify(value) : String(value))
const errorActions = computed(() => (error.value?.line
  ? [{ label: t('editor.showErrorLine'), icon: 'i-lucide-locate', variant: 'outline' as const, color: 'error' as const, size: 'xs' as const, onClick: () => editor.value?.revealLine(error.value!.line!) }]
  : []))
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col"
    data-testid="sql-console"
  >
    <div class="flex flex-wrap items-center gap-2 border-b border-(--ui-border) px-3 py-2">
      <USelect
        v-if="targets.length > 1"
        :model-value="current?.value"
        :items="targets"
        icon="i-lucide-database"
        class="w-60"
        :aria-label="t('database.target')"
        data-testid="sql-target"
        @update:model-value="target = $event as string"
      />
      <UBadge
        v-else-if="current"
        :label="t(`database.engines.${current.engine}`)"
        variant="subtle"
        color="neutral"
        icon="i-lucide-database"
      />
      <UButton
        icon="i-lucide-play"
        :label="t('database.run')"
        :loading="running"
        :disabled="!current"
        data-testid="sql-run"
        @click="run"
      />
      <span class="text-xs text-(--ui-text-dimmed)">{{ t('database.runHint') }}</span>
    </div>

    <div class="relative min-h-40 flex-1">
      <ClientOnly>
        <KlonkEditor
          ref="editor"
          v-model="source"
          class="absolute inset-0"
          :language="current?.engine === 'postgres' ? 'pgsql' : 'sql'"
          :read-only="readOnly"
          :path="path"
          :sql-tables="tables"
          @run="run"
        />
      </ClientOnly>
    </div>

    <div
      class="h-[45%] min-h-32 shrink-0 overflow-auto border-t border-(--ui-border) p-3 text-sm"
      data-testid="sql-results"
    >
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-octagon-alert"
        :title="error.line ? t('database.errorAt', { line: error.line }) : t('database.error')"
        :description="error.message"
        :actions="errorActions"
        class="mb-3"
        data-testid="sql-error"
      />
      <p
        v-if="!ran"
        class="text-(--ui-text-muted)"
      >
        {{ current ? t('database.noResults') : t('database.noDatabase') }}
      </p>
      <p
        v-else-if="!results.length && !error"
        class="text-(--ui-text-muted)"
      >
        {{ t('database.ok') }}
      </p>
      <div
        v-for="(result, i) in results"
        :key="i"
        class="mb-4"
        data-testid="sql-result"
      >
        <p
          v-if="!result.columns.length"
          class="text-(--ui-text-muted)"
          data-testid="sql-changes"
        >
          <UIcon
            name="i-lucide-check"
            class="me-1 align-middle text-(--ui-success)"
          />
          {{ result.changes ? t('database.changed', { count: result.changes }, result.changes) : t('database.ok') }}
        </p>
        <template v-else>
          <p class="mb-1 text-xs text-(--ui-text-muted)">
            {{ t('database.rows', { count: result.rows.length }, result.rows.length) }}
            <span v-if="result.truncated">· {{ t('database.truncated', { count: result.rows.length }) }}</span>
          </p>
          <div class="overflow-x-auto rounded-md border border-(--ui-border)">
            <table class="w-full font-mono text-xs">
              <thead class="bg-(--ui-bg-elevated)">
                <tr>
                  <th
                    v-for="(column, c) in result.columns"
                    :key="c"
                    class="whitespace-nowrap px-2 py-1 text-start font-semibold"
                  >
                    {{ column }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, r) in result.rows"
                  :key="r"
                  class="border-t border-(--ui-border)"
                >
                  <td
                    v-for="(value, c) in row"
                    :key="c"
                    class="max-w-80 truncate whitespace-nowrap px-2 py-0.5"
                    :title="display(value) ?? 'NULL'"
                  >
                    <span
                      v-if="value === null"
                      class="text-(--ui-text-dimmed) italic"
                    >NULL</span>
                    <template v-else>
                      {{ display(value) }}
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
