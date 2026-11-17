<script setup lang="ts">
import { CODE_LANGUAGES, codeOf, isCodeLanguage, isCustomModuleId, trackModules, type CodeLanguage, type LearnTask, type Outcome } from '@klonk/learn'
import {
  buildPresentation,
  buildWorksheet,
  collectImages,
  DEFAULT_SLIDES,
  DEFAULT_WORKSHEET,
  isCodeTrack,
  moduleLabel,
  renderDocumentHtml,
  renderSlidesHtml,
  toTable,
  type ImageMap,
  type MaterialContext,
  type MaterialDocument,
  type MaterialKind,
  type MaterialTable,
  type Presentation,
  type SlidesOptions,
  type WorksheetOptions,
} from '@klonk/material'
import { computeExpected, scenarioTables } from '~/utils/learn-check'
import { resolveImages } from '~/utils/material-images'

// Unterrichtsmaterial zu einem Lernmodul: Arbeitsblatt, Lösungsblatt und Präsentation – Vorschau, Drucken, PDF sowie DOCX/PPTX
// zum Weiterbearbeiten (Euro-Office, OnlyOffice, LibreOffice, Word). DOCX/PPTX entstehen im Browser; mit PDF-Dienst (Gotenberg)
// macht der Server daraus die PDF – Vorschau, Druck und PDF sind dann genau die Datei (samt Eingabefeldern). Ohne Dienst zeigt
// die Vorschau die HTML-Fassung, PDF über den Druckdialog. Lizenz-Feature `customModules`: Oberfläche und PDF-Endpunkt.
definePageMeta({ key: route => route.path })

const { t, locale, locales, loadLocaleMessages } = useI18n()
const route = useRoute()
const router = useRouter()
const learn = useLearn()
const { user } = useAuth()
const { maxCharacters, can, loaded } = useLicense()
const toast = useToast()

const module = await learn.resolve(String(route.params.module))
// Wie Musterlösung und Hinweise für Lehrkräfte: nicht für Lernende einer Organisation
const allowed = computed(() => !user.value || !user.value.organizationId || user.value.role !== 'member' || user.value.platformRole !== 'user')
// Lizenzpflichtig wie eigene Lernmodule; der Hinweis erscheint erst, wenn die Lizenz vom Server geladen ist
const licensed = computed(() => can('customModules'))
useSeoMeta({ title: () => (module ? `${t('material.title')} · ${moduleLabel(module, locale.value === 'en' ? 'en' : 'de')}` : t('material.title')) })

const KINDS: MaterialKind[] = ['worksheet', 'solutions', 'slides']
const KIND_ICONS: Record<MaterialKind, string> = { worksheet: 'i-lucide-file-pen-line', solutions: 'i-lucide-file-check-2', slides: 'i-lucide-presentation' }
const kind = ref<MaterialKind>(KINDS.includes(route.query.type as MaterialKind) ? route.query.type as MaterialKind : 'worksheet')
watch(kind, value => router.replace({ query: { ...route.query, type: value } }))

// Einstellungen bleiben im Browser gemerkt (je Gerät, nicht je Modul)
const STORE_KEY = 'klonk:material'
type Stored = { sheet?: Partial<WorksheetOptions>, slides?: Partial<SlidesOptions>, school?: string }
function stored(): Stored {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Stored
  }
  catch {
    return {}
  }
}
const sheet = reactive<WorksheetOptions>({ ...DEFAULT_WORKSHEET })
const slides = reactive<SlidesOptions>({ ...DEFAULT_SLIDES })
const school = ref('')
const docLang = ref<'de' | 'en'>(locale.value === 'en' ? 'en' : 'de')
const codeLanguage = ref<CodeLanguage>('python')
const taskIds = ref<string[]>(module?.tasks.map(task => task.id) ?? [])

