<script setup lang="ts">
import {
  buildUsername, downloadCsv, isValidUsername, randomPassword, roleFromText, splitGroups, splitName,
  USERNAME_PATTERNS, USERNAME_SEPARATORS, type UsernamePattern,
} from '~/utils/import-columns'
import type { Table } from '~/utils/spreadsheet'

// Mehrere Konten aus einer Liste anlegen: Spalten zuordnen, Benutzernamen-Muster, Passwort, Gruppen – mit Vorschau
const props = defineProps<{
  domain: string
  existing: string[]
  query: Record<string, string | undefined>
  roleLabel: (role: MemberRole) => string
}>()
const emit = defineEmits<{ done: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const apiError = useApiError()

const { table, hasHeader, columns, rows, columnItems, load, cell, has } = useImportTable(['firstName', 'lastName', 'fullName', 'username', 'password', 'group', 'role'])
const { data: groups } = useFetch('/api/admin/groups', { query: props.query, default: () => [] })

const pattern = ref<UsernamePattern>('firstLast')
/** `none` statt '' – Reka-Select erlaubt keinen leeren Wert */
const separator = ref<typeof USERNAME_SEPARATORS[number] | 'none'>('.')
const passwordMode = ref<'same' | 'random' | 'column'>('random')
const samePassword = ref('')
const role = ref<MemberRole>('member')
const groupMode = ref<'none' | 'fixed' | 'column'>('none')
const fixedGroups = ref<string[]>([])
const createGroups = ref(true)

function onLoaded(data: Table) {
  load(data)
  if (has('username') && !has('firstName') && !has('lastName') && !has('fullName')) pattern.value = 'column'
  if (has('password')) passwordMode.value = 'column'
  if (has('group')) groupMode.value = 'column'
  result.value = null
}

type Problem = 'noName' | 'invalidUsername' | 'exists' | 'shortPassword'
type PreviewRow = { displayName: string, username: string, password: string, role: MemberRole, groups: string[], problem: Problem | null }

/** Passwörter bleiben stabil, solange die Datei gleich bleibt (Zufall je Zeile) */
const randomPasswords = computed(() => rows.value.map(() => randomPassword()))

const preview = computed<PreviewRow[]>(() => {
  const taken = new Set(props.existing)
  const used = new Set<string>()
  return rows.value.map((row, i) => {
    const full = cell(row, 'fullName')
    const name = has('firstName') || has('lastName') ? { first: cell(row, 'firstName'), last: cell(row, 'lastName') } : splitName(full)
    const displayName = full || `${name.first} ${name.last}`.trim()
    let username = buildUsername(pattern.value, separator.value === 'none' ? '' : separator.value, name, cell(row, 'username'))
    // Doppelte Namen in der Datei durchnummerieren (max.muster, max.muster2 …); vorhandene Konten werden übersprungen
    if (pattern.value !== 'column' && used.has(username)) {
      let n = 2
      while (used.has(`${username}${n}`)) n++
      username = `${username}${n}`
    }
    used.add(username)
    const password = passwordMode.value === 'column' ? cell(row, 'password') : passwordMode.value === 'same' ? samePassword.value : randomPasswords.value[i]!
    const groupNames = groupMode.value === 'column' ? splitGroups(cell(row, 'group')) : groupMode.value === 'fixed' ? fixedGroups.value : []
    let problem: Problem | null = null
    if (!displayName) problem = 'noName'
    else if (!isValidUsername(username)) problem = 'invalidUsername'
    else if (taken.has(username)) problem = 'exists'
    else if (password.length < 8) problem = 'shortPassword'
    return { displayName, username, password, role: has('role') ? roleFromText(cell(row, 'role'), role.value) : role.value, groups: groupNames, problem }
  })
})
const valid = computed(() => preview.value.filter(r => !r.problem))
const groupNames = computed(() => new Set((groups.value ?? []).map(g => g.name)))
const newGroups = computed(() => [...new Set(valid.value.flatMap(r => r.groups))].filter(g => !groupNames.value.has(g)))

const patternItems = computed(() => USERNAME_PATTERNS.filter(p => p !== 'column' || has('username'))
  .map(value => ({ value, label: t(`admin.import.patterns.${value}`) })))
const separatorItems = computed(() => [
  ...USERNAME_SEPARATORS.filter(Boolean).map(value => ({ value, label: `„${value}“` })),
  { value: 'none' as const, label: t('admin.import.noSeparator') },
])
const passwordItems = computed(() => (['random', 'same', 'column'] as const).filter(v => v !== 'column' || has('password'))
  .map(value => ({ value, label: t(`admin.import.passwordModes.${value}`) })))
const groupItems = computed(() => (['none', 'fixed', 'column'] as const).filter(v => v !== 'column' || has('group'))
  .map(value => ({ value, label: t(`admin.import.groupModes.${value}`) })))
const roleItems = computed(() => (['member', 'teacher', 'admin'] as const).map(value => ({ value, label: props.roleLabel(value) })))
const columnFields = computed(() => (['firstName', 'lastName', 'fullName', 'username', 'password', 'group', 'role'] as const)
  .map(key => ({ key, label: t(`admin.import.columns.${key}`) })))

// Import in Paketen (Passwort-Hashing dauert je Konto etwas)
const CHUNK = 25
const running = ref(false)
const progress = ref(0)
const result = ref<{ created: PreviewRow[], skipped: { username: string, status: string }[], createdGroups: string[] } | null>(null)
const error = ref('')

async function run() {
  running.value = true
  progress.value = 0
  error.value = ''
  const created: PreviewRow[] = []
  const skipped: { username: string, status: string }[] = []
  const createdGroups: string[] = []
  const list = valid.value
  try {
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK)
      const response = await $fetch('/api/admin/users/import', {
        method: 'POST',
        query: props.query,
        body: {
          users: chunk.map(({ username, displayName, role, password, groups }) => ({ username, displayName, role, password, groups })),
          createGroups: groupMode.value === 'column' && createGroups.value,
        },
      })
      response.results.forEach((r, j) => (r.status === 'created' ? created.push(chunk[j]!) : skipped.push(r)))
      createdGroups.push(...response.createdGroups)
      progress.value = Math.min(list.length, i + CHUNK)
    }
  }
  catch (e) {
    error.value = apiError(e)
  }
  running.value = false
  result.value = { created, skipped, createdGroups }
  emit('done')
}

