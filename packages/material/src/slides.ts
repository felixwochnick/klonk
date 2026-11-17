import { codeOf, type LearnModule, type LearnTask } from '@klonk/learn'
import { goalImage, isCodeTrack, moduleLabel, selectedTasks, solutionText, taskImages, toTable, type MaterialContext, type PictureStyle } from './content'
import { inline, markdownBlocks, markdownPlain } from './markdown'
import type { MaterialBlock, Presentation, Slide } from './model'

export type SlidesOptions = {
  tasks?: string[]
  /** Darstellung der Welten auf den Aufgabenfolien */
  pictures: Exclude<PictureStyle, 'both'>
  objectives: boolean
  intro: boolean
  /** Lösungsfolien: keine, direkt nach jeder Aufgabe oder gesammelt am Ende */
  solutions: 'none' | 'afterTask' | 'end'
  /** Sprechernotizen: Hinweise für Lehrkräfte, Tipps und Lösungen */
  notes: boolean
  /** Abschlussfolie mit Lernzielen und Folgemodul */
  summary: boolean
}

export const DEFAULT_SLIDES: SlidesOptions = {
  pictures: 'world',
  objectives: true,
  intro: true,
  solutions: 'end',
  notes: true,
  summary: true,
}

/** Ungefähre Höhe eines Bausteins in Textzeilen (zum Aufteilen auf Folien) */
function weight(block: MaterialBlock): number {
  const text = (line: { value: string }[]) => Math.max(1, Math.ceil(line.map(p => p.value).join('').length / 62))
  switch (block.type) {
    case 'paragraph': return block.lines.reduce((sum, line) => sum + text(line), 0) + 0.5
    case 'list': return block.items.reduce((sum, item) => sum + text(item), 0) + 0.5
    case 'code': return block.code.split('\n').length * 0.85 + 1
    case 'table': return block.table.rows.length + 2
    default: return 1
  }
}

/** Bausteine auf Folien verteilen (Codeblöcke werden nicht geteilt) */
export function chunkBlocks(blocks: MaterialBlock[], budget = 11): MaterialBlock[][] {
  const chunks: MaterialBlock[][] = []
  let current: MaterialBlock[] = []
  let used = 0
  for (const block of blocks) {
    const w = weight(block)
    if (current.length && used + w > budget) {
      chunks.push(current)
      current = []
      used = 0
    }
    current.push(block)
    used += w
  }
  if (current.length) chunks.push(current)
  return chunks
}

function solutionSlide(module: LearnModule, task: LearnTask, number: number, ctx: MaterialContext, options: SlidesOptions): Slide {
  const { t, lang } = ctx
  const blocks: MaterialBlock[] = []
  const solution = solutionText(module, task, ctx)
  if (solution) blocks.push({ type: 'code', code: solution })
  const expected = ctx.expected?.[task.id]?.[0]
  if (expected?.result && module.track !== 'basics') blocks.push({ type: 'table', table: toTable(expected.result.columns, expected.result.rows, t('expectedResult'), 6) })
  if (task.check.output && expected?.output.length) {
    blocks.push({ type: 'paragraph', lines: [[{ kind: 'bold', value: t('expectedOutput') }]] })
    blocks.push({ type: 'code', code: expected.output.slice(0, 8).join('\n') })
  }
  const goal = options.pictures === 'none' ? null : goalImage(task, ctx, options.pictures)
  const images = goal ? [goal] : []
  return { layout: 'content', kicker: t('solutionKicker', { n: number }), title: task.title[lang], blocks, images }
}