onMounted(() => {
  const saved = stored()
  Object.assign(sheet, saved.sheet ?? {}, { kind: 'worksheet', tasks: undefined })
  Object.assign(slides, saved.slides ?? {}, { tasks: undefined })
  school.value = saved.school ?? user.value?.organizationName ?? ''
  try {
    const preferred = localStorage.getItem('klonk:learn-language')
    if (preferred && isCodeLanguage(preferred)) codeLanguage.value = preferred
  }
  catch {
    // kein Speicher (privater Modus)
  }
})
watch([sheet, slides, school], () => {
  try {
    const { kind: _kind, tasks: _tasks, ...sheetOptions } = sheet
    const { tasks: _slideTasks, ...slideOptions } = slides
    localStorage.setItem(STORE_KEY, JSON.stringify({ sheet: sheetOptions, slides: slideOptions, school: school.value }))
  }
  catch {
    // kein Speicher (privater Modus)
  }
}, { deep: true })

const codeTrack = computed(() => !!module && isCodeTrack(module))
const docLangItems = computed(() => locales.value.filter(l => l.code === 'de' || l.code === 'en').map(l => ({ label: l.name ?? l.code, value: l.code as 'de' | 'en' })))
const codeLanguageItems = computed(() => CODE_LANGUAGES.map(value => ({ label: t(`editor.languages.${value}`), value })))
const imageSizeItems = computed(() => (['large', 'compact'] as const).map(value => ({ label: t(`material.imageSizes.${value}`), value })))
const pictureItems = computed(() => (['both', 'world', 'plan', 'none'] as const)
  .filter(value => kind.value !== 'slides' || value !== 'both')
  .map(value => ({ label: t(`material.pictureStyles.${value}`), value })))
const placementItems = computed(() => (['end', 'afterTask', 'none'] as const).map(value => ({ label: t(`material.solutionPlacement.${value}`), value })))
const allTasks = computed({
  get: () => !!module && taskIds.value.length === module.tasks.length,
  set: (on: boolean) => (taskIds.value = on && module ? module.tasks.map(task => task.id) : []),
})
function toggleTask(id: string, on: boolean) {
  taskIds.value = module!.tasks.map(task => task.id).filter(t => (t === id ? on : taskIds.value.includes(t)))
}

/** Beschriftungen des Dokuments in dessen Sprache (kann von der Oberfläche abweichen) */
function labels(lang: 'de' | 'en'): MaterialContext['t'] {
  return (key, params = {}) => {
    if (key.startsWith('constructs.')) return t(`learn.${key}`, params, { locale: lang })
    if (key.startsWith('tracks.')) return t(`learn.tracks.${key.slice(7)}.title`, params, { locale: lang })
    if (key.startsWith('languages.')) return t(`editor.${key}`, params, { locale: lang })
    return t(`material.doc.${key}`, params, { locale: lang })
  }
}

// Ergebnisse der Musterlösungen (Zielbilder, erwartete Ergebnisse) und Aufgabendatenbanken – einmal je Sprache
const tableCache = new Map<string, Promise<MaterialTable[] | undefined>>()
function tablesOf(task: LearnTask, lang: 'de' | 'en') {
  const key = `${lang}:${task.id}`
  let pending = tableCache.get(key)
  if (!pending) {
    pending = task.databases?.length && !task.worldDatabase
      ? scenarioTables(task, 0, lang).then(result => result.tables.map(table => toTable(table.columns, table.rows, table.name))).catch(() => undefined)
      : Promise.resolve(undefined)
    tableCache.set(key, pending)
  }
  return pending
}
const expectedOf = (task: LearnTask, lang: 'de' | 'en'): Promise<Outcome[] | undefined> =>
  computeExpected(module!, task, { lang, maxCharacters: maxCharacters.value }).catch(() => undefined)

/** Braucht das gewählte Material das Ergebnis der Musterlösung (Zielbild, erwartetes Ergebnis)? */
function needsExpected(task: LearnTask) {
  if (kind.value === 'solutions') return true
  if (kind.value === 'slides') return slides.solutions !== 'none' || (slides.pictures !== 'none' && !!task.check.cells)
  return sheet.goal && sheet.pictures !== 'none' && !!task.check.cells
}

