<script setup lang="ts">
import type { LearnModule } from '@klonk/learn'

// Datei aus einem Lernmodul (Aufgabenordner): Hinweis mit Link in die Lernansicht, wo geprüft wird (IDE und Datenbanken)
const props = defineProps<{ path: string | null }>()

const { t, locale } = useI18n()
const proj = useProject()

const learnManifest = shallowRef<{ module: string, tasks: Record<string, string> } | null>(null)
watch([proj.project, proj.files], async () => {
  const text = proj.project.value ? await proj.project.value.read('klonk.json').catch(() => null) : null
  try {
    const learn = (JSON.parse(text ?? '') as { learn?: { module?: unknown, tasks?: Record<string, string> } }).learn
    learnManifest.value = typeof learn?.module === 'string' ? { module: learn.module, tasks: learn.tasks ?? {} } : null
  }
  catch {
    learnManifest.value = null
  }
}, { immediate: true })
// Modul des Projekts (eigene Module der Schule kommen vom Server)
const learnModule = shallowRef<LearnModule | null>(null)
watch(() => learnManifest.value?.module, async (id) => {
  const module = id ? await resolveModule(id).catch(() => null) : null
  if (learnManifest.value?.module === id) learnModule.value = module
}, { immediate: true })
const learnTask = computed(() => {
  const manifest = learnManifest.value
  const path = props.path
  if (!manifest || !path) return null
  const module = learnModule.value?.id === manifest.module ? learnModule.value : null
  const entry = Object.entries(manifest.tasks).find(([, program]) => program.includes('/') && path.startsWith(`${program.slice(0, program.lastIndexOf('/'))}/`))
  const task = entry && module?.tasks.find(x => x.id === entry[0])
  return module && task ? { module, task } : null
})
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))
</script>

<template>
  <div
    v-if="learnTask"
    class="flex flex-wrap items-center gap-2 border-b border-(--ui-border) bg-(--ui-bg-muted) px-3 py-1.5 text-sm"
    data-testid="learn-task-hint"
  >
    <UIcon
      name="i-lucide-graduation-cap"
      class="shrink-0 text-(--ui-primary)"
    />
    <span>{{ t('learn.learnTaskHint', { task: learnTask.task.title[lang], module: learnTask.module.title[lang] }) }}</span>
    <UButton
      :to="`/learn/${learnTask.module.id}/${learnTask.task.id}`"
      :label="t('learn.openInLearn')"
      trailing-icon="i-lucide-arrow-right"
      size="xs"
      variant="soft"
      class="ms-auto"
      data-testid="learn-task-open"
    />
  </div>
</template>
