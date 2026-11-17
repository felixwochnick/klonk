<script setup lang="ts">
import { LEARN_TRACKS, newCustomModule, TRACK_CODES, type CustomModuleSummary, type LearnTrack } from '@klonk/learn'

// Eigene Lernmodule der Schule: eigene und die der Kolleg:innen. Alle Lehrkräfte sehen alle Module und können sie für ihre
// Klassen freigeben; bearbeiten dürfen Autor:in und Admins, alle anderen arbeiten mit einer Kopie weiter.
const { t, locale, d } = useI18n()
const toast = useToast()
const apiError = useApiError()
const learn = useLearn()
const custom = useCustomModules()
const teaching = useTeaching()
const { user } = useAuth()
useSeoMeta({ title: () => t('teaching.custom.title') })

const lang = computed<'de' | 'en'>(() => (locale.value === 'en' ? 'en' : 'de'))
const staff = computed(() => !!user.value?.organizationId && user.value.role !== 'member')
const mine = computed(() => learn.custom.value.filter(m => m.mine))
const others = computed(() => learn.custom.value.filter(m => !m.mine))

// Neues Modul: Titel und Reihe, alles andere im Editor
const createOpen = ref(false)
const form = reactive<{ title: string, track: LearnTrack }>({ title: '', track: 'basics' })
const trackItems = computed(() => LEARN_TRACKS.map(value => ({ value, label: `${TRACK_CODES[value]} · ${t(`learn.tracks.${value}.title`)}`, description: t(`teaching.custom.trackHint.${value}`) })))
const busy = ref(false)
async function run(action: () => Promise<unknown>) {
  busy.value = true
  try {
    await action()
  }
  catch (error) {
    toast.add({ title: (error as Error)?.message === 'custom_module_invalid' ? t('teaching.custom.importInvalid') : apiError(error), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
const create = () => run(async () => {
  const entry = await custom.create(newCustomModule(form.track, lang.value, form.title.trim()))
  createOpen.value = false
  form.title = ''
  await navigateTo(`/teaching/modules/${entry.id}`)
})
const duplicate = (module: CustomModuleSummary) => run(async () => {
  const { data } = await custom.load(module.id)
  const copy = await custom.create({ ...data, title: t('teaching.custom.copyOf', { title: data.title }) })
  await navigateTo(`/teaching/modules/${copy.id}`)
})
const download = (module: CustomModuleSummary) => run(async () => custom.download((await custom.load(module.id)).data))

// Import aus einer exportierten Datei
const fileInput = useTemplateRef('fileInput')
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (file) await run(async () => navigateTo(`/teaching/modules/${(await custom.importFile(file)).id}`))
}

// Löschen mit Rückfrage
const deleting = ref<CustomModuleSummary | null>(null)
const remove = () => run(async () => {
  await custom.remove(deleting.value!.id)
  deleting.value = null
})

const menu = (module: CustomModuleSummary) => [[
  { label: t('teaching.custom.preview'), icon: 'i-lucide-eye', to: `/learn/${module.id}` },
  { label: t('teaching.custom.duplicate'), icon: 'i-lucide-copy', onSelect: () => duplicate(module) },
  { label: t('teaching.custom.export'), icon: 'i-lucide-download', onSelect: () => download(module) },
], ...(module.editable ? [[{ label: t('teaching.custom.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (deleting.value = module) }]] : [])]
const levels = (module: CustomModuleSummary) => module.levels.map(l => teaching.levelTitle(l)).join(', ')
</script>

<template>
  <UContainer class="py-8">
    <UButton
      to="/teaching"
      icon="i-lucide-arrow-left"
      variant="ghost"
      color="neutral"
      :label="teaching.title.value"
      class="mb-4"
    />
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="max-w-3xl">
        <h1 class="text-2xl font-bold">
          {{ t('teaching.custom.title') }}
        </h1>
        <p class="mt-2 text-(--ui-text-muted)">
          {{ t('teaching.custom.intro') }}
        </p>
      </div>
      <div
        v-if="staff"
        class="flex flex-wrap gap-2"
      >
        <UButton
          icon="i-lucide-upload"
          variant="outline"
          color="neutral"
          :label="t('teaching.custom.import')"
          :loading="busy"
          @click="fileInput?.click()"
        />
        <UButton
          icon="i-lucide-plus"
          :label="t('teaching.custom.new')"
          data-testid="custom-new"
          @click="createOpen = true"
        />
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          data-testid="custom-import-file"
          @change="upload"
        >
      </div>
    </div>

    <div
      v-if="learn.loading.value"
      class="py-12 text-center text-(--ui-text-muted)"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin"
      />
    </div>

    <UAlert
      v-else-if="!staff"
      color="info"
      variant="subtle"
      icon="i-lucide-lock"
      :description="t('teaching.custom.staffOnly')"
    />

    <div
      v-else
      class="space-y-8"
    >
      <section
        v-for="list in [{ key: 'mine', title: t('teaching.custom.mine'), modules: mine }, { key: 'others', title: t('teaching.custom.others'), modules: others }]"
        :key="list.key"
        :data-testid="`custom-list-${list.key}`"
      >
        <h2 class="mb-3 text-lg font-semibold">
          {{ list.title }}
        </h2>
        <p
          v-if="!list.modules.length"
          class="text-sm text-(--ui-text-muted)"
        >
          {{ list.key === 'mine' ? t('teaching.custom.noneMine') : t('teaching.custom.noneOthers') }}
        </p>
        <div
          v-else
          class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <UCard
            v-for="module in list.modules"
            :key="module.id"
            :data-testid="`custom-card-${module.title}`"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-xs font-semibold tracking-wide text-(--ui-text-muted) uppercase">
                  {{ [module.code, t(`learn.tracks.${module.track}.title`)].filter(Boolean).join(' · ') }}
                </p>
                <h3 class="mt-1 truncate font-semibold">
                  {{ module.title || t('teaching.custom.untitled') }}
                </h3>
              </div>
              <UDropdownMenu :items="menu(module)">
                <UButton
                  icon="i-lucide-ellipsis"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  :aria-label="t('teaching.actions')"
                  data-testid="custom-card-menu"
                />
              </UDropdownMenu>
            </div>
            <p
              v-if="module.summary"
              class="mt-2 line-clamp-3 text-sm text-(--ui-text-muted)"
            >
              {{ module.summary }}
            </p>
            <div class="mt-3 flex flex-wrap gap-1">
              <UBadge
                :label="t('teaching.custom.taskCount', { n: module.tasks.length }, module.tasks.length)"
                variant="subtle"
                color="neutral"
              />
              <UBadge
                v-if="!module.ready"
                :label="t('teaching.custom.incomplete')"
                variant="subtle"
                color="warning"
                data-testid="custom-card-incomplete"
              />
              <UBadge
                v-if="module.levels.length"
                :label="levels(module)"
                variant="subtle"
                color="primary"
              />
            </div>
            <p class="mt-3 text-xs text-(--ui-text-muted)">
              {{ module.author && !module.mine ? `${t('learn.custom.by', { name: module.author })} · ` : '' }}{{ t('teaching.custom.updated', { date: d(new Date(module.updatedAt), { dateStyle: 'medium' }) }) }}
            </p>
            <template #footer>
              <UButton
                :to="`/teaching/modules/${module.id}`"
                :icon="module.editable ? 'i-lucide-pencil' : 'i-lucide-eye'"
                :label="module.editable ? t('teaching.custom.edit') : t('teaching.custom.view')"
                variant="soft"
                block
                data-testid="custom-card-open"
              />
            </template>
          </UCard>
        </div>
      </section>
    </div>

    <UModal
      v-model:open="createOpen"
      :title="t('teaching.custom.new')"
      :description="t('teaching.custom.newHint')"
    >
      <template #body>
        <form
          id="custom-create"
          class="space-y-4"
          @submit.prevent="create"
        >
          <UFormField
            :label="t('teaching.custom.moduleTitle')"
            required
          >
            <UInput
              v-model="form.title"
              maxlength="120"
              class="w-full"
              autofocus
              data-testid="custom-new-title"
            />
          </UFormField>
          <UFormField :label="t('teaching.custom.track')">
            <URadioGroup
              v-model="form.track"
              :items="trackItems"
              variant="card"
              :ui="{ fieldset: 'gap-2' }"
              data-testid="custom-new-track"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="custom-create"
          :label="t('teaching.custom.create')"
          :loading="busy"
          :disabled="!form.title.trim()"
          data-testid="custom-new-create"
        />
      </template>
    </UModal>

    <UModal
      :open="!!deleting"
      :title="t('teaching.custom.deleteTitle')"
      :description="t('teaching.custom.deleteHint')"
      @update:open="open => !open && (deleting = null)"
    >
      <template #footer>
        <UButton
          :label="t('teaching.custom.cancel')"
          variant="outline"
          color="neutral"
          @click="deleting = null"
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
