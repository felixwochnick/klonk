<script setup lang="ts">
definePageMeta({ requiresAdmin: true })

const { t } = useI18n()
useSeoMeta({ title: () => t('admin.nav.organization') })

const toast = useToast()
const apiError = useApiError()
const { refresh: refreshAuth } = useAuth()

const { data: org } = await useFetch('/api/admin/organization')
const form = reactive({
  name: org.value?.name ?? '',
  type: (org.value?.type ?? 'school') as OrganizationType,
  domain: org.value?.domain ?? '',
  learnStorage: [...(org.value?.learnStorage ?? ['cloud', 'browser', 'folder'])] as ('cloud' | 'browser' | 'folder')[],
})

// Schulen: Land → Bundesland → Schulform; daraus ergeben sich die Jahrgangsstufen unter Gruppen ('none' = nicht gewählt)
const NONE = 'none'
const school = reactive({
  country: (org.value?.country ?? 'DE') as SchoolCountry,
  state: org.value?.state ?? NONE,
  schoolForm: org.value?.schoolForm ?? NONE,
})
const countryItems = computed(() => SCHOOL_COUNTRIES.map(value => ({ value, label: t(`admin.school.countries.${value}`) })))
const stateItems = computed(() => [
  { value: NONE, label: t('admin.school.chooseState') },
  ...schoolStates(school.country).map(value => ({ value, label: t(`admin.school.states.${value}`) }))
    .sort((a, b) => a.label.localeCompare(b.label)),
])
const formItems = computed(() => [
  { value: NONE, label: t('admin.school.chooseForm') },
  ...schoolForms(school.country, school.state === NONE ? null : school.state).map(value => ({ value, label: schoolFormLabel(value) })),
])
const schoolFormLabel = (form: SchoolForm) => {
  const levels = schoolLevels(form)
  return `${t(`admin.school.forms.${form}`)} (${levels[0]}–${levels.at(-1)})`
}
// Schulform passt nicht mehr zum Bundesland ⇒ zurücksetzen
watch(() => school.state, () => {
  if (school.schoolForm !== NONE && !formItems.value.some(i => i.value === school.schoolForm)) school.schoolForm = NONE
})

// Speicherorte für Lernmodule (Gruppenleitungen können sie für ihre Gruppe weiter einschränken)
const storageItems = computed(() => (['cloud', 'browser', 'folder'] as const).map(value => ({
  value,
  label: t(`admin.organization.learnStorage.${value}.label`),
  description: t(`admin.organization.learnStorage.${value}.description`),
})))

const typeItems = computed(() => [
  { label: t('admin.organizationType.school'), value: 'school' },
  { label: t('admin.organizationType.company'), value: 'company' },
])

async function save() {
  try {
    const isSchool = form.type === 'school'
    await $fetch('/api/admin/organization', {
      method: 'PATCH',
      body: {
        ...form,
        country: isSchool ? school.country : null,
        state: isSchool && school.state !== NONE ? school.state : null,
        schoolForm: isSchool && school.schoolForm !== NONE ? school.schoolForm : null,
      },
    })
    await refreshAuth()
    toast.add({ title: t('admin.saved'), color: 'success' })
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="organization">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.organization')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <form
        class="max-w-2xl space-y-4"
        @submit.prevent="save"
      >
        <UFormField :label="t('admin.organization.type')">
          <URadioGroup
            v-model="form.type"
            :items="typeItems"
            orientation="horizontal"
          />
        </UFormField>
        <UFormField :label="t('admin.organization.name')">
          <UInput
            v-model="form.name"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField
          :label="t('admin.organization.domain')"
          :help="t('admin.organization.domainChangeHelp')"
        >
          <UInput
            v-model="form.domain"
            class="w-full"
            required
          />
        </UFormField>
        <div
          v-if="form.type === 'school'"
          class="grid gap-4 sm:grid-cols-3"
          data-testid="organization-school"
        >
          <UFormField :label="t('admin.school.country')">
            <USelect
              v-model="school.country"
              :items="countryItems"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.school.state')">
            <USelect
              v-model="school.state"
              :items="stateItems"
              class="w-full"
              data-testid="organization-state"
            />
          </UFormField>
          <UFormField :label="t('admin.school.form')">
            <USelect
              v-model="school.schoolForm"
              :items="formItems"
              class="w-full"
              data-testid="organization-school-form"
            />
          </UFormField>
          <p class="text-xs text-(--ui-text-dimmed) sm:col-span-3">
            {{ t('admin.school.help') }}
          </p>
        </div>
        <UFormField
          :label="t('admin.organization.learnStorage.title')"
          :help="t('admin.organization.learnStorage.help')"
        >
          <UCheckboxGroup
            v-model="form.learnStorage"
            :items="storageItems"
            data-testid="organization-learn-storage"
          />
        </UFormField>
        <UButton
          type="submit"
          :label="t('admin.save')"
          :disabled="!form.learnStorage.length"
        />
      </form>
    </template>
  </UDashboardPanel>
</template>