function downloadCredentials() {
  const header = [t('admin.import.columns.fullName'), t('admin.import.columns.username'), t('admin.import.columns.password'), t('admin.import.columns.group')]
  downloadCsv('klonk-zugangsdaten.csv', [header, ...(result.value?.created ?? [])
    .map(r => [r.displayName, `${r.username}@${props.domain}`, r.password, r.groups.join(', ')])])
}

function reset() {
  table.value = null
  result.value = null
}
watch(open, (value) => {
  if (!value) reset()
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('admin.import.usersTitle')"
    :description="t('admin.import.usersDescription')"
    :ui="{ content: 'sm:max-w-5xl' }"
  >
    <template #body>
      <div
        v-if="result"
        class="space-y-4"
        data-testid="import-result"
      >
        <UAlert
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          :title="t('admin.import.createdCount', { n: result.created.length })"
          :description="result.createdGroups.length ? t('admin.import.groupsCreated', { names: result.createdGroups.join(', ') }) : undefined"
        />
        <UAlert
          v-if="result.skipped.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('admin.import.skippedCount', { n: result.skipped.length })"
          :description="result.skipped.map(s => `${s.username} (${t(`admin.import.status.${s.status}`)})`).join(', ')"
        />
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
        />
        <p class="text-sm text-(--ui-text-muted)">
          {{ t('admin.import.credentialsHint') }}
        </p>
        <UButton
          v-if="result.created.length"
          icon="i-lucide-download"
          :label="t('admin.import.downloadCredentials')"
          data-testid="import-download"
          @click="downloadCredentials"
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
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

          <section class="grid gap-6 lg:grid-cols-2">
            <UFormField
              :label="t('admin.import.usernameTitle')"
              :help="t('admin.import.usernameHelp', { domain })"
            >
              <div class="flex flex-wrap gap-2">
                <USelect
                  v-model="pattern"
                  :items="patternItems"
                  class="min-w-56 flex-1"
                  data-testid="import-pattern"
                />
                <USelect
                  v-if="pattern !== 'column'"
                  v-model="separator"
                  :items="separatorItems"
                  :aria-label="t('admin.import.separator')"
                  class="w-36"
                  data-testid="import-separator"
                />
              </div>
            </UFormField>

            <UFormField :label="t('admin.import.passwordTitle')">
              <div class="flex flex-wrap gap-2">
                <USelect
                  v-model="passwordMode"
                  :items="passwordItems"
                  class="min-w-56 flex-1"
                  data-testid="import-password-mode"
                />
                <UInput
                  v-if="passwordMode === 'same'"
                  v-model="samePassword"
                  :placeholder="t('admin.import.samePasswordPlaceholder')"
                  minlength="8"
                  class="flex-1"
                  data-testid="import-same-password"
                />
              </div>
            </UFormField>

            <UFormField
              :label="t('admin.import.roleTitle')"
              :help="has('role') ? t('admin.import.roleColumnHelp') : undefined"
            >
              <USelect
                v-model="role"
                :items="roleItems"
                class="w-full"
                data-testid="import-role"
              />
            </UFormField>

            <UFormField :label="t('admin.import.groupsTitle')">
              <div class="space-y-2">
                <USelect
                  v-model="groupMode"
                  :items="groupItems"
                  class="w-full"
                  data-testid="import-group-mode"
                />
                <USelectMenu
                  v-if="groupMode === 'fixed'"
                  v-model="fixedGroups"
                  :items="(groups ?? []).map(g => g.name)"
                  multiple
                  :placeholder="t('admin.import.chooseGroups')"
                  class="w-full"
                  data-testid="import-fixed-groups"
                />
                <UCheckbox
                  v-if="groupMode === 'column'"
                  v-model="createGroups"
                  :label="t('admin.import.createGroups')"
                  :description="newGroups.length ? t('admin.import.newGroups', { names: newGroups.join(', ') }) : undefined"
                  data-testid="import-create-groups"
                />
              </div>
            </UFormField>
          </section>

          <section class="space-y-2">
            <h3 class="font-semibold">
              {{ t('admin.import.preview', { valid: valid.length, total: preview.length }) }}
            </h3>
            <div class="max-h-80 overflow-auto rounded-(--ui-radius) border border-(--ui-border)">
              <table
                class="w-full text-sm"
                data-testid="import-preview"
              >
                <thead class="sticky top-0 bg-(--ui-bg-elevated) text-(--ui-text-muted)">
                  <tr>
                    <th class="px-2 py-1 text-start font-normal">
                      {{ t('admin.import.columns.fullName') }}
                    </th>
                    <th class="px-2 py-1 text-start font-normal">
                      {{ t('admin.import.columns.username') }}
                    </th>
                    <th class="px-2 py-1 text-start font-normal">
                      {{ t('admin.import.columns.password') }}
                    </th>
                    <th class="px-2 py-1 text-start font-normal">
                      {{ t('admin.import.columns.role') }}
                    </th>
                    <th class="px-2 py-1 text-start font-normal">
                      {{ t('admin.import.columns.group') }}
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, i) in preview.slice(0, 200)"
                    :key="i"
                    class="border-t border-(--ui-border)"
                    :class="row.problem ? 'text-(--ui-text-dimmed)' : ''"
                  >
                    <td class="px-2 py-1">
                      {{ row.displayName }}
                    </td>
                    <td class="px-2 py-1 font-mono text-xs">
                      {{ row.username }}<span class="text-(--ui-text-dimmed)">@{{ domain }}</span>
                    </td>
                    <td class="px-2 py-1 font-mono text-xs">
                      {{ row.password }}
                    </td>
                    <td class="px-2 py-1">
                      {{ roleLabel(row.role) }}
                    </td>
                    <td class="px-2 py-1">
                      {{ row.groups.join(', ') }}
                    </td>
                    <td class="px-2 py-1 text-end">
                      <UBadge
                        v-if="row.problem"
                        :color="row.problem === 'exists' ? 'neutral' : 'error'"
                        variant="subtle"
                        size="sm"
                        :label="t(`admin.import.problems.${row.problem}`)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p
              v-if="preview.length > 200"
              class="text-xs text-(--ui-text-dimmed)"
            >
              {{ t('admin.import.previewLimited', { n: 200 }) }}
            </p>
          </section>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-end gap-3">
        <span
          v-if="running"
          class="text-sm text-(--ui-text-muted)"
        >{{ t('admin.import.progress', { done: progress, total: valid.length }) }}</span>
        <UButton
          v-if="result"
          :label="t('admin.import.close')"
          data-testid="import-close"
          @click="open = false"
        />
        <UButton
          v-else
          icon="i-lucide-user-plus"
          :label="t('admin.import.createAccounts', { n: valid.length })"
          :disabled="!valid.length || running"
          :loading="running"
          data-testid="import-run"
          @click="run"
        />
      </div>
    </template>
  </UModal>
</template>
