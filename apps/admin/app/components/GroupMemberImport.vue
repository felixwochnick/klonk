<script setup lang="ts">
import { normalizeName, splitGroups, splitName } from '~/utils/import-columns'
import type { Table } from '~/utils/spreadsheet'

// Vorhandene Konten per Liste Gruppen zuordnen: Konto über Benutzername oder Namen finden, Gruppe fest oder aus einer Spalte
type Account = { id: string, username: string | null, displayName: string }
type Group = { id: string, name: string, canManage: boolean }
const props = defineProps<{
  accounts: Account[]
  groups: Group[]
  /** Gruppe, die gerade offen ist (Vorgabe als Ziel) */
  current: Group | null
  domain: string
  levels: string[]
  query: Record<string, string | undefined>
}>()
const emit = defineEmits<{ done: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const apiError = useApiError()

const { table, hasHeader, columns, rows, columnItems, load, cell, has } = useImportTable(['username', 'firstName', 'lastName', 'fullName', 'group'])
const target = ref<'current' | 'column'>('current')
const role = ref<'member' | 'leader'>('member')
const createGroups = ref(true)

function onLoaded(data: Table) {
  load(data)
  target.value = props.current && !has('group') ? 'current' : 'column'
  result.value = null
}

// Konten nach Benutzername und Anzeigename (beide Reihenfolgen) nachschlagen
const byUsername = computed(() => new Map(props.accounts.filter(a => a.username).map(a => [a.username!, a])))
const byName = computed(() => {
  const map = new Map<string, Account[]>()
  for (const a of props.accounts) {
    const key = normalizeName(a.displayName)
    map.set(key, [...(map.get(key) ?? []), a])
  }
  return map
})

type Status = 'found' | 'notFound' | 'ambiguous' | 'noGroup'
const preview = computed(() => rows.value.map((row) => {
  let label = ''
  let matches: Account[] = []
  if (has('username')) {
    label = cell(row, 'username')
    const account = byUsername.value.get(label.toLowerCase().split('@')[0]!.trim())
    matches = account ? [account] : []
  }
  if (!matches.length && (has('fullName') || has('firstName') || has('lastName'))) {
    const full = cell(row, 'fullName')
    const name = has('firstName') || has('lastName') ? { first: cell(row, 'firstName'), last: cell(row, 'lastName') } : splitName(full)
    label ||= full || `${name.first} ${name.last}`.trim()
    matches = byName.value.get(normalizeName(`${name.first} ${name.last}`)) ?? byName.value.get(normalizeName(full)) ?? []
  }
  const groupNames = target.value === 'column' ? splitGroups(cell(row, 'group')) : props.current ? [props.current.name] : []
  const status: Status = !matches.length ? 'notFound' : matches.length > 1 ? 'ambiguous' : !groupNames.length ? 'noGroup' : 'found'
  return { label, account: matches.length === 1 ? matches[0]! : null, groups: groupNames, status }
}))
const found = computed(() => preview.value.filter(r => r.status === 'found'))
const existingGroups = computed(() => new Map(props.groups.map(g => [g.name, g])))
const newGroups = computed(() => [...new Set(found.value.flatMap(r => r.groups))].filter(g => !existingGroups.value.has(g)))

const targetItems = computed(() => [
  ...(props.current ? [{ value: 'current' as const, label: t('admin.import.targetCurrent', { name: props.current.name }) }] : []),
  ...(has('group') ? [{ value: 'column' as const, label: t('admin.import.groupModes.column') }] : []),
])
const roleItems = computed(() => (['member', 'leader'] as const).map(value => ({ value, label: t(`admin.groups.roles.${value}`) })))
const columnFields = computed(() => (['username', 'firstName', 'lastName', 'fullName', 'group'] as const)
  .map(key => ({ key, label: t(`admin.import.columns.${key}`) })))

const running = ref(false)
const result = ref<{ assigned: number, groups: number, createdGroups: string[], errors: string[] } | null>(null)

async function run() {
  running.value = true
  const errors: string[] = []
  const createdGroups: string[] = []
  const ids = new Map([...existingGroups.value].map(([name, g]) => [name, g.id]))
  // Konten je Gruppe sammeln, fehlende Gruppen anlegen
  const members = new Map<string, Set<string>>()
  for (const row of found.value) {
    for (const name of row.groups) members.set(name, (members.get(name) ?? new Set()).add(row.account!.id))
  }
  let assigned = 0
  for (const [name, userIds] of members) {
    try {
      if (!ids.has(name)) {
        if (!createGroups.value) continue
        const { id } = await $fetch('/api/admin/groups', { method: 'POST', query: props.query, body: { name, level: levelFromGroupName(name, props.levels) } })
        ids.set(name, id)
        createdGroups.push(name)
      }
      const url: string = `/api/admin/groups/${ids.get(name)}/members`
      await $fetch(url, { method: 'PUT', body: { userIds: [...userIds], role: role.value } })
      assigned += userIds.size
    }
    catch (e) {
      errors.push(`${name}: ${apiError(e)}`)
    }
  }
  running.value = false
  result.value = { assigned, groups: members.size, createdGroups, errors }
  emit('done')
}

watch(open, (value) => {
  if (!value) {
    table.value = null
    result.value = null
  }
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('admin.import.membersTitle')"
    :description="t('admin.import.membersDescription')"
    :ui="{ content: 'sm:max-w-4xl' }"
  >
    <template #body>
      <div
        v-if="result"
        class="space-y-3"
        data-testid="import-result"
      >
        <UAlert
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          :title="t('admin.import.assignedCount', { n: result.assigned, groups: result.groups })"
          :description="result.createdGroups.length ? t('admin.import.groupsCreated', { names: result.createdGroups.join(', ') }) : undefined"
        />
        <UAlert
          v-for="e in result.errors"
          :key="e"
          color="error"
          variant="subtle"
          :title="e"
        />
      </div>
      <div
        v-else
        class="space-y-6"
      >
        <TableFilePicker @loaded="onLoaded" />
        <template v-if="table">
          <section class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-semibold">
                {{ t('admin.import.columnsTitle') }}
              </h3>
              <UCheckbox
                v-model="hasHeader"
                :label="t('admin.import.hasHeader')"
              />
            </div>
            <p class="text-sm text-(--ui-text-muted)">
              {{ t('admin.import.matchHint', { domain }) }}
            </p>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <UFormField
                v-for="field in columnFields"
                :key="field.key"
                :label="field.label"
              >
                <USelect
                  v-model="columns[field.key]"
                  :items="columnItems"
                  class="w-full"
                  :data-testid="`import-column-${field.key}`"
                />
              </UFormField>
            </div>
          </section>

          <section class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="t('admin.import.targetTitle')">
              <USelect
                v-model="target"
                :items="targetItems"
                class="w-full"
                data-testid="import-target"
              />
              <UCheckbox
                v-if="target === 'column'"
                v-model="createGroups"
                :label="t('admin.import.createGroups')"
                :description="newGroups.length ? t('admin.import.newGroups', { names: newGroups.join(', ') }) : undefined"
                class="mt-2"
              />
            </UFormField>
            <UFormField :label="t('admin.groups.role')">
              <USelect
                v-model="role"
                :items="roleItems"
                class="w-full"
              />
            </UFormField>
          </section>

          <section class="space-y-2">
            <h3 class="font-semibold">
              {{ t('admin.import.matched', { found: found.length, total: preview.length }) }}
            </h3>
            <div class="max-h-72 overflow-auto rounded-(--ui-radius) border border-(--ui-border)">
              <table
                class="w-full text-sm"
                data-testid="import-preview"
              >
                <tbody>
                  <tr
                    v-for="(row, i) in preview.slice(0, 300)"
                    :key="i"
                    class="border-t border-(--ui-border) first:border-t-0"
                  >
                    <td class="px-2 py-1">
                      {{ row.label }}
                    </td>
                    <td class="px-2 py-1 text-(--ui-text-muted)">
                      <template v-if="row.account">
                        {{ row.account.displayName }} · {{ row.account.username }}
                      </template>
                    </td>
                    <td class="px-2 py-1">
                      {{ row.groups.join(', ') }}
                    </td>
                    <td class="px-2 py-1 text-end">
                      <UBadge
                        :color="row.status === 'found' ? 'success' : 'warning'"
                        variant="subtle"
                        size="sm"
                        :label="t(`admin.import.matchStatus.${row.status}`)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton
          v-if="result"
          :label="t('admin.import.close')"
          data-testid="import-close"
          @click="open = false"
        />
        <UButton
          v-else
          icon="i-lucide-users-round"
          :label="t('admin.import.assign', { n: found.length })"
          :disabled="!found.length || running"
          :loading="running"
          data-testid="import-run"
          @click="run"
        />
      </div>
    </template>
  </UModal>
</template>
