<script setup lang="ts">
import type { ProjectFile } from '~/utils/project-fs'

// Vollbild-Explorer: Projekte links, Dateien des offenen Projekts als Kacheln
const { t } = useI18n()
useSeoMeta({ title: () => t('project.explorer') })

const {
  proj, canFolders, canBrowser, browserProjects, recent, openFolder, openRecent, openBrowserProject, removeBrowserProject,
  dialog, dialogName, dialogLanguage, dialogTitle, openDialog, submitDialog, openFile, newItemsIn, fileActions, kindLabel,
  folders, folderActions, parentOf, baseName, dropTarget, onDragStart, onDragOver, onDrop,
} = useProjectExplorer({
  // Programme öffnen sich in der IDE, Welten werden nur als Projektwelt gewählt
  onOpenFile: file => file.kind !== 'world' && navigateTo('/'),
})
const { project, files, currentPath, worldPath, status } = proj

// Ordner-Navigation: Kacheln zeigen den aktuellen Ordner; die Suche durchsucht das ganze Projekt
const folder = ref('')
watch(project, () => {
  folder.value = ''
})
watch(folders, (list) => {
  if (folder.value && !list.includes(folder.value)) folder.value = ''
})
const breadcrumbs = computed(() => {
  const parts = folder.value ? folder.value.split('/') : []
  return [{ label: t('project.root'), path: '' }, ...parts.map((name, i) => ({ label: name, path: parts.slice(0, i + 1).join('/') }))]
})
const search = ref('')
const searching = computed(() => !!search.value.trim())
const visibleFolders = computed(() => (searching.value ? [] : folders.value.filter(f => parentOf(f) === folder.value)))
const visibleFiles = computed(() => {
  const query = search.value.trim().toLowerCase()
  return query ? files.value.filter(f => f.path.toLowerCase().includes(query)) : files.value.filter(f => parentOf(f.path) === folder.value)
})
const newItems = computed(() => newItemsIn(folder.value || undefined))

const folderOf = (file: ProjectFile) => file.path.slice(0, -file.name.length - 1)
const isActive = (source: 'folder' | 'browser', name: string) => project.value?.source === source && project.value.name === name
</script>

