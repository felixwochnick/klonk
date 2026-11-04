<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'

definePageMeta({ requiresPlatformAdmin: true })

type AccountRow = {
  id: string
  displayName: string
  email: string | null
  platformRole: PlatformRole
  disabled: boolean
  createdAt: string
  lastLoginAt: string | null
  providers: string[]
  plan: string | null
}

const { t, d } = useI18n()
useSeoMeta({ title: () => t('admin.nav.accounts') })

const toast = useToast()
const apiError = useApiError()
const { user } = useAuth()
const isOwner = computed(() => user.value?.platformRole === 'owner')

const { data: accounts, refresh } = await useFetch<AccountRow[]>('/api/admin/accounts', { default: () => [] })

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return accounts.value
  return accounts.value.filter(a => a.displayName.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q))
})

const columns = computed<TableColumn<AccountRow>[]>(() => [
  { accessorKey: 'displayName', header: t('admin.users.displayName') },
  { accessorKey: 'providers', header: t('admin.accounts.providers') },
  { accessorKey: 'platformRole', header: t('admin.accounts.platformRole') },
  { accessorKey: 'plan', header: t('admin.accounts.plan') },
  { accessorKey: 'lastLoginAt', header: t('admin.users.lastLogin') },
  { id: 'actions' },
])

const providerIcons: Record<string, string> = {
  google: 'i-logos-google-icon',
  microsoft: 'i-logos-microsoft-icon',
  apple: 'i-simple-icons-apple',
  github: 'i-simple-icons-github',
  platform: 'i-lucide-shield-user',
}

/** Klonk-ID-Konten bekommen ihre Rolle aus den Gruppen beim Login */
const fromGroups = (row: AccountRow) => row.providers.includes('platform')

function actions(row: AccountRow): DropdownMenuItem[][] {
  if (row.id === user.value?.id) return []
  const groups: DropdownMenuItem[][] = []
  if (isOwner.value && !fromGroups(row)) {
    groups.push((['user', 'developer', 'owner'] as const)
      .filter(role => role !== row.platformRole)
      .map(role => ({
        label: t(`admin.accounts.makeRole.${role}`),
        icon: role === 'user' ? 'i-lucide-user' : 'i-lucide-shield-user',
        onSelect: () => update(row, { platformRole: role }),
      })))
  }
  if (isOwner.value || row.platformRole !== 'owner') {
    groups.push([{
      label: row.disabled ? t('admin.users.enable') : t('admin.users.disable'),
      icon: row.disabled ? 'i-lucide-lock-open' : 'i-lucide-lock',
      onSelect: () => update(row, { disabled: !row.disabled }),
    }])
  }
  return groups
}

async function update(row: AccountRow, body: { platformRole?: PlatformRole, disabled?: boolean }) {
  try {
    await $fetch(`/api/admin/accounts/${row.id}`, { method: 'PATCH', body })
    toast.add({ title: t('admin.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="accounts">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.accounts')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="text-(--ui-text-muted)">
        {{ t('admin.accounts.intro') }}
      </p>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('admin.accounts.search')"
        class="max-w-sm"
      />

      <UTable
        :data="filtered"
        :columns="columns"
        :empty="t('admin.accounts.empty')"
      >
        <template #displayName-cell="{ row }">
          <div>
            <span class="font-medium">{{ row.original.displayName }}</span>
            <UBadge
              v-if="row.original.disabled"
              :label="t('admin.users.disabled')"
              color="error"
              variant="subtle"
              size="sm"
              class="ms-2"
            />
          </div>
          <div class="text-(--ui-text-muted)">
            {{ row.original.email }}
          </div>
        </template>
        <template #providers-cell="{ row }">
          <div class="flex items-center gap-2">
            <UTooltip
              v-for="provider in row.original.providers"
              :key="provider"
              :text="t(`admin.accounts.provider.${provider}`)"
            >
              <UIcon
                :name="providerIcons[provider] ?? 'i-lucide-key-round'"
                class="size-4"
              />
            </UTooltip>
          </div>
        </template>
        <template #platformRole-cell="{ row }">
          <UBadge
            v-if="row.original.platformRole !== 'user'"
            :label="t(`admin.accounts.role.${row.original.platformRole}`)"
            :color="row.original.platformRole === 'owner' ? 'primary' : 'info'"
            variant="subtle"
          />
          <span v-else>{{ t('admin.accounts.role.user') }}</span>
          <UTooltip
            v-if="fromGroups(row.original)"
            :text="t('admin.accounts.fromGroups')"
          >
            <UIcon
              name="i-lucide-users-round"
              class="ms-2 size-4 align-middle text-(--ui-text-muted)"
            />
          </UTooltip>
        </template>
        <template #plan-cell="{ row }">
          {{ row.original.plan ? t(`admin.accounts.plans.${row.original.plan}`, row.original.plan) : t('admin.accounts.free') }}
        </template>
        <template #lastLoginAt-cell="{ row }">
          {{ row.original.lastLoginAt ? d(new Date(row.original.lastLoginAt), { dateStyle: 'medium', timeStyle: 'short' }) : '–' }}
        </template>
        <template #actions-cell="{ row }">
          <div class="text-right">
            <UDropdownMenu
              v-if="actions(row.original).length"
              :items="actions(row.original)"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                :aria-label="t('admin.users.actions', { name: row.original.displayName })"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UTable>
    </template>
  </UDashboardPanel>
</template>
