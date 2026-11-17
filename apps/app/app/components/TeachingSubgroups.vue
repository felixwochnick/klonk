<script setup lang="ts">
import { defaultStartWorld } from '@klonk/runtime/live'
import { World } from '@klonk/world'
import { KIND_EXTENSION } from '~/utils/project-fs'

// Untergruppen (Teams) einer Klasse für die Leitung: anlegen (einzeln oder zufällig), Mitglieder, Art der Zusammenarbeit,
// gemeinsames Projekt öffnen bzw. der gemeinsamen Welt zusehen
const props = defineProps<{ groupId: string }>()

const { t, locale } = useI18n()
const toast = useToast()
const apiError = useApiError()
const proj = useProject()
const live = useLiveWorld()

const { data, refresh } = useFetch<SubgroupsOverview>(`/api/teaching/groups/${props.groupId}/subgroups`, {
  server: false,
  headers: clientHostHeaders(),
})

/** Lernende der Klasse (die Leitung arbeitet nicht in Teams mit) */
const learners = computed(() => (data.value?.members ?? []).filter(m => m.role === 'member'))
const assigned = computed(() => new Set((data.value?.subgroups ?? []).flatMap(s => s.members.map(m => m.userId))))
const unassigned = computed(() => learners.value.filter(m => !assigned.value.has(m.userId)))
const subgroupOf = (userId: string, except?: string) => data.value?.subgroups.find(s => s.id !== except && s.members.some(m => m.userId === userId))

const MODE_ICON: Record<CollabMode, string> = { project: 'i-lucide-users-round', world: 'i-lucide-earth' }
const modeItems = computed(() => COLLAB_MODES.map(value => ({ value, label: t(`live.modes.${value}.label`), description: t(`live.modes.${value}.description`) })))
const languageItems = computed(() => PROGRAM_LANGUAGES.map(value => ({ value, label: t(`editor.languages.${value}`) })))

/** Startdateien des gemeinsamen Ordners: Projekt (klonk.json, Welt, Beispielprogramm) bzw. Startwelt mit vier Startplätzen */
function starterFiles(mode: CollabMode, language: ProgramLanguage) {
  const lang = locale.value === 'en' ? 'en' : 'de'
  const world = `${t('project.defaultName.world')}${KIND_EXTENSION.world}`
  if (mode === 'world') return [{ path: world, content: `${JSON.stringify(defaultStartWorld(), null, 2)}\n` }]
  const program = language === 'java' ? 'src/Main.java' : `${t(`project.defaultName.${language}`)}${KIND_EXTENSION[language]}`
  return [
    { path: 'klonk.json', content: `${JSON.stringify({ language: projectLanguage(language) }, null, 2)}\n` },
    { path: world, content: `${JSON.stringify(World.empty().toJSON(), null, 2)}\n` },
    { path: program, content: programSample(language, lang) },
  ]
}

// Dialog: neue Untergruppe bzw. bearbeiten
const dialog = ref<{ id: string | null, name: string, mode: CollabMode, language: ProgramLanguage, memberIds: string[] } | null>(null)
const saving = ref(false)
const memberItems = computed(() => learners.value.map((m) => {
  const other = subgroupOf(m.userId, dialog.value?.id ?? undefined)
  return { value: m.userId, label: m.displayName, description: other ? t('live.subgroups.alsoIn', { name: other.name }) : undefined }
}))

function nextName() {
  const taken = new Set((data.value?.subgroups ?? []).map(s => s.name.toLowerCase()))
  for (let i = 1; ; i++) if (!taken.has(t('live.subgroups.teamName', { n: i }).toLowerCase())) return t('live.subgroups.teamName', { n: i })
}

function openCreate() {
  dialog.value = { id: null, name: nextName(), mode: 'project', language: 'blocks', memberIds: [] }
}
function openEdit(subgroup: SubgroupInfo) {
  dialog.value = { id: subgroup.id, name: subgroup.name, mode: subgroup.mode, language: 'blocks', memberIds: subgroup.members.map(m => m.userId) }
}

