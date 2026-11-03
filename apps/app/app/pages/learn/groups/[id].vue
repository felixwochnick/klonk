<script setup lang="ts">
import { LEARN_LANGUAGE_CHOICES, LEARN_MODULES, type LearnGroupProgress, type LearnLanguageChoice, type LearnModuleProgress, type LearnTaskState } from '@klonk/learn'

const { t, locale, d } = useI18n()
const route = useRoute()
const toast = useToast()
const apiError = useApiError()
const learn = useLearn()
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))
const groupId = String(route.params.id)

const { data, refresh, error } = useFetch<LearnGroupProgress>(`/api/learn/groups/${groupId}`, {
  server: false,
  headers: clientHostHeaders(),
})
useSeoMeta({ title: () => (data.value ? t('learn.groupTitle', { name: data.value.name }) : t('learn.title')) })

// Neu laden, solange die Seite offen ist (Lernende arbeiten parallel)
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => void refresh(), 30_000)
})
onBeforeUnmount(() => clearInterval(timer))

const moduleNumber = (id: string) => LEARN_MODULES.findIndex(m => m.id === id) + 1
const enabledModules = computed(() => LEARN_MODULES.filter(m => data.value?.modules.includes(m.id)))
const members = computed(() => data.value?.members ?? [])

// Freigabe je Modul mit Sprachvorgabe
const saving = ref(false)
const choiceItems = computed(() => LEARN_LANGUAGE_CHOICES.map(value => ({ label: t(`learn.languageChoice.${value}`), value })))
const choiceOf = (moduleId: string): LearnLanguageChoice => data.value?.languages[moduleId] ?? 'both'

function toggle(moduleId: string, on: boolean) {
  if (!data.value) return
  const ids = on ? [...data.value.modules, moduleId] : data.value.modules.filter(id => id !== moduleId)
  return save(ids.map(id => ({ id, languages: choiceOf(id) })))
}
function setChoice(moduleId: string, languages: LearnLanguageChoice) {
  if (!data.value) return
  return save(data.value.modules.map(id => ({ id, languages: id === moduleId ? languages : choiceOf(id) })))
}