async function context(): Promise<MaterialContext> {
  const lang = docLang.value
  // Texte der Dokumentsprache nachladen (i18n lädt sonst nur die Sprache der Oberfläche)
  await loadLocaleMessages(lang)
  const tasks = module!.tasks.filter(task => taskIds.value.includes(task.id))
  const expected: MaterialContext['expected'] = {}
  const tables: MaterialContext['tables'] = {}
  for (const task of tasks) {
    tables[task.id] = await tablesOf(task, lang)
    if (needsExpected(task)) expected[task.id] = await expectedOf(task, lang)
  }
  // Folgemodul derselben Reihe für die Abschlussfolie
  const order = isCustomModuleId(module!.id) ? [] : trackModules(module!.track)
  const following = order[order.findIndex(m => m.id === module!.id) + 1]
  return {
    lang,
    t: labels(lang),
    language: codeTrack.value ? codeLanguage.value : undefined,
    school: school.value.trim() || undefined,
    expected,
    tables,
    next: following ? { code: codeOf(following), title: following.title[lang] } : undefined,
  }
}

// Vorschau: zuerst ohne Bilder, dann mit, mit PDF-Dienst zuletzt die PDF aus der Datei; neuere Anfragen verdrängen ältere
type Generated = { content: MaterialDocument | Presentation, images: ImageMap, office?: Blob, pdf?: Blob }
const html = ref('')
const state = ref<'computing' | 'rendering' | 'converting' | 'ready' | 'error'>('computing')
// PDF-Dienst vorhanden? (einmal je Seitenaufruf; ohne Dienst bleibt es bei der HTML-Fassung)
let pdfCheck: Promise<boolean> | undefined
const pdfService = ref(false)
const pdfAvailable = () => (pdfCheck ??= $fetch<{ available: boolean }>('/api/material/pdf')
  .then(result => (pdfService.value = result.available))
  .catch(() => false))
const pdfUrl = ref('')
function showPdf(pdf: Blob | null) {
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
  pdfUrl.value = pdf ? URL.createObjectURL(pdf) : ''
}
const OFFICE_TYPES = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }
const officeType = (content: MaterialDocument | Presentation) => (content.kind === 'slides' ? 'pptx' : 'docx')
async function officeFile(content: MaterialDocument | Presentation, images: ImageMap): Promise<Blob> {
  if (content.kind === 'slides') return (await import('@klonk/material/pptx')).renderPptx(content, images)
  return (await import('@klonk/material/docx')).renderDocx(content, images)
}
const progress = reactive({ done: 0, total: 0 })
let current: Generated | null = null
let generation = 0
const render = (content: MaterialDocument | Presentation, images: ImageMap) =>
  content.kind === 'slides' ? renderSlidesHtml(content, images) : renderDocumentHtml(content, images)

