<script setup lang="ts">
import { findModule, isCodeLanguage, moduleCode, TRACK_LANGUAGES, type CodeLanguage, type LearnStorage } from '@klonk/learn'

const { t, locale } = useI18n()
const route = useRoute()
const learn = useLearn()
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))

const module = computed(() => findModule(String(route.params.module)))
// Vorausgesetzte Module (auch aus anderen Reihen)
const prerequisites = computed(() => (module.value?.prerequisites ?? []).map(id => findModule(id)).filter(m => !!m))

// Reihen F und A: Beispiele in der zuletzt gewählten bzw. erlaubten Programmiersprache
const PREFERRED_KEY = 'klonk:learn-language'
const codeLanguages = computed(() => (module.value ? (learn.status.value?.languages[module.value.id] ?? TRACK_LANGUAGES[module.value.track]).filter(isCodeLanguage) : []))
const exampleLanguage = ref<CodeLanguage | null>(null)
watch(codeLanguages, (allowed) => {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(PREFERRED_KEY)
  }
  catch {
    // kein Speicher (privater Modus)
  }
  exampleLanguage.value = allowed.find(l => l === (exampleLanguage.value ?? stored)) ?? allowed[0] ?? null
}, { immediate: import.meta.client })
watch(exampleLanguage, (value) => {
  try {
    if (value) localStorage.setItem(PREFERRED_KEY, value)
  }
  catch {
    // kein Speicher (privater Modus)
  }
})
// Lernende einer Organisation: nur freigegebene Module; ohne erlaubten (bzw. hier möglichen) Speicherort keine
const locked = computed(() => !!module.value && !!learn.status.value && !learn.canStart(module.value.id))
const lockedReason = computed(() => (module.value && learn.status.value?.modules.includes(module.value.id) ? t('learn.noStorage') : t('learn.notEnabled')))

// Speicherort beim Start: mehrere erlaubt ⇒ wählen lassen (Ordner nur in Browsern mit Ordnerzugriff)
const storage = computed(() => (module.value ? learn.storageOf(module.value.id) : null))
const storageItems = computed(() => (module.value ? learn.storages(module.value.id) : []).map(s => ({
  value: s.value,
  label: t(`learn.storage.${s.value}.label`),
  description: s.supported ? t(`learn.storage.${s.value}.description`) : t('learn.storage.folder.unsupported'),
  disabled: !s.supported,
})))
const chooseOpen = ref(false)
const chosen = ref<LearnStorage>('cloud')
const starting = ref(false)
const toast = useToast()
const apiError = useApiError()
const nextTask = () => `/learn/${module.value!.id}/${learn.nextTaskId(module.value!)}`

function startModule() {
  if (!module.value) return
  if (storage.value) return navigateTo(nextTask())
  const usable = storageItems.value.filter(s => !s.disabled)
  if (usable.length === 1 && storageItems.value.length === 1) return begin(usable[0]!.value)
  chosen.value = usable[0]?.value ?? 'cloud'
  chooseOpen.value = true
}

/** Modul am gewählten Ort anlegen – direkt aus dem Klick (Ordnerauswahl braucht die Nutzeraktion) */
async function begin(value: LearnStorage) {
  starting.value = true
  try {
    await learn.start(module.value!.id, lang.value, value)
    chooseOpen.value = false
    await navigateTo(nextTask())
  }
  catch (error) {
    if ((error as Error)?.message !== 'cancelled') toast.add({ title: (error as { data?: unknown })?.data ? apiError(error) : t('learn.startFailed'), color: 'error' })
  }
  finally {
    starting.value = false
  }
}
useSeoMeta({ title: () => module.value?.title[lang.value] ?? t('learn.title') })

// Hinweise für Lehrkräfte nur in der App (nicht in der öffentlichen Doku) und nur für Lehrkräfte, Admins, Betreiber
const { user } = useAuth()
const isTeacher = computed(() => !!user.value && (user.value.role !== 'member' || user.value.platformRole !== 'user'))
const STORAGE_ICON: Record<LearnStorage, string> = { cloud: 'i-lucide-cloud', browser: 'i-lucide-hard-drive', folder: 'i-lucide-folder' }
</script>

