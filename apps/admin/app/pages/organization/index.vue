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
})

const typeItems = computed(() => [
  { label: t('admin.organizationType.school'), value: 'school' },
  { label: t('admin.organizationType.company'), value: 'company' },
])

async function save() {
  try {
    await $fetch('/api/admin/organization', { method: 'PATCH', body: form })
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
        class="max-w-xl space-y-4"
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
        <UButton
          type="submit"
          :label="t('admin.save')"
        />
      </form>
    </template>
  </UDashboardPanel>
</template>