async function generate() {
  if (!module || !allowed.value || !licensed.value) return
  const run = ++generation
  current = null
  state.value = 'computing'
  try {
    const ctx = await context()
    if (run !== generation) return
    const tasks = taskIds.value.length ? [...taskIds.value] : ['']
    const content = kind.value === 'slides'
      ? buildPresentation(module, { ...slides, tasks }, ctx)
      : buildWorksheet(module, { ...sheet, kind: kind.value, tasks }, ctx)
    html.value = render(content, {})
    const list = collectImages(content)
    progress.done = 0
    progress.total = list.length
    state.value = 'rendering'
    const images = await resolveImages(list, (done) => {
      if (run === generation) progress.done = done
    })
    if (run !== generation) return
    current = { content, images }
    html.value = render(content, images)
    if (await pdfAvailable()) {
      state.value = 'converting'
      const done = await convert(current, run)
      if (run !== generation) return
      if (!done) showPdf(null)
    }
    state.value = 'ready'
  }
  catch (error) {
    console.error(error)
    if (run === generation) state.value = 'error'
  }
}
/** DOCX/PPTX ⇒ PDF über den Server; bei Fehlern bleibt die HTML-Vorschau (Hinweis einmal je Fehlerserie) */
let pdfWarned = false
async function convert(target: Generated, run: number) {
  try {
    const type = officeType(target.content)
    const office = await officeFile(target.content, target.images)
    const pdf = await $fetch<Blob>('/api/material/pdf', { method: 'POST', query: { type }, body: office, headers: { 'content-type': OFFICE_TYPES[type] }, responseType: 'blob' })
    if (run !== generation) return true
    target.office = office
    target.pdf = pdf
    showPdf(pdf)
    pdfWarned = false
    return true
  }
  catch (error) {
    console.error(error)
    if (run === generation && !pdfWarned) toast.add({ title: t('material.pdfFailed'), color: 'warning' })
    pdfWarned = true
    return false
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
watch([kind, docLang, codeLanguage, taskIds, sheet, slides, school, licensed], () => {
  clearTimeout(timer)
  timer = setTimeout(generate, 250)
}, { deep: true })
onMounted(generate)
onBeforeUnmount(() => {
  clearTimeout(timer)
  generation++
  showPdf(null)
})

const status = computed(() => {
  if (state.value === 'computing') return t('material.computing')
  if (state.value === 'rendering') return t('material.rendering', { done: progress.done, total: progress.total })
  if (state.value === 'converting') return t('material.converting')
  if (state.value === 'error') return t('material.failed')
  return ''
})

// Ausgabe
const frame = ref<HTMLIFrameElement>()
const pdfFrame = ref<HTMLIFrameElement>()
/** Druckt die PDF (Betrachter des Browsers im iframe) bzw. ohne PDF-Dienst die HTML-Fassung */
function print() {
  const target = pdfUrl.value ? pdfFrame.value : frame.value
  target?.contentWindow?.focus()
  target?.contentWindow?.print()
}
const downloading = ref(false)
const fileName = (extension: string) => {
  const base = `${moduleLabel(module!, docLang.value)} – ${current?.content.label ?? ''}`
  return `${base.replace(/[\\/:*?"<>|]+/g, '-').trim()}.${extension}`
}
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
/** DOCX/PPTX – mit PDF-Dienst genau die Datei, aus der die PDF entstand */
async function download() {
  if (!current) return
  downloading.value = true
  try {
    save(current.office ?? await officeFile(current.content, current.images), fileName(officeType(current.content)))
  }
  catch (error) {
    console.error(error)
    toast.add({ title: t('material.downloadFailed'), color: 'error' })
  }
  finally {
    downloading.value = false
  }
}
function downloadPdf() {
  if (current?.pdf) save(current.pdf, fileName('pdf'))
}
</script>

<template>
  <div class="flex flex-col lg:h-[calc(100dvh-var(--ui-header-height))]">
    <UContainer
      v-if="!module || !allowed || !licensed"
      class="py-8"
    >
      <UButton
        to="/learn"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
        :label="t('learn.allModules')"
        class="mb-4"
      />
      <UAlert
        v-if="!module || !allowed"
        color="warning"
        variant="subtle"
        :icon="module ? 'i-lucide-lock' : 'i-lucide-search-x'"
        :title="module ? t('material.noAccess') : t('learn.notFound')"
        data-testid="material-denied"
      />
      <UAlert
        v-else-if="loaded"
        color="warning"
        variant="subtle"
        icon="i-lucide-badge-check"
        :title="t('material.licenseTitle')"
        :description="t('material.licenseHint')"
        data-testid="material-license"
      />
    </UContainer>

    <div
      v-else
      class="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[22rem_minmax(0,1fr)]"
    >
      <aside class="flex min-h-0 flex-col gap-4 lg:overflow-y-auto lg:pe-1">
        <div>
          <UButton
            :to="`/learn/${module.id}`"
            icon="i-lucide-arrow-left"
            variant="ghost"
            color="neutral"
            size="sm"
            :label="t('material.back')"
            class="-ms-2 mb-1"
          />
          <p class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
            {{ t('material.title') }}
          </p>
          <h1
            class="text-xl font-bold"
            data-testid="material-title"
          >
            {{ moduleLabel(module, docLang) }}
          </h1>
          <p class="mt-1 text-sm text-(--ui-text-muted)">
            {{ t('material.intro') }}
          </p>
        </div>

        <div
          class="grid grid-cols-3 gap-1 rounded-lg bg-(--ui-bg-elevated) p-1"
          role="tablist"
        >
          <button
            v-for="value in KINDS"
            :key="value"
            type="button"
            role="tab"
            :aria-selected="kind === value"
            :title="t(`material.typeHints.${value}`)"
            class="flex flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors"
            :class="kind === value ? 'bg-(--ui-bg) text-(--ui-text-highlighted) shadow-sm' : 'text-(--ui-text-muted) hover:text-(--ui-text)'"
            :data-testid="`material-tab-${value}`"
            @click="kind = value"
          >
            <UIcon
              :name="KIND_ICONS[value]"
              class="size-5"
            />
            {{ t(`material.types.${value}`) }}
          </button>
        </div>

        <div class="flex flex-col gap-2">
          <UButton
            icon="i-lucide-printer"
            :label="pdfUrl ? t('material.printPdf') : t('material.print')"
            :disabled="state !== 'ready'"
            block
            data-testid="material-print"
            @click="print"
          />
          <UButton
            v-if="pdfUrl"
            icon="i-lucide-file-down"
            :label="t('material.pdf')"
            :disabled="state !== 'ready'"
            variant="outline"
            block
            data-testid="material-pdf"
            @click="downloadPdf"
          />
          <UButton
            :icon="kind === 'slides' ? 'i-lucide-presentation' : 'i-lucide-file-text'"
            :label="kind === 'slides' ? t('material.pptx') : t('material.docx')"
            :disabled="state !== 'ready'"
            :loading="downloading"
            variant="outline"
            block
            :data-testid="kind === 'slides' ? 'material-pptx' : 'material-docx'"
            @click="download"
          />
          <p class="text-xs text-(--ui-text-muted)">
            {{ pdfService ? t('material.pdfHint') : t('material.printHint') }} {{ t('material.editHint') }}
          </p>
        </div>

        <USeparator :label="t('material.settings')" />

        <div class="flex flex-col gap-3">
          <UFormField :label="t('material.docLanguage')">
            <USelect
              v-model="docLang"
              :items="docLangItems"
              class="w-full"
              data-testid="material-lang"
            />
          </UFormField>
          <UFormField
            v-if="codeTrack"
            :label="t('material.codeLanguage')"
          >
            <USelect
              v-model="codeLanguage"
              :items="codeLanguageItems"
              class="w-full"
              data-testid="material-code-language"
            />
          </UFormField>
          <UFormField
            :label="t('material.school')"
            :help="t('material.schoolHint')"
          >
            <UInput
              v-model="school"
              class="w-full"
              data-testid="material-school"
            />
          </UFormField>

          <template v-if="kind !== 'slides'">
            <UFormField :label="t('material.pictures')">
              <USelect
                v-model="sheet.pictures"
                :items="pictureItems"
                class="w-full"
                data-testid="material-pictures"
              />
            </UFormField>
            <UFormField :label="t('material.imageSize')">
              <USelect
                v-model="sheet.imageSize"
                :items="imageSizeItems"
                :disabled="sheet.pictures === 'none'"
                class="w-full"
                data-testid="material-image-size"
              />
            </UFormField>
            <UCheckbox
              v-model="sheet.goal"
              :label="kind === 'solutions' ? t('material.goalSolutions') : t('material.goal')"
              :disabled="sheet.pictures === 'none'"
            />
            <UCheckbox
              v-model="sheet.allWorlds"
              :label="t('material.allWorlds')"
              :disabled="sheet.pictures === 'none'"
            />
            <UCheckbox
              v-model="sheet.objectives"
              :label="t('material.objectives')"
            />
            <template v-if="kind === 'worksheet'">
              <UCheckbox
                v-model="sheet.intro"
                :label="t('material.introBox')"
              />
              <UCheckbox
                v-model="sheet.hints"
                :label="t('material.hints')"
              />
              <UCheckbox
                v-model="sheet.fields"
                :label="t('material.fields')"
              />
              <UCheckbox
                v-model="sheet.fillable"
                :label="t('material.fillable')"
                :description="pdfService ? t('material.fillableHint') : t('material.fillableHintDocx')"
                data-testid="material-fillable"
              />
            </template>
            <UCheckbox
              v-else
              v-model="sheet.teacher"
              :label="t('material.teacher')"
            />
          </template>

          <template v-else>
            <UFormField :label="t('material.pictures')">
              <USelect
                v-model="slides.pictures"
                :items="pictureItems"
                class="w-full"
                data-testid="material-pictures"
              />
            </UFormField>
            <UFormField :label="t('material.solutionSlides')">
              <USelect
                v-model="slides.solutions"
                :items="placementItems"
                class="w-full"
                data-testid="material-solution-slides"
              />
            </UFormField>
            <UCheckbox
              v-model="slides.objectives"
              :label="t('material.objectives')"
            />
            <UCheckbox
              v-model="slides.intro"
              :label="t('material.introBox')"
            />
            <UCheckbox
              v-model="slides.summary"
              :label="t('material.summary')"
            />
            <UCheckbox
              v-model="slides.notes"
              :label="t('material.notes')"
            />
          </template>
        </div>

        <USeparator :label="t('material.tasks')" />

        <div
          class="flex flex-col gap-2"
          data-testid="material-tasks"
        >
          <UCheckbox
            v-model="allTasks"
            :label="t('material.allTasks')"
          />
          <UCheckbox
            v-for="(task, i) in module.tasks"
            :key="task.id"
            :model-value="taskIds.includes(task.id)"
            :label="`${i + 1}. ${task.title[docLang]}`"
            class="ms-4"
            :data-testid="`material-task-${task.id}`"
            @update:model-value="on => toggleTask(task.id, !!on)"
          />
        </div>
      </aside>

      <section class="flex min-h-[70vh] flex-col overflow-hidden rounded-lg border border-(--ui-border)">
        <div class="flex items-center justify-between gap-2 border-b border-(--ui-border) bg-(--ui-bg-elevated) px-3 py-1.5 text-sm">
          <span class="font-medium">{{ t('material.preview') }}</span>
          <span
            class="flex items-center gap-1.5 text-xs text-(--ui-text-muted)"
            :class="{ 'text-(--ui-error)': state === 'error' }"
            data-testid="material-status"
            :data-state="state"
          >
            <UIcon
              v-if="state === 'computing' || state === 'rendering' || state === 'converting'"
              name="i-lucide-loader-circle"
              class="animate-spin"
            />
            {{ status }}
          </span>
        </div>
        <!-- PDF aus dem DOCX/PPTX im Betrachter des Browsers (eigene Datei, daher ohne Sandbox – die blockiert den Betrachter) -->
        <iframe
          v-if="pdfUrl"
          ref="pdfFrame"
          :src="pdfUrl"
          :title="t('material.preview')"
          class="min-h-0 w-full flex-1 bg-[#e5e7eb]"
          data-testid="material-pdf-preview"
        />
        <iframe
          v-show="!pdfUrl"
          ref="frame"
          :srcdoc="html"
          :title="t('material.preview')"
          sandbox="allow-same-origin allow-modals"
          class="min-h-0 w-full flex-1 bg-[#e5e7eb]"
          data-testid="material-preview"
        />
      </section>
    </div>
  </div>
</template>