<template>
  <UContainer class="py-8">
    <UButton
      to="/learn"
      icon="i-lucide-arrow-left"
      variant="ghost"
      color="neutral"
      :label="t('learn.allModules')"
      class="mb-4"
    />

    <UAlert
      v-if="!module"
      color="warning"
      variant="subtle"
      icon="i-lucide-search-x"
      :title="t('learn.notFound')"
    />

    <div
      v-else
      class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <article class="max-w-3xl">
        <p class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
          {{ t('learn.moduleCode', { code: moduleCode(module.id) }) }} · {{ t(`learn.tracks.${module.track}.title`) }}
        </p>
        <h1 class="mt-1 text-2xl font-bold">
          {{ module.title[lang] }}
        </h1>
        <p
          v-if="prerequisites.length"
          class="mt-2 flex flex-wrap items-center gap-1 text-sm text-(--ui-text-muted)"
          data-testid="learn-prerequisites"
        >
          {{ t('learn.prerequisites') }}
          <UButton
            v-for="item in prerequisites"
            :key="item.id"
            :to="`/learn/${item.id}`"
            size="xs"
            variant="soft"
            color="neutral"
            :label="`${moduleCode(item.id)} ${item.title[lang]}`"
          />
        </p>

        <h2 class="mb-2 mt-6 font-semibold">
          {{ t('learn.objectives') }}
        </h2>
        <ul class="list-disc space-y-1 ps-5 text-sm">
          <li
            v-for="(objective, i) in module.objectives"
            :key="i"
          >
            <LearnText :text="objective[lang]" />
          </li>
        </ul>

        <div class="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold">
            {{ t('learn.introduction') }}
          </h2>
          <USelect
            v-if="codeLanguages.length > 1 && exampleLanguage"
            v-model="exampleLanguage"
            :items="codeLanguages.map(value => ({ label: t(`editor.languages.${value}`), value }))"
            icon="i-lucide-file-code"
            size="sm"
            class="w-40"
            :aria-label="t('learn.exampleLanguage')"
            data-testid="learn-example-language"
          />
        </div>
        <LearnText
          :text="module.intro[lang]"
          :language="exampleLanguage"
        />

        <UCard
          v-if="isTeacher"
          class="mt-8"
          data-testid="learn-teacher"
        >
          <template #header>
            <h2 class="flex items-center gap-2 font-semibold">
              <UIcon name="i-lucide-presentation" />
              {{ t('learn.teacherNotes') }}
            </h2>
          </template>
          <LearnText :text="module.teacher[lang]" />
        </UCard>
      </article>

      <aside>
        <UAlert
          v-if="locked"
          class="mb-4"
          color="warning"
          variant="subtle"
          icon="i-lucide-lock"
          :description="lockedReason"
          data-testid="learn-locked"
        />
        <h2 class="mb-3 font-semibold">
          {{ t('learn.tasks') }}
        </h2>
        <ol
          class="space-y-2"
          data-testid="learn-tasks"
        >
          <li
            v-for="(task, i) in module.tasks"
            :key="task.id"
          >
            <UButton
              :to="locked ? undefined : `/learn/${module.id}/${task.id}`"
              :disabled="locked"
              variant="outline"
              color="neutral"
              block
              class="justify-start"
              :data-testid="`learn-task-${task.id}`"
            >
              <UIcon
                :name="learn.isSolved(module.id, task.id) ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                :class="learn.isSolved(module.id, task.id) ? 'text-(--ui-success)' : 'text-(--ui-text-dimmed)'"
                class="size-5 shrink-0"
              />
              <span class="truncate">{{ i + 1 }}. {{ task.title[lang] }}</span>
            </UButton>
          </li>
        </ol>
        <UButton
          :label="learn.progress(module.id) ? t('learn.continue') : t('learn.start')"
          :disabled="locked || !learn.status.value"
          :loading="starting"
          trailing-icon="i-lucide-arrow-right"
          class="mt-4"
          block
          data-testid="learn-start"
          @click="startModule"
        />
        <p
          v-if="storage"
          class="mt-2 flex items-center gap-1.5 text-xs text-(--ui-text-muted)"
          data-testid="learn-storage"
          :data-storage="storage"
        >
          <UIcon :name="STORAGE_ICON[storage]" />
          {{ t('learn.storedIn', { place: t(`learn.storage.${storage}.label`) }) }}
        </p>
      </aside>
    </div>

    <UModal
      v-model:open="chooseOpen"
      :title="t('learn.chooseStorage')"
      :description="t('learn.chooseStorageHint')"
    >
      <template #body>
        <URadioGroup
          v-model="chosen"
          :items="storageItems"
          variant="card"
          :ui="{ fieldset: 'gap-2' }"
          data-testid="learn-storage-choice"
        >
          <template #label="{ item }">
            <span :data-testid="`learn-storage-${(item as { value: string }).value}`">{{ (item as { label: string }).label }}</span>
          </template>
        </URadioGroup>
      </template>
      <template #footer>
        <UButton
          :label="t('learn.start')"
          :loading="starting"
          trailing-icon="i-lucide-arrow-right"
          data-testid="learn-storage-start"
          @click="begin(chosen)"
        />
      </template>
    </UModal>
  </UContainer>
</template>