async function save(modules: { id: string, languages: LearnLanguageChoice }[]) {
  saving.value = true
  try {
    await $fetch(`/api/learn/groups/${groupId}/modules` as string, { method: 'PUT', headers: clientHostHeaders(), body: { modules } })
    await Promise.all([refresh(), learn.refresh()])
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// Lernstand
const progressOf = (member: LearnGroupProgress['members'][number], moduleId: string): LearnModuleProgress | null => member.modules[moduleId] ?? null
const solvedIn = (member: LearnGroupProgress['members'][number], moduleId: string) => progressOf(member, moduleId)?.solved.length ?? 0
const taskCount = (moduleId: string) => LEARN_MODULES.find(m => m.id === moduleId)?.tasks.length ?? 0

function taskState(member: LearnGroupProgress['members'][number], moduleId: string, taskId: string): LearnTaskState {
  const progress = progressOf(member, moduleId)
  if (progress?.solved.includes(taskId)) return 'solved'
  if (progress?.started.includes(taskId)) return 'started'
  return 'open'
}

/** Anteil gelöster Aufgaben der ganzen Gruppe in einem Modul (Prozent) */
function groupShare(moduleId: string) {
  const total = taskCount(moduleId) * members.value.length
  if (!total) return 0
  return Math.round(members.value.reduce((sum, m) => sum + solvedIn(m, moduleId), 0) / total * 100)
}
const solvedBy = (moduleId: string, taskId: string) => members.value.filter(m => taskState(m, moduleId, taskId) === 'solved').length

function lastActive(member: LearnGroupProgress['members'][number]) {
  const dates = Object.values(member.modules).map(p => p.updatedAt).sort()
  return dates.length ? d(new Date(dates.at(-1)!), { dateStyle: 'short', timeStyle: 'short' }) : '–'
}

// Ausgewähltes Modul für die Aufgaben-Ansicht
const selected = ref<string | null>(null)
watch(enabledModules, (list) => {
  if (!list.some(m => m.id === selected.value)) selected.value = list[0]?.id ?? null
}, { immediate: true })
const selectedModule = computed(() => LEARN_MODULES.find(m => m.id === selected.value) ?? null)

const STATE_ICON: Record<LearnTaskState, string> = { solved: 'i-lucide-circle-check', started: 'i-lucide-circle-dot', open: 'i-lucide-circle' }
const STATE_CLASS: Record<LearnTaskState, string> = { solved: 'text-(--ui-success)', started: 'text-(--ui-warning)', open: 'text-(--ui-text-dimmed)' }

/** Programm einer Person ansehen (Aufgabenseite, nur lesen) */
function viewLink(member: LearnGroupProgress['members'][number], moduleId: string, taskId: string) {
  const progress = progressOf(member, moduleId)
  if (!progress) return undefined
  return { path: `/learn/${moduleId}/${taskId}`, query: { project: progress.projectId, name: member.displayName, back: `/learn/groups/${groupId}` } }
}
</script>

<template>
  <UContainer class="py-8">
    <UButton
      to="/learn"
      icon="i-lucide-arrow-left"
      variant="ghost"
      color="neutral"
      :label="t('learn.title')"
      class="mb-4"
    />

    <UAlert
      v-if="error"
      color="warning"
      variant="subtle"
      icon="i-lucide-search-x"
      :title="t('learn.notFound')"
    />

    <template v-else-if="data">
      <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">
            {{ t('learn.groupTitle', { name: data.name }) }}
          </h1>
          <p class="mt-1 text-sm text-(--ui-text-muted)">
            {{ t('learn.groupHint') }}
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          variant="ghost"
          color="neutral"
          :label="t('learn.refresh')"
          @click="refresh()"
        />
      </div>

      <!-- Freigabe -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold">
            {{ t('learn.enableModules') }}
          </h2>
          <p class="mt-1 text-sm text-(--ui-text-muted)">
            {{ t('learn.enableModulesHint') }}
          </p>
        </template>
        <div
          class="grid gap-x-6 gap-y-3 md:grid-cols-2"
          data-testid="learn-enable"
        >
          <div
            v-for="module in LEARN_MODULES"
            :key="module.id"
            class="flex min-h-9 flex-wrap items-center justify-between gap-2"
          >
            <USwitch
              :model-value="data.modules.includes(module.id)"
              :disabled="saving"
              :label="`${moduleNumber(module.id)}. ${module.title[lang]}`"
              :data-testid="`learn-enable-${module.id}`"
              @update:model-value="on => toggle(module.id, !!on)"
            />
            <USelect
              v-if="data.modules.includes(module.id)"
              :model-value="choiceOf(module.id)"
              :items="choiceItems"
              :disabled="saving"
              size="sm"
              class="w-52"
              :aria-label="t('learn.languageFor', { module: module.title[lang] })"
              :data-testid="`learn-languages-${module.id}`"
              @update:model-value="value => setChoice(module.id, value as LearnLanguageChoice)"
            />
          </div>
        </div>
      </UCard>

      <UAlert
        v-if="!members.length"
        color="info"
        variant="subtle"
        icon="i-lucide-users"
        :description="t('learn.noMembers')"
      />
      <UAlert
        v-else-if="!enabledModules.length"
        color="info"
        variant="subtle"
        icon="i-lucide-list-checks"
        :description="t('learn.noEnabledModules')"
      />

      <template v-else>
        <!-- Lernstand: Personen × Module -->
        <h2 class="mb-3 text-lg font-semibold">
          {{ t('learn.overview') }}
        </h2>
        <div class="mb-8 overflow-x-auto rounded-lg border border-(--ui-border)">
          <table
            class="w-full text-sm"
            data-testid="learn-overview"
          >
            <thead class="bg-(--ui-bg-muted) text-left">
              <tr>
                <th class="px-3 py-2 font-semibold">
                  {{ t('learn.learner') }}
                </th>
                <th
                  v-for="module in enabledModules"
                  :key="module.id"
                  class="px-3 py-2 font-semibold"
                >
                  <button
                    type="button"
                    class="text-left hover:underline"
                    :class="selected === module.id ? 'text-(--ui-primary)' : ''"
                    @click="selected = module.id"
                  >
                    {{ moduleNumber(module.id) }}. {{ module.title[lang] }}
                  </button>
                </th>
                <th class="px-3 py-2 font-semibold">
                  {{ t('learn.lastActive') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="member in members"
                :key="member.userId"
                class="border-t border-(--ui-border)"
                :data-testid="`learn-member-${member.username ?? member.userId}`"
              >
                <td class="px-3 py-2 font-medium">
                  {{ member.displayName }}
                </td>
                <td
                  v-for="module in enabledModules"
                  :key="module.id"
                  class="min-w-36 px-3 py-2"
                >
                  <div class="flex items-center gap-2">
                    <UProgress
                      :model-value="solvedIn(member, module.id)"
                      :max="module.tasks.length"
                      size="xs"
                      :color="solvedIn(member, module.id) === module.tasks.length ? 'success' : 'primary'"
                      class="w-20"
                    />
                    <span
                      class="tabular-nums text-(--ui-text-muted)"
                      :data-testid="`learn-cell-${member.username ?? member.userId}-${module.id}`"
                    >{{ progressOf(member, module.id) ? `${solvedIn(member, module.id)}/${module.tasks.length}` : t('learn.notStarted') }}</span>
                  </div>
                </td>
                <td class="px-3 py-2 text-(--ui-text-muted)">
                  {{ lastActive(member) }}
                </td>
              </tr>
            </tbody>
            <tfoot class="border-t-2 border-(--ui-border) bg-(--ui-bg-muted)">
              <tr>
                <td class="px-3 py-2 font-semibold">
                  {{ t('learn.wholeGroup') }}
                </td>
                <td
                  v-for="module in enabledModules"
                  :key="module.id"
                  class="px-3 py-2 font-semibold tabular-nums"
                >
                  {{ t('learn.share', { percent: groupShare(module.id) }) }}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Aufgaben eines Moduls -->
        <template v-if="selectedModule">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-semibold">
              {{ moduleNumber(selectedModule.id) }}. {{ selectedModule.title[lang] }}
            </h2>
            <div class="flex flex-wrap gap-3 text-xs text-(--ui-text-muted)">
              <span
                v-for="state in (['solved', 'started', 'open'] as const)"
                :key="state"
                class="flex items-center gap-1"
              >
                <UIcon
                  :name="STATE_ICON[state]"
                  :class="STATE_CLASS[state]"
                  class="size-4"
                />
                {{ t(`learn.states.${state}`) }}
              </span>
            </div>
          </div>
          <div class="overflow-x-auto rounded-lg border border-(--ui-border)">
            <table
              class="w-full text-sm"
              data-testid="learn-tasks-table"
            >
              <thead class="bg-(--ui-bg-muted) text-left">
                <tr>
                  <th class="px-3 py-2 font-semibold">
                    {{ t('learn.learner') }}
                  </th>
                  <th
                    v-for="(task, i) in selectedModule.tasks"
                    :key="task.id"
                    class="px-3 py-2 text-center font-semibold"
                    :title="task.title[lang]"
                  >
                    {{ i + 1 }}. {{ task.title[lang] }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="member in members"
                  :key="member.userId"
                  class="border-t border-(--ui-border)"
                >
                  <td class="px-3 py-2 font-medium">
                    {{ member.displayName }}
                  </td>
                  <td
                    v-for="task in selectedModule.tasks"
                    :key="task.id"
                    class="px-3 py-2 text-center"
                  >
                    <UTooltip
                      v-if="taskState(member, selectedModule.id, task.id) !== 'open'"
                      :text="t('learn.viewCode')"
                    >
                      <UButton
                        :to="viewLink(member, selectedModule.id, task.id)"
                        :icon="STATE_ICON[taskState(member, selectedModule.id, task.id)]"
                        :class="STATE_CLASS[taskState(member, selectedModule.id, task.id)]"
                        variant="ghost"
                        color="neutral"
                        size="sm"
                        :aria-label="`${t(`learn.states.${taskState(member, selectedModule.id, task.id)}`)} – ${t('learn.viewCode')}`"
                        :data-testid="`learn-view-${member.username ?? member.userId}-${task.id}`"
                        :data-state="taskState(member, selectedModule.id, task.id)"
                      />
                    </UTooltip>
                    <UIcon
                      v-else
                      :name="STATE_ICON.open"
                      :class="STATE_CLASS.open"
                      class="size-4"
                      :aria-label="t('learn.states.open')"
                    />
                  </td>
                </tr>
              </tbody>
              <tfoot class="border-t-2 border-(--ui-border) bg-(--ui-bg-muted)">
                <tr>
                  <td class="px-3 py-2 font-semibold">
                    {{ t('learn.solvedBy') }}
                  </td>
                  <td
                    v-for="task in selectedModule.tasks"
                    :key="task.id"
                    class="px-3 py-2 text-center font-semibold tabular-nums"
                  >
                    {{ solvedBy(selectedModule.id, task.id) }}/{{ members.length }}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </template>
      </template>
    </template>
  </UContainer>
</template>
