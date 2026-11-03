<script setup lang="ts">
// Gruppen (Klassen, Kurse): Mitglieder, Gruppenleitung, Schreibrecht im gemeinsamen Cloud-Ordner
const { t } = useI18n()
useSeoMeta({ title: () => t('admin.nav.groups') })

const toast = useToast()
const apiError = useApiError()
const { user } = useAuth()

type GroupRole = 'leader' | 'member'
const { data: groups, refresh } = await useFetch('/api/admin/groups')
const { data: accounts } = await useFetch('/api/admin/users')

const selectedId = ref<string | null>(null)
const { data: group, refresh: refreshGroup } = useFetch(() => `/api/admin/groups/${selectedId.value}`, {
  immediate: false,
  watch: false,
})
watch(selectedId, (id) => {
  if (id) void refreshGroup()
})

const newName = ref('')
async function create() {
  if (!newName.value.trim()) return
  try {
    const { id } = await $fetch('/api/admin/groups', { method: 'POST', body: { name: newName.value } })
    newName.value = ''
    await refresh()
    selectedId.value = id
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}

async function call(action: () => Promise<unknown>, success?: string) {
  try {
    await action()
    if (success) toast.add({ title: success, color: 'success' })
    await Promise.all([refresh(), refreshGroup()])
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}

/** Anfragen an die gewählte Gruppe (eigene Funktion – die typisierten Routen von $fetch sind hier zu tief) */
function groupApi(suffix: string, options: { method: 'PATCH' | 'PUT' | 'DELETE', body?: Record<string, unknown> }) {
  const url: string = `/api/admin/groups/${selectedId.value}${suffix}`
  return $fetch<{ ok: boolean }>(url, options as object)
}

const name = ref('')
watch(group, (g) => {
  name.value = g?.name ?? ''
})
const rename = () => call(() => groupApi('', { method: 'PATCH', body: { name: name.value } }), t('admin.saved'))
const setWrite = (membersCanWrite: boolean) => call(() => groupApi('', { method: 'PATCH', body: { membersCanWrite } }))
const setRole = (userId: string, role: GroupRole) => call(() => groupApi('/members', { method: 'PUT', body: { userIds: [userId], role } }))
const removeMember = (userId: string) => call(() => groupApi('/members', { method: 'DELETE', body: { userId } }))
async function removeGroup() {
  if (!confirm(t('admin.groups.confirmDelete', { name: group.value?.name ?? '' }))) return
  await call(() => groupApi('', { method: 'DELETE' }))
  selectedId.value = null
}

// Mitglieder hinzufügen: Lehrkräfte standardmäßig als Leitung
const toAdd = ref<string[]>([])
const addRole = ref<GroupRole>('member')
const candidates = computed(() => (accounts.value ?? [])
  .filter(a => !group.value?.members.some(m => m.userId === a.id))
  .map(a => ({ value: a.id, label: `${a.displayName} (${a.username})` })))
async function addMembers() {
  if (!toAdd.value.length) return
  await call(() => groupApi('/members', { method: 'PUT', body: { userIds: toAdd.value, role: addRole.value } }))
  toAdd.value = []
}

const roleItems = computed(() => (['leader', 'member'] as const).map(value => ({ value, label: t(`admin.groups.roles.${value}`) })))
const canManage = computed(() => !!group.value?.canManage)
const isTeacher = computed(() => user.value?.role === 'teacher')
</script>

<template>
  <UDashboardPanel id="groups">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.groups')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div class="space-y-3">
          <p class="text-sm text-(--ui-text-muted)">
            {{ t('admin.groups.description') }}
          </p>
          <form
            class="flex gap-2"
            @submit.prevent="create"
          >
            <UInput
              v-model="newName"
              :placeholder="t('admin.groups.namePlaceholder')"
              :aria-label="t('admin.groups.name')"
              class="flex-1"
              data-testid="group-new-name"
            />
            <UButton
              type="submit"
              icon="i-lucide-plus"
              :label="t('admin.groups.create')"
              :disabled="!newName.trim()"
              data-testid="group-create"
            />
          </form>
          <p
            v-if="!groups?.length"
            class="text-sm text-(--ui-text-muted)"
          >
            {{ t('admin.groups.empty') }}
          </p>
          <UButton
            v-for="g in groups"
            :key="g.id"
            :variant="g.id === selectedId ? 'soft' : 'ghost'"
            :color="g.id === selectedId ? 'primary' : 'neutral'"
            icon="i-lucide-users-round"
            block
            class="justify-start"
            :data-testid="`group-${g.name}`"
            @click="selectedId = g.id"
          >
            <span class="flex-1 truncate text-start">{{ g.name }}</span>
            <UBadge
              :label="String(g.members)"
              variant="subtle"
              size="sm"
            />
          </UButton>
        </div>

        <UCard
          v-if="group && selectedId"
          data-testid="group-detail"
        >
          <template #header>
            <form
              class="flex flex-wrap items-end gap-2"
              @submit.prevent="rename"
            >
              <UFormField
                :label="t('admin.groups.name')"
                class="flex-1"
              >
                <UInput
                  v-model="name"
                  :disabled="!canManage"
                  class="w-full"
                />
              </UFormField>
              <UButton
                v-if="canManage"
                type="submit"
                variant="outline"
                :label="t('admin.save')"
                :disabled="!name.trim() || name === group.name"
              />
              <UButton
                v-if="canManage"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                :aria-label="t('admin.groups.delete')"
                @click="removeGroup"
              />
            </form>
          </template>

          <div class="space-y-6">
            <UAlert
              v-if="!canManage"
              color="info"
              variant="subtle"
              icon="i-lucide-lock"
              :title="t('admin.groups.readOnly')"
            />
            <USwitch
              :model-value="group.membersCanWrite"
              :disabled="!canManage"
              :label="t('admin.groups.membersCanWrite')"
              :description="t('admin.groups.membersCanWriteHelp')"
              data-testid="group-members-can-write"
              @update:model-value="setWrite"
            />

            <div
              v-if="canManage"
              class="flex flex-wrap items-end gap-2"
            >
              <UFormField
                :label="t('admin.groups.addMembers')"
                class="min-w-64 flex-1"
              >
                <USelectMenu
                  v-model="toAdd"
                  :items="candidates"
                  value-key="value"
                  multiple
                  :placeholder="t('admin.groups.searchAccounts')"
                  class="w-full"
                  data-testid="group-add-members"
                />
              </UFormField>
              <USelect
                v-model="addRole"
                :items="roleItems"
                :aria-label="t('admin.groups.role')"
                class="w-44"
              />
              <UButton
                icon="i-lucide-user-plus"
                :label="t('admin.groups.add')"
                :disabled="!toAdd.length"
                data-testid="group-add"
                @click="addMembers"
              />
            </div>

            <table class="w-full text-sm">
              <thead class="text-(--ui-text-muted)">
                <tr>
                  <th class="py-1 text-start font-normal">
                    {{ t('admin.groups.member') }}
                  </th>
                  <th class="py-1 text-start font-normal">
                    {{ t('admin.groups.role') }}
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="m in group.members"
                  :key="m.userId"
                  class="border-t border-(--ui-border)"
                  :data-testid="`group-member-${m.username}`"
                >
                  <td class="py-2">
                    {{ m.displayName }}
                    <span class="text-(--ui-text-dimmed)">· {{ m.username }}</span>
                  </td>
                  <td class="py-2">
                    <USelect
                      :model-value="m.role"
                      :items="roleItems"
                      :disabled="!canManage"
                      :aria-label="t('admin.groups.roleOf', { name: m.displayName })"
                      class="w-44"
                      @update:model-value="setRole(m.userId, $event as GroupRole)"
                    />
                  </td>
                  <td class="py-2 text-end">
                    <UButton
                      v-if="canManage"
                      variant="ghost"
                      color="neutral"
                      icon="i-lucide-user-minus"
                      :aria-label="t('admin.groups.remove', { name: m.displayName })"
                      @click="removeMember(m.userId)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <p
              v-if="isTeacher && canManage"
              class="text-xs text-(--ui-text-dimmed)"
            >
              {{ t('admin.groups.leaderHint') }}
            </p>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