<template>
  <div
    class="flex h-[calc(100dvh-var(--ui-header-height))] flex-col lg:flex-row"
    data-testid="explorer"
  >
    <ClientOnly>
      <!-- Projekte -->
      <aside class="flex shrink-0 flex-col gap-4 overflow-y-auto border-(--ui-border) p-4 text-sm lg:w-72 lg:border-r">
        <div class="flex flex-col gap-2">
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
            data-testid="explorer-new-project"
            @click="openDialog({ mode: 'project' })"
          />
        </div>

        <div v-if="recent.length">
          <p class="mb-1 text-xs font-semibold text-(--ui-text-muted)">
            {{ t('project.recentFolders') }}
          </p>
          <UButton
            v-for="item in recent"
            :key="item.name"
            :variant="isActive('folder', item.name) ? 'soft' : 'ghost'"
            :color="isActive('folder', item.name) ? 'primary' : 'neutral'"
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
            class="group flex items-center"
          >
            <UButton
              :variant="isActive('browser', name) ? 'soft' : 'ghost'"
              :color="isActive('browser', name) ? 'primary' : 'neutral'"
              icon="i-lucide-hard-drive"
              :label="name"
              class="flex-1 justify-start"
              :data-testid="`explorer-project-${name}`"
              @click="openBrowserProject(name)"
            />
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-trash-2"
              class="opacity-60 group-hover:opacity-100"
              :aria-label="t('project.delete')"
              @click="removeBrowserProject(name)"
            />
          </div>
        </div>
      </aside>

      <!-- Dateien -->
      <section class="flex min-h-0 flex-1 flex-col">
        <div
          v-if="!project"
          class="m-auto flex max-w-md flex-col items-center gap-3 p-6 text-center"
        >
          <UIcon
            name="i-lucide-folder-tree"
            class="size-16 text-(--ui-text-dimmed)"
          />
          <p class="text-lg font-semibold">
            {{ t('project.explorer') }}
          </p>
          <p class="text-(--ui-text-muted)">
            {{ t('project.intro') }}
          </p>
        </div>

        <template v-else>
          <div class="flex flex-wrap items-center gap-3 border-b border-(--ui-border) px-4 py-3">
            <UIcon
              :name="project.source === 'folder' ? 'i-lucide-folder-open' : 'i-lucide-hard-drive'"
              class="size-5 shrink-0"
            />
            <div class="min-w-0">
              <p
                class="truncate font-semibold"
                data-testid="explorer-project-name"
              >
                {{ project.name }}
              </p>
              <p
                class="text-xs"
                :class="status === 'error' ? 'text-(--ui-error)' : 'text-(--ui-text-muted)'"
              >
                {{ proj.language.value ? t(`editor.languages.${proj.language.value}`) : t('project.mixed') }} · {{ t('project.fileCount', files.length) }} · {{ t(`project.status.${status}`) }}
              </p>
            </div>
            <UInput
              v-model="search"
              icon="i-lucide-search"
              :placeholder="t('project.search')"
              class="ms-auto w-56"
              data-testid="explorer-search"
            />
            <UDropdownMenu :items="newItems">
              <UButton
                icon="i-lucide-plus"
                :label="t('project.newFile')"
                data-testid="explorer-new-file"
              />
            </UDropdownMenu>
            <UButton
              icon="i-lucide-code"
              variant="outline"
              :label="t('project.toIde')"
              to="/"
            />
            <UTooltip :text="t('project.close')">
              <UButton
                variant="ghost"
                color="neutral"
                icon="i-lucide-x"
                :aria-label="t('project.close')"
                @click="proj.close()"
              />
            </UTooltip>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-4">
            <nav
              v-if="!searching"
              class="mb-3 flex flex-wrap items-center gap-1 text-sm"
              data-testid="explorer-breadcrumbs"
            >
              <template
                v-for="(crumb, i) in breadcrumbs"
                :key="crumb.path"
              >
                <UIcon
                  v-if="i > 0"
                  name="i-lucide-chevron-right"
                  class="size-4 text-(--ui-text-dimmed)"
                />
                <UButton
                  variant="ghost"
                  :color="crumb.path === folder ? 'primary' : 'neutral'"
                  size="sm"
                  :icon="i === 0 ? 'i-lucide-house' : undefined"
                  :label="crumb.label"
                  :class="dropTarget === crumb.path && crumb.path !== folder ? 'ring-1 ring-(--ui-primary)' : ''"
                  @click="folder = crumb.path"
                  @dragover="crumb.path !== folder && onDragOver($event, crumb.path)"
                  @dragleave="dropTarget = null"
                  @drop="onDrop($event, crumb.path)"
                />
              </template>
            </nav>
            <p
              v-if="!visibleFiles.length && !visibleFolders.length"
              class="p-6 text-center text-(--ui-text-muted)"
            >
              {{ searching ? t('project.noMatches') : folder ? t('project.emptyFolder') : t('project.empty') }}
            </p>
            <ul class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
              <li
                v-for="path in visibleFolders"
                :key="`folder:${path}`"
                class="group relative"
                draggable="true"
                @dragstart="onDragStart($event, path, true)"
                @dragover="onDragOver($event, path)"
                @dragleave="dropTarget = null"
                @drop="onDrop($event, path)"
              >
                <button
                  type="button"
                  class="flex h-full w-full flex-col items-center gap-2 rounded-lg border bg-(--ui-bg) p-4 text-center transition hover:border-(--ui-primary) hover:shadow-sm"
                  :class="dropTarget === path ? 'border-(--ui-primary) ring-1 ring-(--ui-primary)' : 'border-(--ui-border)'"
                  :data-testid="`explorer-folder-${path}`"
                  @click="folder = path"
                >
                  <UIcon
                    name="i-lucide-folder"
                    class="mt-2 size-12 text-amber-500"
                  />
                  <span class="w-full truncate font-medium">{{ baseName(path) }}</span>
                  <span class="w-full truncate text-xs text-(--ui-text-muted)">{{ t('project.folder') }}</span>
                </button>
                <UDropdownMenu :items="folderActions(path)">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    icon="i-lucide-ellipsis-vertical"
                    :aria-label="t('project.actions', { name: path })"
                    class="absolute end-1 top-1 opacity-60 group-hover:opacity-100"
                  />
                </UDropdownMenu>
              </li>
              <li
                v-for="file in visibleFiles"
                :key="file.path"
                class="group relative"
                draggable="true"
                @dragstart="onDragStart($event, file.path, false)"
              >
                <button
                  type="button"
                  class="flex h-full w-full flex-col items-center gap-2 rounded-lg border bg-(--ui-bg) p-4 text-center transition hover:border-(--ui-primary) hover:shadow-sm disabled:cursor-default disabled:opacity-60 disabled:hover:border-(--ui-border) disabled:hover:shadow-none"
                  :class="file.path === currentPath || file.path === worldPath ? 'border-(--ui-primary) ring-1 ring-(--ui-primary)' : 'border-(--ui-border)'"
                  :disabled="file.kind === 'other'"
                  :data-testid="`explorer-file-${file.path}`"
                  @click="openFile(file)"
                >
                  <FileIcon
                    :kind="file.kind"
                    size="lg"
                    class="mt-2"
                  />
                  <span class="w-full truncate font-medium">{{ file.name }}</span>
                  <span class="w-full truncate text-xs text-(--ui-text-muted)">
                    {{ kindLabel(file.kind) }}<template v-if="searching && folderOf(file)"> · {{ folderOf(file) }}</template>
                  </span>
                  <UBadge
                    v-if="file.path === worldPath"
                    :label="t('project.activeWorld')"
                    variant="subtle"
                    size="sm"
                  />
                  <UBadge
                    v-else-if="file.path === currentPath"
                    :label="t('project.openInIde')"
                    variant="subtle"
                    size="sm"
                  />
                </button>
                <UDropdownMenu :items="fileActions(file)">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    icon="i-lucide-ellipsis-vertical"
                    :aria-label="t('project.actions', { name: file.path })"
                    class="absolute end-1 top-1 opacity-60 group-hover:opacity-100"
                  />
                </UDropdownMenu>
              </li>
            </ul>
          </div>
        </template>
      </section>
    </ClientOnly>

    <ProjectNameDialog
      v-model:name="dialogName"
      v-model:language="dialogLanguage"
      :with-language="dialog?.mode === 'project'"
      :open="!!dialog"
      :title="dialogTitle"
      @close="dialog = null"
      @submit="submitDialog"
    />
  </div>
</template>
