<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ requiresPlatformAdmin: true })

type OrgRow = { id: string, name: string, type: OrganizationType, domain: string, users: number }

const { t } = useI18n()
useSeoMeta({ title: () => t('admin.nav.organizations') })

const toast = useToast()
const apiError = useApiError()

const { data: organizations, refresh } = await useFetch<OrgRow[]>('/api/admin/organizations', { default: () => [] })

const columns = computed<TableColumn<OrgRow>[]>(() => [
  { accessorKey: 'name', header: t('admin.organization.name') },
  { accessorKey: 'domain', header: t('admin.organization.domain') },
  { accessorKey: 'type', header: t('admin.organization.type') },
  { accessorKey: 'users', header: t('admin.nav.users') },
])

const typeItems = computed(() => [
  { label: t('admin.organizationType.school'), value: 'school' },
  { label: t('admin.organizationType.company'), value: 'company' },
])

const open = ref(false)
const form = reactive({
  type: 'school' as OrganizationType,
  name: '',
  domain: '',
  admin: { username: 'admin', displayName: '', password: '' },
})

async function create() {
  try {
    await $fetch('/api/admin/organizations', { method: 'POST', body: form })
    toast.add({ title: t('admin.organizations.created'), color: 'success' })
    open.value = false
    await refresh()
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="organizations">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.organizations')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-plus"
            :label="t('admin.organizations.create')"
            @click="open = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable
        :data="organizations"
        :columns="columns"
      >
        <template #name-cell="{ row }">
          <NuxtLink
            :to="{ path: '/users', query: { organizationId: row.original.id } }"
            class="font-medium text-(--ui-primary) hover:underline"
          >
            {{ row.original.name }}
          </NuxtLink>
        </template>
        <template #type-cell="{ row }">
          {{ t(`admin.organizationType.${row.original.type}`) }}
        </template>
      </UTable>

      <UModal
        v-model:open="open"
        :title="t('admin.organizations.create')"
      >
        <template #body>
          <form
            id="create-org"
            class="space-y-4"
            @submit.prevent="create"
          >
            <URadioGroup
              v-model="form.type"
              :items="typeItems"
              orientation="horizontal"
            />
            <UFormField :label="t('admin.organization.name')">
              <UInput
                v-model="form.name"
                class="w-full"
                required
              />
            </UFormField>
            <UFormField :label="t('admin.organization.domain')">
              <UInput
                v-model="form.domain"
                class="w-full"
                required
              />
            </UFormField>
            <USeparator :label="t('admin.setup.adminAccount')" />
            <UFormField :label="t('admin.users.displayName')">
              <UInput
                v-model="form.admin.displayName"
                class="w-full"
                required
              />
            </UFormField>
            <UFormField :label="t('admin.users.username')">
              <UInput
                v-model="form.admin.username"
                class="w-full"
                required
              />
            </UFormField>
            <UFormField
              :label="t('admin.users.initialPassword')"
              :help="t('admin.users.initialPasswordHelp')"
            >
              <UInput
                v-model="form.admin.password"
                minlength="8"
                class="w-full"
                required
              />
            </UFormField>
          </form>
        </template>
        <template #footer>
          <UButton
            type="submit"
            form="create-org"
            :label="t('admin.organizations.create')"
          />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
