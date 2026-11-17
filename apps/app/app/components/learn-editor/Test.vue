<script setup lang="ts">
import { customModule, scenarioCount, type CustomModuleData, type Outcome } from '@klonk/learn'
import { World } from '@klonk/world'
import { computeExpected, ExpectedError } from '~/utils/learn-check'

// Musterlösung einer Aufgabe (eigene Lernmodule) in allen Startsituationen ausführen und das Ergebnis zeigen – so sieht die
// Lehrkraft den Zielzustand, mit dem die Programme der Lernenden verglichen werden
const props = defineProps<{ id: string, data: CustomModuleData, index: number }>()
const { t, te, locale } = useI18n()
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))

const outcomes = shallowRef<Outcome[] | null>(null)
const failure = ref<string | null>(null)
const running = ref(false)
const scenario = ref(0)
let run = 0

// Jede Änderung an der Aufgabe macht das Ergebnis ungültig
watch(() => [props.data.track, props.data.tasks[props.index]], () => {
  run++
  outcomes.value = null
  failure.value = null
  running.value = false
}, { deep: true })

async function execute() {
  const current = ++run
  const module = customModule(props.id, props.data, `draft-${Date.now()}`)
  const task = module.tasks[props.index]
  if (!task) return
  running.value = true
  failure.value = null
  outcomes.value = null
  try {
    const result = await computeExpected(module, task, { lang: lang.value, maxCharacters: Infinity })
    if (current !== run) return
    outcomes.value = result
    scenario.value = Math.min(scenario.value, result.length - 1)
  }
  catch (error) {
    if (current !== run) return
    if (error instanceof ExpectedError) {
      const where = t('teaching.custom.test.where', { n: error.scenario + 1 })
      failure.value = error.timeout
        ? t('teaching.custom.test.timeout', { where })
        : error.error ? t('teaching.custom.test.error', { where, message: scriptErrorMessage(t, te, error.error.code, error.error.params) }) : t('teaching.custom.test.noSolution')
    }
    else failure.value = t('teaching.custom.test.failed')
  }
  finally {
    if (current === run) running.value = false
  }
}

const count = computed(() => {
  const module = customModule(props.id, props.data)
  const task = module.tasks[props.index]
  return task ? scenarioCount(task) : 0
})
const shown = computed(() => outcomes.value?.[scenario.value] ?? null)
const shownWorld = computed(() => (shown.value?.world ? new World(shown.value.world) : null))
const hasWorld = computed(() => !!props.data.tasks[props.index]?.worlds.length && props.data.track !== 'sql')
</script>

<template>
  <div
    class="space-y-3"
    data-testid="custom-test"
  >
    <div class="flex flex-wrap items-center gap-3">
      <UButton
        icon="i-lucide-play"
        :label="t('teaching.custom.test.run')"
        :loading="running"
        variant="soft"
        data-testid="custom-test-run"
        @click="execute"
      />
      <p class="text-sm text-(--ui-text-muted)">
        {{ t('teaching.custom.test.hint') }}
      </p>
    </div>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-octagon-alert"
      :description="failure"
      data-testid="custom-test-failure"
    />

    <template v-if="outcomes">
      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        :description="t('teaching.custom.test.done', { n: outcomes.length })"
        data-testid="custom-test-done"
      />
      <div
        v-if="count > 1"
        class="flex flex-wrap gap-1"
      >
        <UButton
          v-for="n in count"
          :key="n"
          size="xs"
          :variant="scenario === n - 1 ? 'solid' : 'outline'"
          color="neutral"
          :label="t('teaching.custom.test.scenario', { n })"
          @click="scenario = n - 1"
        />
      </div>
      <div
        v-if="hasWorld && shownWorld"
        class="h-72 overflow-hidden rounded-md border border-(--ui-border) bg-(--ui-bg-muted)"
      >
        <ClientOnly>
          <KlonkWorld :world="shownWorld" />
        </ClientOnly>
      </div>
      <div v-if="shown?.output.length">
        <p class="mb-1 text-xs font-semibold">
          {{ t('teaching.custom.test.output') }}
        </p>
        <pre
          class="max-h-48 overflow-auto rounded-md border border-(--ui-border) bg-(--ui-bg-muted) p-2 font-mono text-xs"
          data-testid="custom-test-output"
        >{{ shown.output.join('\n') }}</pre>
      </div>
      <div v-if="shown?.result">
        <p class="mb-1 text-xs font-semibold">
          {{ t('teaching.custom.test.result') }}
        </p>
        <SqlResultTable
          :columns="shown.result.columns"
          :rows="shown.result.rows"
        />
      </div>
      <div
        v-for="(table, name) in shown?.tables ?? {}"
        :key="name"
      >
        <p class="mb-1 text-xs font-semibold">
          {{ t('teaching.custom.test.table', { name }) }}
        </p>
        <SqlResultTable
          :columns="table.columns"
          :rows="table.rows"
        />
      </div>
    </template>
  </div>
</template>
