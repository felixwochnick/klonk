<script setup lang="ts">
import { CODE_LANGUAGES, CUSTOM_LIMITS, DATABASE_NAME, emptyTaskWorld, newTaskId, TRACK_CHECKS, TRACK_CONSTRUCTS, tracksWithDatabases, tracksWithWorlds, type CodeLanguage, type CustomModuleData, type CustomModuleProblem, type CustomTaskData } from '@klonk/learn'

// Eine Aufgabe eines eigenen Lernmoduls: Text und Tipps, Startwelten bzw. Datenbanken, Musterlösung (mit Probelauf) und
// was die Prüfung vergleicht. Verschieben, Duplizieren und Löschen ändern die Liste der Aufgaben im Modul.
const props = defineProps<{ id: string, index: number, problems: CustomModuleProblem[], readOnly?: boolean }>()
const emit = defineEmits<{ select: [index: number | null] }>()
const data = defineModel<CustomModuleData>('data', { required: true })

const { t } = useI18n()
const task = computed(() => data.value.tasks[props.index]!)
const track = computed(() => data.value.track)
const withWorlds = computed(() => tracksWithWorlds(track.value))
const withDatabases = computed(() => tracksWithDatabases(track.value))
const checks = computed(() => TRACK_CHECKS[track.value])

// Aufgaben verschieben, kopieren, löschen
function move(delta: number) {
  const tasks = data.value.tasks
  const to = props.index + delta
  if (to < 0 || to >= tasks.length) return
  tasks.splice(to, 0, tasks.splice(props.index, 1)[0]!)
  emit('select', to)
}
function duplicate() {
  const tasks = data.value.tasks
  if (tasks.length >= CUSTOM_LIMITS.tasks) return
  const copy: CustomTaskData = { ...structuredClone(toRaw(task.value)), id: newTaskId(tasks), title: t('teaching.custom.copyOf', { title: task.value.title }) }
  tasks.splice(props.index + 1, 0, copy)
  emit('select', props.index + 1)
}
function remove() {
  data.value.tasks.splice(props.index, 1)
  emit('select', data.value.tasks.length ? Math.min(props.index, data.value.tasks.length - 1) : null)
}

// Tipps
const addHint = () => task.value.hints.push('')
const removeHint = (i: number) => task.value.hints.splice(i, 1)

// Startwelten: weitere als Kopie der gezeigten (meist nur leicht verändert)
const world = ref(0)
watch(() => [props.index, task.value.worlds.length], () => {
  world.value = Math.min(world.value, Math.max(task.value.worlds.length - 1, 0))
})
function addWorld() {
  const current = task.value.worlds[world.value]
  task.value.worlds.push(current ? structuredClone(toRaw(current)) : emptyTaskWorld())
  world.value = task.value.worlds.length - 1
}
function removeWorld() {
  task.value.worlds.splice(world.value, 1)
  world.value = Math.max(0, world.value - 1)
}

// Datenbanken: SQL je Startsituation
const datasets = ref<number[]>([])
const dataset = (db: number) => Math.min(datasets.value[db] ?? 0, (task.value.databases[db]?.sql.length ?? 1) - 1)
function addDatabase() {
  const n = task.value.databases.length + 1
  task.value.databases.push({ name: `${t('teaching.custom.databaseName')}${n > 1 ? n : ''}`, sql: [''] })
}
function addDataset(db: number) {
  const list = task.value.databases[db]!.sql
  list.push(list[dataset(db)] ?? '')
  datasets.value[db] = list.length - 1
}
function removeDataset(db: number) {
  task.value.databases[db]!.sql.splice(dataset(db), 1)
  datasets.value[db] = Math.max(0, dataset(db) - 1)
}
const validName = (name: string) => DATABASE_NAME.test(name)

// Musterlösung der Programmiersprachen: eine Sprache genügt
const codeLanguage = ref<CodeLanguage>(CODE_LANGUAGES.find(l => task.value.solutions[l]?.trim()) ?? 'python')
watch(() => props.index, () => {
  codeLanguage.value = CODE_LANGUAGES.find(l => task.value.solutions[l]?.trim()) ?? codeLanguage.value
})
const languageItems = computed(() => CODE_LANGUAGES.map(value => ({
  value,
  label: t(`editor.languages.${value}`),
  icon: task.value.solutions[value]?.trim() ? 'i-lucide-circle-check' : undefined,
})))
const codeSolution = computed({
  get: () => task.value.solutions[codeLanguage.value] ?? '',
  set: (value: string) => {
    task.value.solutions[codeLanguage.value] = value
  },
})

