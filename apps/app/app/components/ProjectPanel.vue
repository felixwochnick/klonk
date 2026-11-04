<script setup lang="ts">
// Projekt-Explorer (Seitenleiste der IDE): Ordner/Browser-Projekte öffnen, Dateien anlegen, umbenennen, löschen, Welt wählen
const { t } = useI18n()
const {
  proj, canFolders, canCreateProject, locations, dialogLocation, browserProjects, recent, openFolder, openRecent, openBrowserProject, removeBrowserProject,
  dialog, dialogName, dialogLanguage, dialogTitle, openDialog, submitDialog, openFile, newItems, fileActions, fileContextItems, areaContextItems,
  tree, toggleFolder, folderActions, parentOf, dropTarget, onDragStart, onDragOver, onDrop,
} = useProjectExplorer()
const { project, currentPath, worldPath, status } = proj

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
        v-if="canCreateProject"
        icon="i-lucide-folder-plus"
        :label="t('project.newProject')"
        block
        data-testid="new-project"
        @click="openDialog({ mode: 'project' })"
      />
      <UButton
        v-if="canFolders"
        icon="i-lucide-folder-open"
        variant="outline"
        :label="t('project.openFolder')"
        block
        @click="openFolder"
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
        <span data-testid="project-language">{{ proj.language.value ? projectLanguageLabel(t, proj.language.value) : t('project.mixed') }}</span>
        · {{ t(`project.status.${status}`) }}
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

      <!-- Rechtsklick: auf freie Fläche ⇒ Neues anlegen, auf Ordner/Datei ⇒ deren Aktionen -->
      <UContextMenu
        :items="areaContextItems()"
        :disabled="!areaContextItems().length"
      >
        <ul
          class="-mx-1 min-h-16 flex-1 space-y-0.5 rounded-md px-1"
          :class="dropTarget === '' ? 'bg-(--ui-bg-elevated)/60 ring-1 ring-(--ui-primary)' : ''"
          data-testid="file-tree"
          @dragover="onDragOver($event, '')"
          @dragleave="dropTarget = null"
          @drop="onDrop($event, '')"
        >
          <template
            v-for="row in tree"
            :key="row.type === 'folder' ? `folder:${row.path}` : row.file.path"
          >
            <!-- Ordner -->
            <UContextMenu
              v-if="row.type === 'folder'"
              :items="folderActions(row.path)"
              :disabled="!folderActions(row.path).length"
            >
              <li
                class="group flex items-center rounded-md"
                :class="dropTarget === row.path ? 'bg-(--ui-bg-elevated) ring-1 ring-(--ui-primary)' : ''"
                draggable="true"
                @dragstart="onDragStart($event, row.path, true)"
                @dragover="onDragOver($event, row.path)"
                @drop="onDrop($event, row.path)"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-1.5 py-1 pe-2 text-left"
                  :style="{ paddingInlineStart: `${row.depth * 14 + 4}px` }"
                  :aria-expanded="row.open"
                  :data-testid="`folder-${row.path}`"
                  @click="toggleFolder(row.path)"
                >
                  <UIcon
                    :name="row.open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                    class="size-3.5 shrink-0 text-(--ui-text-muted)"
                  />
                  <UIcon
                    :name="row.open ? 'i-lucide-folder-open' : 'i-lucide-folder'"
                    class="size-4 shrink-0 text-amber-500"
                  />
                  <span class="truncate">{{ row.name }}</span>
                </button>
                <UDropdownMenu :items="folderActions(row.path)">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    icon="i-lucide-ellipsis"
                    :aria-label="t('project.actions', { name: row.path })"
                    class="opacity-60 group-hover:opacity-100"
                    :data-testid="`folder-actions-${row.path}`"
                  />
                </UDropdownMenu>
              </li>
            </UContextMenu>

            <!-- Datei -->
            <UContextMenu
              v-else
              :items="fileContextItems(row.file)"
              :disabled="!fileContextItems(row.file).length"
            >
              <li
                class="group flex items-center rounded-md"
                :class="row.file.path === currentPath || row.file.path === worldPath ? 'bg-(--ui-bg-elevated)' : ''"
                draggable="true"
                @dragstart="onDragStart($event, row.file.path, false)"
                @dragover="onDragOver($event, parentOf(row.file.path))"
                @drop="onDrop($event, parentOf(row.file.path))"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 py-1 pe-2 text-left"
                  :style="{ paddingInlineStart: `${row.depth * 14 + 22}px` }"
                  :class="row.file.kind === 'other' ? 'text-(--ui-text-dimmed)' : ''"
                  :disabled="row.file.kind === 'other'"
                  :data-testid="`file-${row.file.path}`"
                  @click="openFile(row.file)"
                >
                  <FileIcon :kind="row.file.kind" />
                  <span class="truncate">{{ row.file.name }}</span>
                </button>
                <UDropdownMenu :items="fileActions(row.file)">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    icon="i-lucide-ellipsis"
                    :aria-label="t('project.actions', { name: row.file.path })"
                    class="opacity-60 group-hover:opacity-100"
                  />
                </UDropdownMenu>
              </li>
            </UContextMenu>
          </template>
        </ul>
      </UContextMenu>

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
      v-model:language="dialogLanguage"
      v-model:location="dialogLocation"
      :locations="dialog?.mode === 'project' ? locations : []"
      :with-language="dialog?.mode === 'project' || dialog?.mode === 'init'"
      :with-name="dialog?.mode !== 'init'"
      :hint="dialog?.mode === 'package' ? t('project.packageHelp') : undefined"
      :open="!!dialog"
      :title="dialogTitle"
      @close="dialog = null"
      @submit="submitDialog"
    />
  </div>
</template>
