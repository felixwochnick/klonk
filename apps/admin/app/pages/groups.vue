<script setup lang="ts">
// Gruppen (Klassen, Kurse): Mitglieder, Gruppenleitung, Schreibrecht im gemeinsamen Cloud-Ordner.
// Schulen mit Schulform sehen die Gruppen nach Jahrgangsstufen geordnet, dazu „Zusatzkurse“ (AGs, Wahlkurse …).
const { t } = useI18n()
useSeoMeta({ title: () => t('admin.nav.groups') })

const toast = useToast()
const apiError = useApiError()
const { user } = useAuth()

type GroupRole = 'leader' | 'member'
const { data: groups, refresh } = await useFetch('/api/admin/groups')
const { data: accounts, refresh: refreshAccounts } = await useFetch('/api/admin/users')
const { data: organization } = await useFetch('/api/admin/organization')

// Gliederung: Jahrgangsstufen der Schulform (+ Stufen, die Gruppen noch haben), Zusatzkurse, nicht zugeordnet
const schoolLevelList = computed(() => (organization.value?.type === 'school' ? schoolLevels(organization.value.schoolForm) : []))
const structured = computed(() => schoolLevelList.value.length > 0)
const levels = computed(() => [...new Set([...schoolLevelList.value, ...(groups.value ?? []).map(g => g.level).filter((l): l is string => !!l && l !== COURSES_LEVEL)])]
  .sort((a, b) => Number(a) - Number(b)))
const sections = computed(() => {
  const list = groups.value ?? []
  if (!structured.value) return [{ key: 'all', level: null, title: '', groups: list }]
  return [
    ...levels.value.map(level => ({ key: level, level, title: t('admin.groups.level', { n: level }), groups: list.filter(g => g.level === level) })),
    { key: COURSES_LEVEL, level: COURSES_LEVEL, title: t('admin.groups.courses'), groups: list.filter(g => g.level === COURSES_LEVEL) },
    { key: 'none', level: null, title: t('admin.groups.unassigned'), groups: list.filter(g => !g.level) },
  ].filter(section => section.key !== 'none' || section.groups.length)
})
const levelItems = computed(() => [
  { value: 'none', label: t('admin.groups.unassigned') },
  ...levels.value.map(level => ({ value: level, label: t('admin.groups.level', { n: level }) })),
  { value: COURSES_LEVEL, label: t('admin.groups.courses') },
])

const selectedId = ref<string | null>(null)
const { data: group, refresh: refreshGroup } = useFetch(() => `/api/admin/groups/${selectedId.value}`, {
  immediate: false,
  watch: false,
})
watch(selectedId, (id) => {
  if (id) void refreshGroup()
})

const newName = ref('')
/** Einordnung der neuen Gruppe – folgt dem Namen („5a“ ⇒ 5), bis sie von Hand gewählt wird */
const newLevel = ref('none')
const levelTouched = ref(false)
watch(newName, (name) => {
  if (!levelTouched.value) newLevel.value = levelFromGroupName(name, levels.value) ?? 'none'
})
const nameInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('nameInput')
function createIn(level: string | null) {
  newLevel.value = level ?? 'none'
  levelTouched.value = true
  nameInput.value?.inputRef?.focus()
}
async function create() {
  if (!newName.value.trim()) return
  try {
    const level = structured.value && newLevel.value !== 'none' ? newLevel.value : null
    const { id } = await $fetch('/api/admin/groups', { method: 'POST', body: { name: newName.value, level } })
    newName.value = ''
    levelTouched.value = false
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
const setLevel = (level: string) => call(() => groupApi('', { method: 'PATCH', body: { level: level === 'none' ? null : level } }))
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

// Liste hochladen: vorhandene Konten Gruppen zuordnen
const importOpen = ref(false)
const currentGroup = computed(() => (group.value && selectedId.value ? { id: selectedId.value, name: group.value.name, canManage: group.value.canManage } : null))
async function onImported() {
  await Promise.all([refresh(), refreshAccounts(), selectedId.value ? refreshGroup() : null])
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
        <template #right>
          <UButton
            variant="outline"
            icon="i-lucide-file-spreadsheet"
            :label="t('admin.import.members')"
            data-testid="groups-import"
            @click="importOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div class="space-y-3">
          <p class="text-sm text-(--ui-text-muted)">
            {{ t('admin.groups.description') }}
          </p>
          <UAlert
            v-if="organization?.type === 'school' && !structured"
            color="info"
            variant="subtle"
            icon="i-lucide-school"
            :title="t('admin.groups.structureHint')"
            data-testid="groups-structure-hint"
          />
          <form
            class="space-y-2"
            @submit.prevent="create"
          >
            <div class="flex gap-2">
              <UInput
                ref="nameInput"
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
            </div>
            <USelect
              v-if="structured"
              v-model="newLevel"
              :items="levelItems"
              :aria-label="t('admin.groups.placement')"
              class="w-full"
              data-testid="group-new-level"
              @update:model-value="levelTouched = true"
            />
          </form>
          <p
            v-if="!groups?.length && !structured"
            class="text-sm text-(--ui-text-muted)"
          >
            {{ t('admin.groups.empty') }}
          </p>
          <div
            v-for="section in sections"
            :key="section.key"
            class="space-y-1"
            :data-testid="`group-section-${section.key}`"
          >
            <div
              v-if="section.title"
              class="flex items-center justify-between border-b border-(--ui-border) pt-2 pb-1"
            >
              <h3 class="text-xs font-semibold tracking-wide text-(--ui-text-muted) uppercase">
                {{ section.title }}
              </h3>
              <UButton
                v-if="section.key !== 'none'"
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-plus"
                :aria-label="t('admin.groups.createIn', { name: section.title })"
                @click="createIn(section.level)"
              />
            </div>
            <UButton
              v-for="g in section.groups"
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
            <UFormField
              v-if="structured"
              :label="t('admin.groups.placement')"
            >
              <USelect
                :model-value="group.level ?? 'none'"
                :items="levelItems"
                :disabled="!canManage"
                class="w-64"
                data-testid="group-level"
                @update:model-value="setLevel($event as string)"
              />
            </UFormField>
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

      <GroupMemberImport
        v-model:open="importOpen"
        :accounts="accounts ?? []"
        :groups="groups ?? []"
        :current="currentGroup"
        :domain="organization?.domain ?? ''"
        :levels="levels"
        :query="{}"
        @done="onImported"
      />
    </template>
  </UDashboardPanel>
</template>
