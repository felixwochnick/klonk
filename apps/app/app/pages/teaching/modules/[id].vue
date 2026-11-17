<script setup lang="ts">
import { CUSTOM_LIMITS, customModuleProblems, customModuleSchema, newCustomTask, type CustomModuleData, type CustomModuleEntry } from '@klonk/learn'

// Eigenes Lernmodul bearbeiten: links Allgemeines und die Aufgaben, rechts das Gewählte. Gespeichert wird ausdrücklich
// (Knopf oder Strg+S) – Kolleg:innen und Lernende sehen erst den gespeicherten Stand.
definePageMeta({ key: route => route.path })

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const apiError = useApiError()
const custom = useCustomModules()
const id = String(route.params.id)

const entry = shallowRef<CustomModuleEntry | null>(null)
const draft = ref<CustomModuleData | null>(null)
/** Zuletzt gespeicherter bzw. geladener Stand (JSON) */
const saved = ref('')
const loadError = ref<string | null>(null)
/** null = Allgemeines, sonst Index der Aufgabe */
const selected = ref<number | null>(null)

async function load() {
  loadError.value = null
  try {
    const loaded = await custom.load(id)
    entry.value = loaded
    draft.value = structuredClone(loaded.data)
    saved.value = JSON.stringify(loaded.data)
    if (selected.value !== null && selected.value >= loaded.data.tasks.length) selected.value = null
  }
  catch (error) {
    loadError.value = apiError(error)
  }
}
onMounted(load)
useSeoMeta({ title: () => draft.value?.title || t('teaching.custom.title') })

const readOnly = computed(() => !entry.value?.editable)
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== saved.value)
const problems = computed(() => (draft.value ? customModuleProblems(draft.value) : []))
const taskProblems = (index: number) => problems.value.filter(p => p.task === index)
/** Eingaben, die sich nicht speichern lassen (z. B. ungültiger Name einer Datenbank) */
const invalid = computed(() => {
  if (!draft.value) return null
  const result = customModuleSchema.safeParse(draft.value)
  if (result.success) return null
  const path = result.error.issues[0]?.path ?? []
  return path.includes('databases') ? t('teaching.custom.databaseNameInvalid') : t('teaching.custom.invalid')
})

