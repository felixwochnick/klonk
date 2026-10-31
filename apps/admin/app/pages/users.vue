<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'

type UserRow = {
  id: string
  username: string | null
  displayName: string
  role: MemberRole
  disabled: boolean
  hasPassword: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
}

const { t, d } = useI18n()
useSeoMeta({ title: () => t('admin.nav.users') })

const toast = useToast()
const apiError = useApiError()
const { user, isPlatformAdmin } = useAuth()
const isAdmin = computed(() => user.value?.role === 'admin' || isPlatformAdmin.value)

// Plattform-Admins verwalten fremde Organisationen über ?organizationId=
const route = useRoute()
const query = computed(() => (typeof route.query.organizationId === 'string' ? { organizationId: route.query.organizationId } : {}))
if (!user.value?.organizationId && !query.value.organizationId) await navigateTo('/organizations')

const { data: users, refresh } = await useFetch<UserRow[]>('/api/admin/users', { query, default: () => [] })
const { data: organization } = await useFetch('/api/admin/organization', { query })
const roleLabel = useRoleLabel(() => organization.value?.type)

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(u => u.displayName.toLowerCase().includes(q) || u.username?.includes(q))
})

const columns = computed<TableColumn<UserRow>[]>(() => [
  { accessorKey: 'displayName', header: t('admin.users.displayName') },
  { accessorKey: 'username', header: t('admin.users.username') },
  { accessorKey: 'role', header: t('admin.users.role') },
  { accessorKey: 'lastLoginAt', header: t('admin.users.lastLogin') },
  { id: 'actions' },
])

const roleItems = computed(() => (['member', 'teacher', 'admin'] as const).map(r => ({ label: roleLabel(r), value: r })))

/** Lehrkräfte dürfen nur Lernende zurücksetzen, niemand sich selbst */
function canReset(row: UserRow) {
  if (row.id === user.value?.id) return false
  return isAdmin.value || row.role === 'member'
}

