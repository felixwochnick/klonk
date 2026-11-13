<script setup lang="ts">
import { LEARN_MODULES, moduleLabel, type TeachingGroup, type TeachingProgress } from '@klonk/learn'

// Klassen einer Jahrgangsstufe (bzw. Zusatzkurse, nicht zugeordnete Gruppen) mit Freigabe-Matrix Module × Klassen:
// laut Lehrplan empfohlene Module zuerst, je Zelle Freigabe und Anteil gelöster Aufgaben
const props = defineProps<{ level: string, groups: TeachingGroup[] }>()
const { t, locale } = useI18n()
const toast = useToast()
const apiError = useApiError()
const teaching = useTeaching()
const learn = useLearn()
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))

const { data: progress, refresh: refreshProgress } = useFetch<TeachingProgress>('/api/teaching/progress', {
  query: { level: props.level },
  server: false,
  headers: clientHostHeaders(),
  default: () => ({}),
})

const recommended = computed(() => teaching.recommended(props.level))
const moduleNumber = (id: string) => moduleLabel(id)
// Empfohlene zuerst; ohne Empfehlung alle in Kursreihenfolge
const recommendedRows = computed(() => LEARN_MODULES.filter(m => recommended.value.includes(m.id)))
const otherRows = computed(() => LEARN_MODULES.filter(m => !recommended.value.includes(m.id)))

const released = (group: TeachingGroup, moduleId: string) => group.modules.includes(moduleId)
/** Anteil gelöster Aufgaben aller Lernenden der Klasse (Prozent) */
function share(group: TeachingGroup, moduleId: string) {
  const total = (LEARN_MODULES.find(m => m.id === moduleId)?.tasks.length ?? 0) * group.members
  const solved = progress.value[group.id]?.[moduleId]?.solved ?? 0
  return total ? Math.round(solved / total * 100) : 0
}

const saving = ref(false)
async function update(changes: { group: TeachingGroup, modules: string[] }[]) {
  if (!changes.length) return
  saving.value = true
  try {
    for (const { group, modules } of changes) await teaching.setModules(group, modules)
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
  finally {
    await Promise.all([teaching.refresh(), refreshProgress(), learn.refresh()])
    saving.value = false
  }
}
const toggle = (group: TeachingGroup, moduleId: string, on: boolean) =>
  update([{ group, modules: on ? [...group.modules, moduleId] : group.modules.filter(id => id !== moduleId) }])
/** Module für alle Klassen der Stufe freigeben, denen sie noch fehlen */
const releaseForAll = (moduleIds: string[]) => update(props.groups
  .filter(g => moduleIds.some(id => !g.modules.includes(id)))
  .map(g => ({ group: g, modules: [...new Set([...g.modules, ...moduleIds])] })))
const missingForAll = (moduleIds: string[]) => props.groups.some(g => moduleIds.some(id => !g.modules.includes(id)))
</script>

<template>
  <div class="space-y-8">
    <!-- Klassen -->
    <section>
      <h2 class="mb-3 text-lg font-semibold">
        {{ t('teaching.classes') }}
      </h2>
      <UAlert
        v-if="!groups.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-users"
        :description="t('teaching.noClassesInLevel')"
        data-testid="teaching-no-classes"
      />
      <div
        v-else
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <UCard
          v-for="group in groups"
          :key="group.id"
          :data-testid="`teaching-group-${group.name}`"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="truncate font-semibold">
                {{ group.name }}
              </h3>
              <p class="mt-1 text-sm text-(--ui-text-muted)">
                {{ t('learn.groupSummary', { members: group.members, modules: group.modules.length }) }}
              </p>
            </div>
            <UIcon
              name="i-lucide-users"
              class="size-5 shrink-0 text-(--ui-text-muted)"
            />
          </div>
          <template #footer>
            <UButton
              :to="`/teaching/groups/${group.id}`"
              :label="t('learn.openProgress')"
              trailing-icon="i-lucide-arrow-right"
              variant="soft"
              block
            />
          </template>
        </UCard>
      </div>
    </section>

    <!-- Lernmodule × Klassen -->
    <section v-if="groups.length">
      <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">
            {{ t('teaching.modulesTitle') }}
          </h2>
          <p class="mt-1 text-sm text-(--ui-text-muted)">
            {{ t('teaching.modulesHint') }}
          </p>
        </div>
        <UButton
          v-if="recommended.length && missingForAll(recommended)"
          icon="i-lucide-list-checks"
          :label="groups.length > 1 ? t('teaching.releaseRecommendedAll') : t('teaching.releaseRecommended')"
          :loading="saving"
          :disabled="saving"
          data-testid="teaching-release-recommended"
          @click="releaseForAll(recommended)"
        />
      </div>
      <div class="overflow-x-auto rounded-lg border border-(--ui-border)">
        <table
          class="w-full text-sm"
          data-testid="teaching-matrix"
        >
          <thead class="bg-(--ui-bg-muted) text-left">
            <tr>
              <th class="px-3 py-2 font-semibold">
                {{ t('teaching.module') }}
              </th>
              <th
                v-for="group in groups"
                :key="group.id"
                class="px-3 py-2 text-center font-semibold"
              >
                {{ group.name }}
              </th>
              <th
                v-if="groups.length > 1"
                class="px-3 py-2"
              >
                <span class="sr-only">{{ t('teaching.actions') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <template
              v-for="(rows, index) in [recommendedRows, otherRows]"
              :key="index"
            >
              <tr
                v-if="index === 1 && recommendedRows.length && otherRows.length"
                class="border-t border-(--ui-border) bg-(--ui-bg-elevated)/50"
              >
                <td
                  :colspan="groups.length + 2"
                  class="px-3 py-1.5 text-xs font-semibold tracking-wide text-(--ui-text-muted) uppercase"
                >
                  {{ t('teaching.otherModules') }}
                </td>
              </tr>
              <tr
                v-for="module in rows"
                :key="module.id"
                class="border-t border-(--ui-border)"
                :data-testid="`teaching-row-${module.id}`"
              >
                <td class="min-w-56 px-3 py-2">
                  <NuxtLink
                    :to="`/learn/${module.id}`"
                    class="font-medium hover:underline"
                  >
                    {{ moduleNumber(module.id) }}. {{ module.title[lang] }}
                  </NuxtLink>
                  <UBadge
                    v-if="index === 0"
                    :label="t('teaching.curriculumBadge')"
                    color="primary"
                    variant="subtle"
                    size="sm"
                    class="ms-2"
                  />
                </td>
                <td
                  v-for="group in groups"
                  :key="group.id"
                  class="px-3 py-2"
                >
                  <div class="flex flex-col items-center gap-1">
                    <UCheckbox
                      :model-value="released(group, module.id)"
                      :disabled="saving"
                      :aria-label="t('teaching.releaseFor', { module: module.title[lang], group: group.name })"
                      :data-testid="`teaching-cell-${group.name}-${module.id}`"
                      @update:model-value="on => toggle(group, module.id, !!on)"
                    />
                    <span
                      v-if="released(group, module.id) && group.members"
                      class="text-xs text-(--ui-text-muted)"
                      :data-testid="`teaching-share-${group.name}-${module.id}`"
                    >{{ t('teaching.share', { n: share(group, module.id) }) }}</span>
                  </div>
                </td>
                <td
                  v-if="groups.length > 1"
                  class="px-3 py-2 text-end"
                >
                  <UButton
                    v-if="missingForAll([module.id])"
                    size="xs"
                    variant="ghost"
                    :label="t('teaching.releaseAll')"
                    :disabled="saving"
                    @click="releaseForAll([module.id])"
                  />
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
