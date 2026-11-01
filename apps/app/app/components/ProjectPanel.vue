<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { World } from '@klonk/world'
import {
  deleteBrowserProject, ensurePermission, forgetProject, listBrowserProjects, pickFolder, recentProjects,
  supportsBrowserProjects, supportsFolders, Project, type FileKind, type ProjectFile, type RecentProject,
} from '~/utils/project-fs'

// Projekt-Explorer: Ordner/Browser-Projekte öffnen, Dateien anlegen, umbenennen, löschen, Welt wählen
const { t, locale } = useI18n()
const toast = useToast()
const proj = useProject()
const { start } = useWorldEditor()
const { project, files, currentPath, worldPath, status } = proj

const canFolders = ref(false)
const canBrowser = ref(false)
const browserProjects = ref<string[]>([])
const recent = ref<RecentProject[]>([])

async function loadLists() {
  canFolders.value = supportsFolders()
  canBrowser.value = supportsBrowserProjects()
  if (canBrowser.value) browserProjects.value = await listBrowserProjects().catch(() => [])
  recent.value = (await recentProjects()).filter(r => r.source === 'folder')
}
onMounted(loadLists)
watch(project, p => !p && loadLists())

function fail(error: unknown) {
  const code = (error as Error)?.message
  toast.add({ title: t(code === 'exists' ? 'project.errors.exists' : code === 'invalid_name' ? 'project.errors.invalidName' : 'project.errors.generic'), color: 'error' })
}

async function openFolder() {
  const picked = await pickFolder()
  if (picked) await proj.open(picked).catch(fail)
}

async function openRecent(item: RecentProject) {
  if (!(await ensurePermission(item.handle))) {
    toast.add({ title: t('project.errors.permission'), color: 'error' })
    return
  }
  await proj.open(new Project(item.handle, item.source)).catch(async (error) => {
    await forgetProject(item.source, item.name)
    fail(error)
  })
}

async function removeBrowserProject(name: string) {
  if (!confirm(t('project.confirmDeleteProject', { name }))) return
  await deleteBrowserProject(name)
  await loadLists()
}

// Dialoge: neues Projekt, neue Datei, umbenennen
const dialog = ref<null | { mode: 'project' } | { mode: 'file', kind: Exclude<FileKind, 'other'> } | { mode: 'rename', file: ProjectFile }>(null)
const dialogName = ref('')

function openDialog(value: NonNullable<typeof dialog.value>) {
  dialog.value = value
  dialogName.value = value.mode === 'rename' ? value.file.path : value.mode === 'project' ? t('project.defaultProjectName') : t(`project.defaultName.${value.kind}`)
}

async function submitDialog() {
  const d = dialog.value
  const name = dialogName.value.trim()
  if (!d || !name) return
  try {
    if (d.mode === 'project') {
      await proj.openBrowserProject(name, true)
      // Ein neues Projekt bekommt gleich ein Programm und eine Welt
      if (!files.value.length) {
        await proj.create(t('project.defaultName.world'), 'world', `${JSON.stringify(start.value.toJSON(), null, 2)}\n`)
        await proj.create(t('project.defaultName.blocks'), 'blocks', programSample('blocks', locale.value === 'en' ? 'en' : 'de'))
      }
    }
    else if (d.mode === 'file') {
      const lang = locale.value === 'en' ? 'en' : 'de'
      const initial = d.kind === 'world' ? `${JSON.stringify(World.empty().toJSON(), null, 2)}\n` : programSample(d.kind, lang)
      await proj.create(name, d.kind, initial)
    }
    else {
      await proj.rename(d.file.path, name)
    }
    dialog.value = null
  }
  catch (error) {
    fail(error)
  }
}

async function remove(file: ProjectFile) {
  if (!confirm(t('project.confirmDelete', { name: file.path }))) return
  await proj.remove(file.path).catch(fail)
}

const newItems = computed<DropdownMenuItem[][]>(() => [
  (['blocks', 'klonk', 'javascript', 'typescript'] as const).map(kind => ({
    label: t(`editor.languages.${kind}`), icon: KIND_ICON[kind], onSelect: () => openDialog({ mode: 'file', kind }),
  })),
  [{ label: t('project.world'), icon: KIND_ICON.world, onSelect: () => openDialog({ mode: 'file', kind: 'world' }) }],
])