function actions(row: UserRow): DropdownMenuItem[][] {
  const groups: DropdownMenuItem[][] = []
  if (canReset(row))
    groups.push([{ label: t('admin.users.resetPassword'), icon: 'i-lucide-key-round', onSelect: () => openReset(row) }])
  if (isAdmin.value && row.id !== user.value?.id) {
    groups.push([
      { label: t('admin.users.edit'), icon: 'i-lucide-pencil', onSelect: () => openEdit(row) },
      {
        label: row.disabled ? t('admin.users.enable') : t('admin.users.disable'),
        icon: row.disabled ? 'i-lucide-lock-open' : 'i-lucide-lock',
        onSelect: () => update(row, { disabled: !row.disabled }),
      },
    ])
    groups.push([{ label: t('admin.users.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(row) }])
  }
  return groups
}

// Anlegen
const createOpen = ref(false)
const createForm = reactive({ username: '', displayName: '', role: 'member' as MemberRole, password: '' })

async function create() {
  try {
    await $fetch('/api/admin/users', { method: 'POST', body: createForm, query: query.value })
    toast.add({ title: t('admin.users.created'), color: 'success' })
    createOpen.value = false
    Object.assign(createForm, { username: '', displayName: '', role: 'member', password: '' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}

// Bearbeiten
const editing = ref<UserRow | null>(null)
const editForm = reactive({ displayName: '', role: 'member' as MemberRole })

function openEdit(row: UserRow) {
  editing.value = row
  Object.assign(editForm, { displayName: row.displayName, role: row.role })
}

async function update(row: UserRow, body: Partial<Pick<UserRow, 'displayName' | 'role' | 'disabled'>>) {
  try {
    await $fetch(`/api/admin/users/${row.id}`, { method: 'PATCH', body })
    toast.add({ title: t('admin.saved'), color: 'success' })
    editing.value = null
    await refresh()
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}

// Passwort zurücksetzen
const resetting = ref<UserRow | null>(null)
const resetPassword = ref('')

function openReset(row: UserRow) {
  resetting.value = row
  resetPassword.value = ''
}

async function reset() {
  try {
    await $fetch(`/api/admin/users/${resetting.value!.id}/reset-password`, {
      method: 'POST',
      body: { password: resetPassword.value },
    })
    toast.add({ title: t('admin.users.passwordReset'), color: 'success' })
    resetting.value = null
    await refresh()
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}

async function remove(row: UserRow) {
  if (!confirm(t('admin.users.confirmDelete', { name: row.displayName }))) return
  try {
    await $fetch(`/api/admin/users/${row.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar :title="organization && query.organizationId ? `${t('admin.nav.users')} · ${organization.name}` : t('admin.nav.users')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="isAdmin"
            icon="i-lucide-user-plus"
            :label="t('admin.users.create')"
            @click="createOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('admin.users.search')"
        class="max-w-sm"
      />

      <UTable
        :data="filtered"
        :columns="columns"
        :empty="t('admin.users.empty')"
      >
        <template #displayName-cell="{ row }">
          <span class="font-medium">{{ row.original.displayName }}</span>
          <UBadge
            v-if="row.original.disabled"
            :label="t('admin.users.disabled')"
            color="error"
            variant="subtle"
            size="sm"
            class="ms-2"
          />
          <UBadge
            v-else-if="row.original.mustChangePassword"
            :label="t('admin.users.mustChangePassword')"
            color="warning"
            variant="subtle"
            size="sm"
            class="ms-2"
          />
        </template>
        <template #username-cell="{ row }">
          <span class="text-(--ui-text-muted)">{{ row.original.username }}@{{ organization?.domain }}</span>
        </template>
        <template #role-cell="{ row }">
          {{ roleLabel(row.original.role) }}
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

      <UModal
        v-model:open="createOpen"
        :title="t('admin.users.create')"
      >
        <template #body>
          <form
            id="create-user"
            class="space-y-4"
            @submit.prevent="create"
          >
            <UFormField :label="t('admin.users.displayName')">
              <UInput
                v-model="createForm.displayName"
                name="displayName"
                class="w-full"
                required
              />
            </UFormField>
            <UFormField :label="t('admin.users.username')">
              <UInput
                v-model="createForm.username"
                name="username"
                class="w-full"
                required
              >
                <template #trailing>
                  <span class="text-xs text-(--ui-text-muted)">@{{ organization?.domain }}</span>
                </template>
              </UInput>
            </UFormField>
            <UFormField :label="t('admin.users.role')">
              <USelect
                v-model="createForm.role"
                :items="roleItems"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.users.initialPassword')"
              :help="t('admin.users.initialPasswordHelp')"
            >
              <UInput
                v-model="createForm.password"
                name="password"
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
            form="create-user"
            :label="t('admin.users.create')"
          />
        </template>
      </UModal>

      <UModal
        :open="!!editing"
        :title="t('admin.users.edit')"
        @update:open="v => !v && (editing = null)"
      >
        <template #body>
          <form
            id="edit-user"
            class="space-y-4"
            @submit.prevent="update(editing!, editForm)"
          >
            <UFormField :label="t('admin.users.displayName')">
              <UInput
                v-model="editForm.displayName"
                class="w-full"
                required
              />
            </UFormField>
            <UFormField :label="t('admin.users.role')">
              <USelect
                v-model="editForm.role"
                :items="roleItems"
                class="w-full"
              />
            </UFormField>
          </form>
        </template>
        <template #footer>
          <UButton
            type="submit"
            form="edit-user"
            :label="t('admin.save')"
          />
        </template>
      </UModal>

      <UModal
        :open="!!resetting"
        :title="t('admin.users.resetPassword')"
        :description="resetting ? t('admin.users.resetPasswordFor', { name: resetting.displayName }) : undefined"
        @update:open="v => !v && (resetting = null)"
      >
        <template #body>
          <form
            id="reset-password"
            @submit.prevent="reset"
          >
            <UFormField
              :label="t('admin.users.initialPassword')"
              :help="t('admin.users.initialPasswordHelp')"
            >
              <UInput
                v-model="resetPassword"
                name="password"
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
            form="reset-password"
            :label="t('admin.users.resetPassword')"
          />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
