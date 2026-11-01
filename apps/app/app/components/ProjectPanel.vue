<script setup lang="ts">
// Projekt-Explorer (Seitenleiste der IDE): Ordner/Browser-Projekte öffnen, Dateien anlegen, umbenennen, löschen, Welt wählen
const { t } = useI18n()
const {
  proj, canFolders, canBrowser, browserProjects, recent, openFolder, openRecent, openBrowserProject, removeBrowserProject,
  dialog, dialogName, dialogTitle, openDialog, submitDialog, openFile, newItems, fileActions,
} = useProjectExplorer()
const { project, files, currentPath, worldPath, status } = proj

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
            @click="openBrowserProject(name)"
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
        <UTooltip :text="t('project.explorer')">
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-maximize-2"
            :aria-label="t('project.explorer')"
            to="/projects"
            data-testid="open-explorer"
          />
        </UTooltip>
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
            @click="openFile(file)"
          >
            <FileIcon :kind="file.kind" />
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

    <ProjectNameDialog
      v-model:name="dialogName"
      :open="!!dialog"
      :title="dialogTitle"
      @close="dialog = null"
      @submit="submitDialog"
    />
  </div>
</template>