async function submit() {
  const form = dialog.value
  if (!form || !form.name.trim()) return
  saving.value = true
  try {
    if (form.id) {
      await $fetch(`/api/teaching/subgroups/${form.id}` as string, { method: 'PATCH', headers: clientHostHeaders(), body: { name: form.name, mode: form.mode, memberIds: form.memberIds } })
    }
    else {
      await $fetch(`/api/teaching/groups/${props.groupId}/subgroups` as string, {
        method: 'POST',
        headers: clientHostHeaders(),
        body: { name: form.name, mode: form.mode, memberIds: form.memberIds, files: starterFiles(form.mode, form.language) },
      })
    }
    dialog.value = null
    await refresh()
  }
  catch (error) {
    toast.add({ title: apiError(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function remove(subgroup: SubgroupInfo) {
  if (!confirm(t('live.subgroups.confirmDelete', { name: subgroup.name }))) return
  try {
    await $fetch(`/api/teaching/subgroups/${subgroup.id}` as string, { method: 'DELETE', headers: clientHostHeaders() })
    await refresh()
  }
  catch (error) {
    toast.add({ title: apiError(error), color: 'error' })
  }
}

// Zufällige Teams aus allen Lernenden ohne Untergruppe
const random = ref<{ size: number, mode: CollabMode, language: ProgramLanguage } | null>(null)
/** Gleichmäßig verteilen: lieber ein Team weniger als eines mit einer Person allein */
const teamCount = (people: number, size: number) => Math.max(1, Math.round(people / Math.max(2, size)))
const randomCount = computed(() => (random.value && unassigned.value.length ? teamCount(unassigned.value.length, random.value.size) : 0))
async function createRandom() {
  const form = random.value
  if (!form || !unassigned.value.length) return
  const people = [...unassigned.value].map(m => m.userId).sort(() => Math.random() - 0.5)
  const count = teamCount(people.length, form.size)
  const teams: string[][] = Array.from({ length: count }, () => [])
  people.forEach((id, i) => teams[i % count]!.push(id))
  saving.value = true
  try {
    for (const memberIds of teams) {
      await $fetch(`/api/teaching/groups/${props.groupId}/subgroups` as string, {
        method: 'POST',
        headers: clientHostHeaders(),
        body: { name: nextName(), mode: form.mode, memberIds, files: starterFiles(form.mode, form.language) },
      })
      await refresh()
    }
    random.value = null
  }
  catch (error) {
    toast.add({ title: apiError(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

/** Gemeinsames Projekt in der IDE öffnen bzw. der gemeinsamen Welt zusehen */
async function open(subgroup: SubgroupInfo) {
  const name = `${subgroup.name} (${data.value?.name ?? ''})`
  if (subgroup.mode === 'world') {
    live.join({ id: subgroup.id, name })
    return navigateTo('/')
  }
  if (!subgroup.projectId) return
  try {
    if (await proj.openCloud({ id: subgroup.projectId, name, kind: 'group', writable: true })) await navigateTo('/')
  }
  catch (error) {
    toast.add({ title: apiError(error), color: 'error' })
  }
}
</script>

<template>
  <UCard
    class="mb-6"
    data-testid="subgroups"
  >
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold">
            {{ t('live.subgroups.title') }}
          </h2>
          <p class="mt-1 text-sm text-(--ui-text-muted)">
            {{ t('live.subgroups.hint') }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-shuffle"
            variant="outline"
            :label="t('live.subgroups.random')"
            :disabled="!unassigned.length"
            data-testid="subgroups-random"
            @click="random = { size: 3, mode: 'project', language: 'blocks' }"
          />
          <UButton
            icon="i-lucide-plus"
            :label="t('live.subgroups.create')"
            data-testid="subgroups-create"
            @click="openCreate"
          />
        </div>
      </div>
    </template>

    <p
      v-if="data && !data.subgroups.length"
      class="text-sm text-(--ui-text-muted)"
    >
      {{ t('live.subgroups.empty') }}
    </p>
    <div
      v-else
      class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
    >
      <div
        v-for="subgroup in data?.subgroups ?? []"
        :key="subgroup.id"
        class="flex flex-col gap-2 rounded-lg border border-(--ui-border) p-3"
        :data-testid="`subgroup-${subgroup.name}`"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate font-semibold">
              {{ subgroup.name }}
            </p>
            <UBadge
              :icon="MODE_ICON[subgroup.mode]"
              :label="t(`live.modes.${subgroup.mode}.label`)"
              variant="subtle"
              color="neutral"
              size="sm"
              :data-testid="`subgroup-mode-${subgroup.name}`"
            />
          </div>
          <div class="flex shrink-0 gap-1">
            <UButton
              icon="i-lucide-pencil"
              variant="ghost"
              color="neutral"
              size="sm"
              :aria-label="t('live.subgroups.edit', { name: subgroup.name })"
              :data-testid="`subgroup-edit-${subgroup.name}`"
              @click="openEdit(subgroup)"
            />
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              color="error"
              size="sm"
              :aria-label="t('live.subgroups.delete', { name: subgroup.name })"
              :data-testid="`subgroup-delete-${subgroup.name}`"
              @click="remove(subgroup)"
            />
          </div>
        </div>
        <p class="text-sm text-(--ui-text-muted)">
          {{ subgroup.members.length ? subgroup.members.map(m => m.displayName).join(', ') : t('live.subgroups.noMembers') }}
        </p>
        <UButton
          :icon="subgroup.mode === 'world' ? 'i-lucide-eye' : 'i-lucide-folder-open'"
          :label="t(subgroup.mode === 'world' ? 'live.subgroups.watch' : 'live.subgroups.openProject')"
          variant="soft"
          size="sm"
          class="mt-auto self-start"
          :data-testid="`subgroup-open-${subgroup.name}`"
          @click="open(subgroup)"
        />
      </div>
    </div>
    <p
      v-if="data?.subgroups.length && unassigned.length"
      class="mt-3 text-xs text-(--ui-text-muted)"
      data-testid="subgroups-unassigned"
    >
      {{ t('live.subgroups.unassigned', { names: unassigned.map(m => m.displayName).join(', ') }) }}
    </p>

    <!-- Neue Untergruppe / bearbeiten -->
    <UModal
      :open="!!dialog"
      :title="dialog?.id ? t('live.subgroups.editTitle') : t('live.subgroups.create')"
      @update:open="v => !v && (dialog = null)"
    >
      <template #body>
        <form
          v-if="dialog"
          id="subgroup-dialog"
          class="flex flex-col gap-4"
          @submit.prevent="submit"
        >
          <UFormField :label="t('live.subgroups.name')">
            <UInput
              v-model="dialog.name"
              class="w-full"
              autofocus
              data-testid="subgroup-name"
            />
          </UFormField>
          <UFormField :label="t('live.subgroups.mode')">
            <URadioGroup
              v-model="dialog.mode"
              :items="modeItems"
              variant="card"
              :ui="{ fieldset: 'gap-2' }"
              data-testid="subgroup-mode"
            />
          </UFormField>
          <UFormField
            v-if="!dialog.id && dialog.mode === 'project'"
            :label="t('live.subgroups.language')"
          >
            <USelect
              v-model="dialog.language"
              :items="languageItems"
              class="w-full"
              data-testid="subgroup-language"
            />
          </UFormField>
          <UFormField :label="t('live.subgroups.members')">
            <UCheckboxGroup
              v-model="dialog.memberIds"
              :items="memberItems"
              data-testid="subgroup-members"
            />
            <p
              v-if="!memberItems.length"
              class="text-sm text-(--ui-text-muted)"
            >
              {{ t('live.subgroups.noLearners') }}
            </p>
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            :label="t('live.subgroups.cancel')"
            @click="dialog = null"
          />
          <UButton
            type="submit"
            form="subgroup-dialog"
            :loading="saving"
            :label="dialog?.id ? t('live.subgroups.save') : t('live.subgroups.create')"
            data-testid="subgroup-submit"
          />
        </div>
      </template>
    </UModal>

    <!-- Zufällige Teams -->
    <UModal
      :open="!!random"
      :title="t('live.subgroups.random')"
      @update:open="v => !v && (random = null)"
    >
      <template #body>
        <form
          v-if="random"
          id="subgroup-random"
          class="flex flex-col gap-4"
          @submit.prevent="createRandom"
        >
          <p class="text-sm text-(--ui-text-muted)">
            {{ t('live.subgroups.randomHint', { count: unassigned.length }) }}
          </p>
          <UFormField :label="t('live.subgroups.teamSize')">
            <UInputNumber
              v-model="random.size"
              :min="2"
              :max="8"
              data-testid="subgroup-random-size"
            />
          </UFormField>
          <UFormField :label="t('live.subgroups.mode')">
            <URadioGroup
              v-model="random.mode"
              :items="modeItems"
              variant="card"
              :ui="{ fieldset: 'gap-2' }"
            />
          </UFormField>
          <UFormField
            v-if="random.mode === 'project'"
            :label="t('live.subgroups.language')"
          >
            <USelect
              v-model="random.language"
              :items="languageItems"
              class="w-full"
            />
          </UFormField>
          <p class="text-sm">
            {{ t('live.subgroups.randomResult', { teams: randomCount }) }}
          </p>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            :label="t('live.subgroups.cancel')"
            @click="random = null"
          />
          <UButton
            type="submit"
            form="subgroup-random"
            :loading="saving"
            :label="t('live.subgroups.randomCreate')"
            data-testid="subgroup-random-submit"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