function taskSlide(module: LearnModule, task: LearnTask, number: number, ctx: MaterialContext, options: SlidesOptions): Slide {
  const { t, lang } = ctx
  const blocks = markdownBlocks(task.text[lang], ctx.language)
  if (task.requires?.length) blocks.push({ type: 'paragraph', muted: true, lines: [[{ kind: 'text', value: t('use', { list: task.requires.map(c => t(`constructs.${c}`)).join(', ') }) }]] })
  // Datenbank statt Welt: erste Tabelle (gekürzt) auf die Folie
  if (!task.worldDatabase) {
    const table = ctx.tables?.[task.id]?.[0]
    if (table) blocks.push({ type: 'table', table: { ...table, rows: table.rows.slice(0, 6), more: (table.more ?? 0) + Math.max(0, table.rows.length - 6) || undefined } })
  }
  const images = taskImages(task, ctx, { pictures: options.pictures, goal: !!task.check.cells, allWorlds: false, limit: 2 })
  const notes: string[] = []
  if (options.notes) {
    for (const hint of task.hints ?? []) notes.push(`${t('hint')}: ${markdownPlain(hint[lang], ctx.language)}`)
    if (task.worlds.length > 1) notes.push(t('severalWorlds', { n: task.worlds.length }))
    const solution = solutionText(module, task, ctx)
    if (solution) notes.push(`${t('solution')}:\n${solution}`)
  }
  return { layout: 'content', kicker: t('taskKicker', { n: number }), title: task.title[lang], blocks, images, notes: notes.join('\n\n') || undefined }
}

/** Präsentation zu einem Lernmodul: Titel, Lernziele, Einführung, Aufgaben, Lösungen, Zusammenfassung */
export function buildPresentation(module: LearnModule, options: SlidesOptions, ctx: MaterialContext): Presentation {
  const { t, lang } = ctx
  const code = codeOf(module)
  const slides: Slide[] = []
  slides.push({
    layout: 'title',
    // Das Kürzel steht groß daneben
    kicker: t(`tracks.${module.track}`),
    title: module.title[lang],
    subtitle: module.summary[lang],
    blocks: [],
    images: [],
    notes: options.notes && module.teacher[lang].trim() ? `${t('teacherNotes')}:\n${markdownPlain(module.teacher[lang], ctx.language)}` : undefined,
  })
  if (options.objectives && module.objectives.length) {
    slides.push({ layout: 'content', title: t('objectivesSlide'), blocks: [{ type: 'list', items: module.objectives.map(o => inline(o[lang])) }], images: [] })
  }
  if (options.intro && module.intro[lang].trim()) {
    const chunks = chunkBlocks(markdownBlocks(module.intro[lang], ctx.language))
    chunks.forEach((blocks, i) => slides.push({
      layout: 'content',
      kicker: isCodeTrack(module) && ctx.language ? t('examplesIn', { language: t(`languages.${ctx.language}`) }) : undefined,
      title: chunks.length > 1 ? `${t('introSlide')} (${i + 1}/${chunks.length})` : t('introSlide'),
      blocks,
      images: [],
    }))
  }
  const tasks = selectedTasks(module, options.tasks)
  const numberOf = (task: LearnTask) => module.tasks.indexOf(task) + 1
  for (const task of tasks) {
    slides.push(taskSlide(module, task, numberOf(task), ctx, options))
    if (options.solutions === 'afterTask') slides.push(solutionSlide(module, task, numberOf(task), ctx, options))
  }
  if (options.solutions === 'end' && tasks.length) {
    slides.push({ layout: 'section', title: t('solutionsSection'), blocks: [], images: [] })
    for (const task of tasks) slides.push(solutionSlide(module, task, numberOf(task), ctx, options))
  }
  if (options.summary) {
    const blocks: MaterialBlock[] = [{ type: 'list', check: true, items: module.objectives.map(o => inline(o[lang])) }]
    if (ctx.next) blocks.push({ type: 'paragraph', lines: [[{ kind: 'bold', value: t('next', { module: `${ctx.next.code} ${ctx.next.title}`.trim() }) }]] })
    slides.push({ layout: 'content', title: t('summary'), blocks, images: [] })
  }
  const label = t('slides')
  return {
    kind: 'slides',
    lang,
    code,
    title: module.title[lang],
    label,
    school: ctx.school,
    footer: t('footer', { module: moduleLabel(module, lang), label }),
    slides,
  }
}