// Prüfung
const outputItems = computed(() => (['none', 'numbers', 'lines'] as const).map(value => ({ value, label: t(`teaching.custom.output.${value}`) })))
const resultItems = computed(() => (['none', 'unordered', 'ordered'] as const).map(value => ({ value, label: t(`teaching.custom.result.${value}`) })))
const output = computed({
  get: () => task.value.check.output ?? 'none',
  set: (value: string) => {
    task.value.check.output = value === 'none' ? undefined : value as 'numbers' | 'lines'
  },
})
const result = computed({
  get: () => task.value.check.result ?? 'none',
  set: (value: string) => {
    task.value.check.result = value === 'none' ? undefined : value as 'ordered' | 'unordered'
  },
})
function flag(key: 'position' | 'direction' | 'cells', on: boolean) {
  task.value.check[key] = on || undefined
}
const tables = (key: 'tables' | 'schema') => computed({
  get: () => task.value.check[key] ?? [],
  set: (value: string[]) => {
    task.value.check[key] = value.length ? value : undefined
  },
})
const checkedTables = tables('tables')
const checkedSchema = tables('schema')
const constructItems = computed(() => TRACK_CONSTRUCTS[track.value].map(value => ({ value, label: t(`learn.constructs.${value}`) })))
const characters = computed({
  get: () => task.value.characters ?? null,
  set: (value: number | null) => {
    task.value.characters = value || undefined
  },
})

const problemText = (problem: CustomModuleProblem) => t(`teaching.custom.problems.${problem.code}`)
</script>

