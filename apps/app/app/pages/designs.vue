<script setup lang="ts">
import { DEFAULT_DESIGNS } from '@klonk/world'
import type { ProjectFile } from '~/utils/project-fs'

// Kleiderschrank: alle Roboter-Designs des geöffneten Projekts, Bearbeiten im visuellen Editor
const { t } = useI18n()
useSeoMeta({ title: () => t('wardrobe.title') })

const proj = useProject()
const { project, designFiles, designPath: selected } = proj
const toast = useToast()

// Designs öffnen sich nur hier (eigene Auswahl, unabhängig von der Datei in der IDE)
async function open(file: ProjectFile) {
  await proj.selectDesign(file.path).catch(() => toast.add({ title: t('project.errors.generic'), color: 'error' }))
}
// Erstes Design gleich öffnen
watch(designFiles, (files) => {
  if (!files.some(f => f.path === selected.value) && files[0]) void open(files[0])
}, { immediate: true })

const source = computed({
  get: () => proj.designContent.value,
  set: (value: string) => proj.updateDesign(value),
})

const dialogOpen = ref(false)
const name = ref('')
function newDesign() {
  name.value = t('project.defaultName.design')
  dialogOpen.value = true
}
async function create() {
  try {
    await proj.create(name.value, 'design', `${JSON.stringify({ ...DEFAULT_DESIGNS.male, name: name.value }, null, 2)}\n`)
    dialogOpen.value = false
  }
  catch (error) {
    toast.add({ title: t((error as Error).message === 'exists' ? 'project.errors.exists' : 'project.errors.invalidName'), color: 'error' })
  }
}
</script>

<template>
  <div
    class="flex h-[calc(100dvh-var(--ui-header-height))] flex-col lg:flex-row"
    data-testid="wardrobe"
  >
    <ClientOnly>
      <div
        v-if="!project"
        class="m-auto flex max-w-md flex-col items-center gap-3 p-6 text-center"
      >
        <UIcon
          name="i-lucide-shirt"
          class="size-16 text-(--ui-text-dimmed)"
        />
        <p class="text-lg font-semibold">
          {{ t('wardrobe.title') }}
        </p>
        <p class="text-(--ui-text-muted)">
          {{ t('wardrobe.noProject') }}
        </p>
        <UButton
          icon="i-lucide-folder-tree"
          :label="t('nav.projects')"
          to="/projects"
        />
      </div>

      <template v-else>
        <aside class="flex shrink-0 flex-col gap-2 overflow-y-auto border-(--ui-border) p-4 text-sm lg:w-64 lg:border-r">
          <UButton
            icon="i-lucide-plus"
            :label="t('wardrobe.new')"
            block
            data-testid="wardrobe-new"
            @click="newDesign"
          />
          <p
            v-if="!designFiles.length"
            class="p-2 text-(--ui-text-muted)"
          >
            {{ t('wardrobe.empty') }}
          </p>
          <UButton
            v-for="file in designFiles"
            :key="file.path"
            :variant="file.path === selected ? 'soft' : 'ghost'"
            :color="file.path === selected ? 'primary' : 'neutral'"
            icon="i-lucide-palette"
            :label="file.name.replace(/\.klonkdesign\.json$/i, '')"
            block
            class="justify-start"
            :data-testid="`wardrobe-design-${file.path}`"
            @click="open(file)"
          />
        </aside>
        <DesignEditor
          v-if="selected"
          :key="selected"
          v-model="source"
        />
      </template>
    </ClientOnly>

    <ProjectNameDialog
      v-model:name="name"
      :open="dialogOpen"
      :title="t('wardrobe.new')"
      @close="dialogOpen = false"
      @submit="create"
    />
  </div>
</template>