// Speichern – hat inzwischen jemand anderes gespeichert (z. B. ein Admin), nicht still überschreiben
const saving = ref(false)
const conflict = ref(false)
async function save(force = false) {
  if (!draft.value || !entry.value || readOnly.value || invalid.value || saving.value) return
  const snapshot = JSON.stringify(draft.value)
  saving.value = true
  try {
    entry.value = await custom.save(id, JSON.parse(snapshot), force ? undefined : entry.value.updatedAt)
    saved.value = snapshot
    conflict.value = false
    toast.add({ title: t('teaching.custom.saved'), color: 'success', icon: 'i-lucide-check' })
  }
  catch (error) {
    if ((error as { data?: { message?: string } })?.data?.message === 'custom_module_conflict') conflict.value = true
    else toast.add({ title: apiError(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
async function discard() {
  conflict.value = false
  await load()
}

function onKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  }
}
const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault()
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
onBeforeRouteLeave(() => !dirty.value || window.confirm(t('teaching.custom.unsaved')))

// Aufgaben
function addTask() {
  if (!draft.value || draft.value.tasks.length >= CUSTOM_LIMITS.tasks) return
  draft.value.tasks.push(newCustomTask(draft.value.track, draft.value.lang, draft.value.tasks))
  selected.value = draft.value.tasks.length - 1
}

// Weitere Aktionen
const deleteOpen = ref(false)
const busy = ref(false)
async function duplicate() {
  if (!draft.value) return
  busy.value = true
  try {
    const copy = await custom.create({ ...structuredClone(toRaw(draft.value)), title: t('teaching.custom.copyOf', { title: draft.value.title }) })
    await navigateTo(`/teaching/modules/${copy.id}`)
  }
  catch (error) {
    toast.add({ title: apiError(error), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
async function remove() {
  busy.value = true
  try {
    await custom.remove(id)
    saved.value = JSON.stringify(draft.value)
    deleteOpen.value = false
    await navigateTo('/teaching/modules')
  }
  catch (error) {
    toast.add({ title: apiError(error), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
const menu = computed(() => [[
  { label: t('teaching.custom.preview'), icon: 'i-lucide-eye', to: `/learn/${id}`, disabled: dirty.value },
  { label: t('teaching.custom.duplicate'), icon: 'i-lucide-copy', onSelect: duplicate },
  { label: t('teaching.custom.export'), icon: 'i-lucide-download', onSelect: () => draft.value && custom.download(draft.value) },
], ...(readOnly.value ? [] : [[{ label: t('teaching.custom.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (deleteOpen.value = true) }]])])
</script>

<template>
  <UContainer class="py-6">
    <UButton
      to="/teaching/modules"
      icon="i-lucide-arrow-left"
      variant="ghost"
      color="neutral"
      :label="t('teaching.custom.title')"
      class="mb-4"
    />

    <UAlert
      v-if="loadError"
      color="warning"
      variant="subtle"
      icon="i-lucide-search-x"
      :title="loadError"
    />

    <div
      v-else-if="!draft || !entry"
      class="py-12 text-center text-(--ui-text-muted)"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin"
      />
    </div>

    <template v-else>
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold tracking-wide text-(--ui-text-muted) uppercase">
            {{ [draft.code, t(`learn.tracks.${draft.track}.title`)].filter(Boolean).join(' · ') }}
          </p>
          <h1
            class="truncate text-2xl font-bold"
            data-testid="custom-editor-title"
          >
            {{ draft.title || t('teaching.custom.untitled') }}
          </h1>
          <p
            v-if="entry.author && !entry.mine"
            class="mt-1 text-sm text-(--ui-text-muted)"
          >
            {{ t('learn.custom.by', { name: entry.author }) }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span
            v-if="!readOnly"
            class="text-sm text-(--ui-text-muted)"
            data-testid="custom-save-state"
          >{{ dirty ? t('teaching.custom.unsavedState') : t('teaching.custom.savedState') }}</span>
          <UDropdownMenu :items="menu">
            <UButton
              icon="i-lucide-ellipsis"
              variant="outline"
              color="neutral"
              :loading="busy"
              :aria-label="t('teaching.actions')"
              data-testid="custom-editor-menu"
            />
          </UDropdownMenu>
          <UButton
            v-if="!readOnly"
            icon="i-lucide-save"
            :label="t('teaching.custom.save')"
            :loading="saving"
            :disabled="!dirty || !!invalid"
            data-testid="custom-save"
            @click="save()"
          />
        </div>
      </div>

      <UAlert
        v-if="readOnly"
        color="info"
        variant="subtle"
        icon="i-lucide-lock"
        :title="t('teaching.custom.readOnly')"
        :description="t('teaching.custom.readOnlyHint')"
        :actions="[{ label: t('teaching.custom.duplicate'), icon: 'i-lucide-copy', onClick: duplicate }]"
        class="mb-4"
        data-testid="custom-read-only"
      />
      <UAlert
        v-if="conflict"
        color="error"
        variant="subtle"
        icon="i-lucide-git-compare"
        :title="t('teaching.custom.conflict')"
        :description="t('teaching.custom.conflictHint')"
        :actions="[
          { label: t('teaching.custom.conflictReload'), variant: 'outline', onClick: discard },
          { label: t('teaching.custom.conflictOverwrite'), color: 'error', onClick: () => save(true) },
        ]"
        class="mb-4"
      />
      <UAlert
        v-if="invalid && !readOnly"
        color="error"
        variant="subtle"
        icon="i-lucide-octagon-alert"
        :description="invalid"
        class="mb-4"
      />

      <div class="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside class="space-y-4 self-start lg:sticky lg:top-[calc(var(--ui-header-height)+1rem)]">
          <nav
            class="space-y-1"
            data-testid="custom-nav"
          >
            <UButton
              :variant="selected === null ? 'soft' : 'ghost'"
              :color="selected === null ? 'primary' : 'neutral'"
              icon="i-lucide-settings-2"
              :label="t('teaching.custom.general')"
              block
              class="justify-start"
              :trailing-icon="problems.some(p => p.task === undefined) ? 'i-lucide-triangle-alert' : undefined"
              data-testid="custom-nav-module"
              @click="selected = null"
            />
            <p class="px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-(--ui-text-muted) uppercase">
              {{ t('learn.tasks') }}
            </p>
            <UButton
              v-for="(task, i) in draft.tasks"
              :key="task.id"
              :variant="selected === i ? 'soft' : 'ghost'"
              :color="selected === i ? 'primary' : 'neutral'"
              block
              class="justify-start"
              :trailing-icon="taskProblems(i).length ? 'i-lucide-triangle-alert' : undefined"
              :data-testid="`custom-nav-task-${i}`"
              @click="selected = i"
            >
              <span class="truncate">{{ i + 1 }}. {{ task.title || t('teaching.custom.untitledTask') }}</span>
            </UButton>
            <UButton
              v-if="!readOnly && draft.tasks.length < CUSTOM_LIMITS.tasks"
              icon="i-lucide-plus"
              :label="t('teaching.custom.addTask')"
              variant="outline"
              color="neutral"
              block
              class="mt-2"
              data-testid="custom-add-task"
              @click="addTask"
            />
          </nav>

          <UAlert
            :color="problems.length ? 'warning' : 'success'"
            variant="subtle"
            :icon="problems.length ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
            :title="problems.length ? t('teaching.custom.incomplete') : t('teaching.custom.ready')"
            :description="problems.length ? t('teaching.custom.incompleteHint', { n: problems.length }, problems.length) : t('teaching.custom.readyHint')"
            data-testid="custom-readiness"
            :data-ready="!problems.length"
          />
        </aside>

        <main class="min-w-0">
          <LearnEditorModule
            v-if="selected === null"
            v-model:data="draft"
            :read-only="readOnly"
          />
          <LearnEditorTask
            v-else-if="draft.tasks[selected]"
            :id="id"
            :key="draft.tasks[selected]!.id"
            v-model:data="draft"
            :index="selected"
            :problems="taskProblems(selected)"
            :read-only="readOnly"
            @select="index => (selected = index)"
          />
        </main>
      </div>
    </template>

    <UModal
      v-model:open="deleteOpen"
      :title="t('teaching.custom.deleteTitle')"
      :description="t('teaching.custom.deleteHint')"
    >
      <template #footer>
        <UButton
          :label="t('teaching.custom.cancel')"
          variant="outline"
          color="neutral"
          @click="deleteOpen = false"
        />
        <UButton
          :label="t('teaching.custom.delete')"
          color="error"
          :loading="busy"
          data-testid="custom-delete-confirm"
          @click="remove"
        />
      </template>
    </UModal>
  </UContainer>
</template>