function fileActions(file: ProjectFile): DropdownMenuItem[][] {
  return [[
    { label: t('project.rename'), icon: 'i-lucide-pencil', onSelect: () => openDialog({ mode: 'rename', file }) },
    { label: t('project.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(file) },
  ]]
}

const KIND_ICON: Record<FileKind, string> = {
  blocks: 'i-lucide-puzzle',
  klonk: 'i-lucide-file-code',
  javascript: 'i-lucide-file-json',
  typescript: 'i-lucide-file-type',
  world: 'i-lucide-boxes',
  other: 'i-lucide-file',
}

// Leere Werte erlaubt die Select-Komponente nicht – eigener Wert für „Welt aus dem Welt-Editor“
const EDITOR_WORLD = '__editor__'
const worldItems = computed(() => [
  { label: t('project.browserWorld'), value: EDITOR_WORLD },
  ...proj.worldFiles.value.map(f => ({ label: f.path, value: f.path })),
])
const selectedWorld = computed({
  get: () => worldPath.value ?? EDITOR_WORLD,
  set: (value: string) => proj.selectWorld(value === EDITOR_WORLD ? null : value),
})
</script>

<template>
  <div
    class="flex h-full flex-col gap-3 overflow-y-auto p-3 text-sm"
    data-testid="project-panel"
  >
    <!-- Kein Projekt geöffnet -->
    <template v-if="!project">
      <p class="font-semibold">
        {{ t('project.title') }}
      </p>
      <p class="text-xs text-(--ui-text-muted)">
        {{ t('project.intro') }}
      </p>
      <UButton
        v-if="canFolders"
        icon="i-lucide-folder-open"
        :label="t('project.openFolder')"
        block
        @click="openFolder"
      />
      <UButton
        v-if="canBrowser"
        icon="i-lucide-folder-plus"
        variant="outline"
        :label="t('project.newBrowserProject')"
        block
        data-testid="new-browser-project"
        @click="openDialog({ mode: 'project' })"
      />

      <div v-if="recent.length">
        <p class="mb-1 text-xs font-semibold text-(--ui-text-muted)">
          {{ t('project.recentFolders') }}
        </p>
        <UButton
          v-for="item in recent"
          :key="item.name"
          variant="ghost"
          color="neutral"
          icon="i-lucide-folder"
          :label="item.name"
          block
          class="justify-start"
          @click="openRecent(item)"
        />
      </div>

      <div v-if="browserProjects.length">
        <p class="mb-1 text-xs font-semibold text-(--ui-text-muted)">
          {{ t('project.browserProjects') }}
        </p>
        <div
          v-for="name in browserProjects"
          :key="name"
          class="flex items-center"
        >
          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-hard-drive"
            :label="name"
            class="flex-1 justify-start"
            :data-testid="`browser-project-${name}`"
            @click="proj.openBrowserProject(name).catch(fail)"
          />
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-trash-2"
            :aria-label="t('project.delete')"
            @click="removeBrowserProject(name)"
          />
        </div>
      </div>
    </template>

    <!-- Geöffnetes Projekt -->
    <template v-else>
      <div class="flex items-center gap-2">
        <UIcon
          :name="project.source === 'folder' ? 'i-lucide-folder-open' : 'i-lucide-hard-drive'"
          class="shrink-0"
        />
        <span
          class="flex-1 truncate font-semibold"
          data-testid="project-name"
        >{{ project.name }}</span>
        <UTooltip :text="t('project.close')">
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-x"
            :aria-label="t('project.close')"
            data-testid="close-project"
            @click="proj.close()"
          />
        </UTooltip>
      </div>
      <p
        class="-mt-2 text-xs"
        :class="status === 'error' ? 'text-(--ui-error)' : 'text-(--ui-text-muted)'"
        data-testid="save-status"
        :data-status="status"
      >
        {{ t(`project.status.${status}`) }}
      </p>

      <UDropdownMenu :items="newItems">
        <UButton
          icon="i-lucide-plus"
          variant="outline"
          :label="t('project.newFile')"
          block
          data-testid="new-file"
        />
      </UDropdownMenu>

      <ul class="space-y-0.5">
        <li
          v-for="file in files"
          :key="file.path"
          class="group flex items-center rounded-md"
          :class="file.path === currentPath || file.path === worldPath ? 'bg-(--ui-bg-elevated)' : ''"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left"
            :class="file.kind === 'other' ? 'text-(--ui-text-dimmed)' : ''"
            :disabled="file.kind === 'other'"
            :data-testid="`file-${file.path}`"
            @click="file.kind === 'world' ? proj.selectWorld(file.path) : proj.select(file.path).catch(fail)"
          >
            <UIcon
              :name="KIND_ICON[file.kind]"
              class="shrink-0"
            />
            <span class="truncate">{{ file.path }}</span>
          </button>
          <UDropdownMenu :items="fileActions(file)">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-ellipsis"
              :aria-label="t('project.actions', { name: file.path })"
              class="opacity-60 group-hover:opacity-100"
            />
          </UDropdownMenu>
        </li>
      </ul>

      <UFormField
        :label="t('project.world')"
        class="mt-auto"
      >
        <USelect
          v-model="selectedWorld"
          :items="worldItems"
          class="w-full"
          data-testid="project-world"
        />
      </UFormField>
    </template>

    <UModal
      :open="!!dialog"
      :title="dialog?.mode === 'project' ? t('project.newBrowserProject') : dialog?.mode === 'rename' ? t('project.rename') : t('project.newFile')"
      @update:open="v => !v && (dialog = null)"
    >
      <template #body>
        <form
          id="project-dialog"
          @submit.prevent="submitDialog"
        >
          <UFormField :label="t('project.name')">
            <UInput
              v-model="dialogName"
              class="w-full"
              autofocus
              data-testid="project-dialog-name"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="project-dialog"
          :label="t('project.ok')"
          data-testid="project-dialog-submit"
        />
      </template>
    </UModal>
  </div>
</template>