<template>
  <div
    class="space-y-6"
    :data-testid="`custom-task-${index}`"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">
        {{ t('teaching.custom.taskNumber', { n: index + 1 }) }}
      </h2>
      <div
        v-if="!readOnly"
        class="flex gap-1"
      >
        <UButton
          icon="i-lucide-arrow-up"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="index === 0"
          :aria-label="t('teaching.custom.moveUp')"
          @click="move(-1)"
        />
        <UButton
          icon="i-lucide-arrow-down"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="index === data.tasks.length - 1"
          :aria-label="t('teaching.custom.moveDown')"
          @click="move(1)"
        />
        <UButton
          icon="i-lucide-copy"
          variant="ghost"
          color="neutral"
          size="sm"
          :label="t('teaching.custom.duplicateTask')"
          @click="duplicate"
        />
        <UButton
          icon="i-lucide-trash-2"
          variant="ghost"
          color="error"
          size="sm"
          :label="t('teaching.custom.removeTask')"
          data-testid="custom-task-remove"
          @click="remove"
        />
      </div>
    </div>

    <UAlert
      v-if="problems.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('teaching.custom.taskIncomplete')"
      data-testid="custom-task-problems"
    >
      <template #description>
        <ul class="list-disc ps-4">
          <li
            v-for="problem in problems"
            :key="problem.code"
          >
            {{ problemText(problem) }}
          </li>
        </ul>
      </template>
    </UAlert>

    <!-- Aufgabe -->
    <section class="space-y-3">
      <UFormField :label="t('teaching.custom.taskTitle')">
        <UInput
          v-model="task.title"
          :disabled="readOnly"
          class="w-full"
          maxlength="200"
          data-testid="custom-task-title"
        />
      </UFormField>
      <UFormField
        :label="t('teaching.custom.taskText')"
        :help="t('teaching.custom.markdownHint')"
      >
        <UTextarea
          v-model="task.text"
          :disabled="readOnly"
          :rows="5"
          autoresize
          class="w-full"
          data-testid="custom-task-text"
        />
      </UFormField>
      <div class="space-y-2">
        <p class="text-sm font-medium">
          {{ t('teaching.custom.hints') }}
        </p>
        <div
          v-for="(_, i) in task.hints"
          :key="i"
          class="flex items-start gap-2"
        >
          <UTextarea
            v-model="task.hints[i]"
            :disabled="readOnly"
            :rows="1"
            autoresize
            class="flex-1"
            :placeholder="t('learn.hint', { n: i + 1 })"
          />
          <UButton
            v-if="!readOnly"
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            :aria-label="t('teaching.custom.removeHint')"
            @click="removeHint(i)"
          />
        </div>
        <UButton
          v-if="!readOnly && task.hints.length < CUSTOM_LIMITS.hints"
          icon="i-lucide-plus"
          size="sm"
          variant="outline"
          color="neutral"
          :label="t('teaching.custom.addHint')"
          @click="addHint"
        />
      </div>
    </section>

    <!-- Startwelten -->
    <section
      v-if="withWorlds"
      class="space-y-3"
    >
      <div>
        <h3 class="font-semibold">
          {{ t('teaching.custom.worlds') }}
        </h3>
        <p class="text-sm text-(--ui-text-muted)">
          {{ track === 'apps' ? t('teaching.custom.worldsHintApps') : t('teaching.custom.worldsHint') }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <UButton
          v-for="(_, i) in task.worlds"
          :key="i"
          size="sm"
          :variant="world === i ? 'solid' : 'outline'"
          color="neutral"
          :label="t('teaching.custom.worldNumber', { n: i + 1 })"
          :data-testid="`custom-world-${i}`"
          @click="world = i"
        />
        <UButton
          v-if="!readOnly && task.worlds.length < CUSTOM_LIMITS.worlds"
          size="sm"
          variant="ghost"
          icon="i-lucide-plus"
          :label="task.worlds.length ? t('teaching.custom.addWorld') : t('teaching.custom.addFirstWorld')"
          data-testid="custom-world-add"
          @click="addWorld"
        />
        <UButton
          v-if="!readOnly && task.worlds.length > (track === 'apps' ? 0 : 1)"
          size="sm"
          variant="ghost"
          color="error"
          icon="i-lucide-trash-2"
          :label="t('teaching.custom.removeWorld')"
          @click="removeWorld"
        />
      </div>
      <LearnEditorWorld
        v-if="task.worlds[world]"
        :key="`${task.id}-${world}`"
        v-model="task.worlds[world]!"
        :read-only="readOnly"
      />
      <UFormField
        :label="t('teaching.custom.characters')"
        :help="t('teaching.custom.charactersHint')"
      >
        <UInputNumber
          v-model="characters"
          :disabled="readOnly"
          :min="1"
          :max="32"
          :placeholder="t('teaching.custom.charactersAuto')"
          class="w-56"
        />
      </UFormField>
    </section>

    <!-- Datenbanken -->
    <section
      v-if="withDatabases"
      class="space-y-3"
    >
      <div>
        <h3 class="font-semibold">
          {{ t('teaching.custom.databases') }}
        </h3>
        <p class="text-sm text-(--ui-text-muted)">
          {{ track === 'sql' ? t('teaching.custom.databasesHintSql') : t('teaching.custom.databasesHintApps') }}
        </p>
      </div>
      <UCard
        v-for="(db, d) in task.databases"
        :key="d"
        :data-testid="`custom-database-${d}`"
      >
        <div class="mb-3 flex flex-wrap items-end gap-2">
          <UFormField
            :label="t('teaching.custom.databaseNameLabel')"
            :error="validName(db.name) ? undefined : t('teaching.custom.databaseNameInvalid')"
            class="min-w-48 flex-1"
          >
            <UInput
              v-model="db.name"
              :disabled="readOnly"
              class="w-full font-mono"
              data-testid="custom-database-name"
            />
          </UFormField>
          <UButton
            v-if="!readOnly"
            icon="i-lucide-trash-2"
            variant="ghost"
            color="error"
            :label="t('teaching.custom.removeDatabase')"
            @click="task.databases.splice(d, 1)"
          />
        </div>
        <div class="mb-2 flex flex-wrap items-center gap-1">
          <UButton
            v-for="n in db.sql.length"
            :key="n"
            size="xs"
            :variant="dataset(d) === n - 1 ? 'solid' : 'outline'"
            color="neutral"
            :label="t('teaching.custom.dataset', { n })"
            @click="datasets[d] = n - 1"
          />
          <UButton
            v-if="!readOnly && db.sql.length < CUSTOM_LIMITS.scenarios"
            size="xs"
            variant="ghost"
            icon="i-lucide-plus"
            :label="t('teaching.custom.addDataset')"
            @click="addDataset(d)"
          />
          <UButton
            v-if="!readOnly && db.sql.length > 1"
            size="xs"
            variant="ghost"
            color="error"
            icon="i-lucide-trash-2"
            :label="t('teaching.custom.removeDataset')"
            @click="removeDataset(d)"
          />
        </div>
        <div class="h-56 overflow-hidden rounded-md border border-(--ui-border)">
          <ClientOnly>
            <KlonkEditor
              :key="`${task.id}-${d}-${dataset(d)}`"
              v-model="db.sql[dataset(d)]!"
              language="sql"
              :read-only="readOnly"
            />
          </ClientOnly>
        </div>
      </UCard>
      <UButton
        v-if="!readOnly && task.databases.length < CUSTOM_LIMITS.databases"
        icon="i-lucide-database"
        size="sm"
        variant="outline"
        color="neutral"
        :label="t('teaching.custom.addDatabase')"
        @click="addDatabase"
      />
    </section>

    <!-- Musterlösung -->
    <section class="space-y-3">
      <div>
        <h3 class="font-semibold">
          {{ t('teaching.custom.solution') }}
        </h3>
        <p class="text-sm text-(--ui-text-muted)">
          {{ t(`teaching.custom.solutionHint.${track}`) }}
        </p>
      </div>
      <USelect
        v-if="track === 'advanced' || track === 'apps'"
        v-model="codeLanguage"
        :items="languageItems"
        class="w-48"
        :aria-label="t('teaching.custom.solutionLanguage')"
        data-testid="custom-solution-language"
      />
      <div
        class="h-64 overflow-hidden rounded-md border border-(--ui-border)"
        data-testid="custom-solution"
      >
        <ClientOnly>
          <KlonkEditor
            v-if="track === 'basics' || track === 'sql'"
            :key="`${task.id}-${track}`"
            v-model="task.solution"
            :language="track === 'sql' ? 'sql' : 'klonk'"
            :read-only="readOnly"
          />
          <KlonkEditor
            v-else
            :key="`${task.id}-${codeLanguage}`"
            v-model="codeSolution"
            :language="codeLanguage"
            :read-only="readOnly"
          />
        </ClientOnly>
      </div>
      <LearnEditorTest
        :id="id"
        :data="data"
        :index="index"
      />
    </section>

    <!-- Prüfung -->
    <section class="space-y-3">
      <div>
        <h3 class="font-semibold">
          {{ t('teaching.custom.check') }}
        </h3>
        <p class="text-sm text-(--ui-text-muted)">
          {{ t('teaching.custom.checkHint') }}
        </p>
      </div>
      <div class="flex flex-wrap gap-x-6 gap-y-2">
        <UCheckbox
          v-for="key in (['position', 'direction', 'cells'] as const).filter(k => checks.includes(k))"
          :key="key"
          :model-value="!!task.check[key]"
          :disabled="readOnly"
          :label="t(`teaching.custom.checks.${key}`)"
          :data-testid="`custom-check-${key}`"
          @update:model-value="on => flag(key, !!on)"
        />
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField
          v-if="checks.includes('output')"
          :label="t('teaching.custom.checks.output')"
        >
          <USelect
            v-model="output"
            :items="outputItems"
            :disabled="readOnly"
            class="w-full"
            data-testid="custom-check-output"
          />
        </UFormField>
        <UFormField
          v-if="checks.includes('result')"
          :label="t('teaching.custom.checks.result')"
        >
          <USelect
            v-model="result"
            :items="resultItems"
            :disabled="readOnly"
            class="w-full"
            data-testid="custom-check-result"
          />
        </UFormField>
        <UFormField
          v-if="checks.includes('tables')"
          :label="t('teaching.custom.checks.tables')"
          :help="t('teaching.custom.tablesHint')"
        >
          <UInputTags
            v-model="checkedTables"
            :disabled="readOnly"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="checks.includes('schema')"
          :label="t('teaching.custom.checks.schema')"
          :help="t('teaching.custom.schemaHint')"
        >
          <UInputTags
            v-model="checkedSchema"
            :disabled="readOnly"
            class="w-full"
          />
        </UFormField>
      </div>
      <UFormField
        :label="t('teaching.custom.requires')"
        :help="t('teaching.custom.requiresHint')"
      >
        <UCheckboxGroup
          v-model="task.requires"
          :items="constructItems"
          :disabled="readOnly"
        />
      </UFormField>
    </section>
  </div>
</template>
