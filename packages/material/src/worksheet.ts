import { codeOf, type LearnModule, type LearnTask } from '@klonk/learn'
import { answerLines, isCodeTrack, moduleLabel, selectedTasks, solutionText, starterFrame, taskImageRows, toTable, type MaterialContext, type PictureStyle } from './content'
import { inline, markdownBlocks } from './markdown'
import type { MaterialBlock, MaterialDocument } from './model'

export type WorksheetOptions = {
  /** Arbeitsblatt (Platz zum Schreiben) oder Lösungsblatt (Musterlösungen, erwartete Ergebnisse) */
  kind: 'worksheet' | 'solutions'
  /** Aufgaben-IDs (leer = alle) */
  tasks?: string[]
  pictures: PictureStyle
  /** Ergebnis der Musterlösung als Bild (Arbeitsblatt: nur bei Bauaufgaben; Lösungsblatt: immer) */
  goal: boolean
  /** Alle Startwelten statt nur der ersten */
  allWorlds: boolean
  objectives: boolean
  intro: boolean
  hints: boolean
  /** Name, Klasse, Datum */
  fields: boolean
  /** Lösungsblatt: Hinweise für Lehrkräfte voranstellen */
  teacher: boolean
  /** Bildgröße: groß (bis 62 mm hoch) oder kompakt (bis 45 mm, öfter zwei Aufgaben je Seite) */
  imageSize: ImageSize
  /** Digital ausfüllbar: Name/Klasse/Datum und Programm als Eingabefelder (DOCX, PDF über den PDF-Dienst) */
  fillable: boolean
}

export type ImageSize = 'large' | 'compact'
/** Höchste Höhe einer Bildzeile in mm */
export const IMAGE_HEIGHTS: Record<ImageSize, number> = { large: 62, compact: 45 }

export const DEFAULT_WORKSHEET: WorksheetOptions = {
  kind: 'worksheet',
  pictures: 'both',
  goal: true,
  allWorlds: false,
  objectives: true,
  intro: true,
  hints: false,
  fields: true,
  teacher: true,
  imageSize: 'large',
  fillable: false,
}

function taskBlocks(module: LearnModule, task: LearnTask, number: number, ctx: MaterialContext, options: WorksheetOptions): MaterialBlock[] {
  const { t, lang } = ctx
  const solutions = options.kind === 'solutions'
  const blocks: MaterialBlock[] = [{ type: 'heading', level: 2, text: t('task', { n: number, title: task.title[lang] }) }]
  blocks.push(...markdownBlocks(task.text[lang], ctx.language))
  if (task.requires?.length) {
    blocks.push({ type: 'paragraph', muted: true, lines: [[{ kind: 'text', value: t('use', { list: task.requires.map(c => t(`constructs.${c}`)).join(', ') }) }]] })
  }

  // Welten: Start und (Bauaufgaben bzw. Lösungsblatt) Ziel; SQL über die Welt-Datenbank zeigt die Welt mit Koordinaten
  const rows = taskImageRows(task, ctx, {
    pictures: options.pictures,
    goal: options.goal && (solutions ? !!(task.check.position || task.check.cells || task.check.direction) : !!task.check.cells),
    allWorlds: options.allWorlds,
  })
  if (rows.length) {
    const plan = rows.some(row => row.some(image => image.kind === 'plan'))
    blocks.push({ type: 'images', rows, note: plan ? t('planLegend') : undefined, maxHeight: IMAGE_HEIGHTS[options.imageSize] ?? IMAGE_HEIGHTS.large })
  }
  if (task.worlds.length > 1 && !solutions) blocks.push({ type: 'paragraph', muted: true, lines: [[{ kind: 'text', value: t('severalWorlds', { n: task.worlds.length }) }]] })

  // Datenbanken (nicht die Welt-Datenbank – die zeigt das Bild)
  if (!task.worldDatabase) {
    for (const table of ctx.tables?.[task.id] ?? []) blocks.push({ type: 'table', table })
  }

  if (options.hints && task.hints?.length && !solutions) {
    blocks.push({ type: 'box', tone: 'hint', title: t('hint'), blocks: task.hints.flatMap(hint => markdownBlocks(hint[lang], ctx.language)) })
  }

  if (solutions) {
    const content: MaterialBlock[] = []
    const solution = solutionText(module, task, ctx)
    if (solution) content.push({ type: 'code', code: solution })
    const expected = ctx.expected?.[task.id]?.[0]
    if (expected?.result && module.track !== 'basics') {
      content.push({ type: 'paragraph', lines: [[{ kind: 'bold', value: t('expectedResult') }]] })
      content.push({ type: 'table', table: toTable(expected.result.columns, expected.result.rows) })
    }
    if (task.check.output && expected?.output.length) {
      content.push({ type: 'paragraph', lines: [[{ kind: 'bold', value: t('expectedOutput') }]] })
      content.push({ type: 'code', code: expected.output.join('\n') })
    }
    if (content.length) blocks.push({ type: 'box', tone: 'solution', title: t('solution'), blocks: content })
    return blocks
  }

  const frame = starterFrame(module, ctx)
  blocks.push({
    type: 'lines',
    label: module.track === 'sql' ? t('yourQuery') : t('yourProgram'),
    count: answerLines(module, task, ctx),
    code: true,
    fillable: options.fillable,
    ...(frame ? { before: frame.before, after: frame.after, indent: frame.indent } : {}),
  })
  return blocks
}

/** Arbeitsblatt bzw. Lösungsblatt zu einem Lernmodul */
export function buildWorksheet(module: LearnModule, options: WorksheetOptions, ctx: MaterialContext): MaterialDocument {
  const { t, lang } = ctx
  const solutions = options.kind === 'solutions'
  const blocks: MaterialBlock[] = []
  if (options.fields && !solutions) blocks.push({ type: 'fields', labels: [t('name'), t('class'), t('date')], fillable: options.fillable })
  if (solutions && options.teacher && module.teacher[lang].trim()) {
    blocks.push({ type: 'box', tone: 'teacher', title: t('teacherNotes'), blocks: markdownBlocks(module.teacher[lang], ctx.language) })
  }
  if (options.objectives && module.objectives.length) {
    blocks.push({ type: 'box', tone: 'info', title: t('objectives'), blocks: [{ type: 'list', items: module.objectives.map(o => inline(o[lang])) }] })
  }
  if (options.intro && module.intro[lang].trim() && !solutions) {
    const intro = markdownBlocks(module.intro[lang], ctx.language)
    if (isCodeTrack(module) && ctx.language) intro.unshift({ type: 'paragraph', muted: true, lines: [[{ kind: 'text', value: t('examplesIn', { language: t(`languages.${ctx.language}`) }) }]] })
    blocks.push({ type: 'box', tone: 'info', title: t('intro'), blocks: intro })
  }
  for (const task of selectedTasks(module, options.tasks)) {
    blocks.push({ type: 'keep', blocks: taskBlocks(module, task, module.tasks.indexOf(task) + 1, ctx, options) })
  }
  const label = solutions ? t('solutions') : t('worksheet')
  return {
    kind: options.kind,
    lang,
    code: codeOf(module),
    title: module.title[lang],
    label,
    school: ctx.school,
    footer: t('footer', { module: moduleLabel(module, lang), label }),
    pageLabel: t('page', { page: '{page}', pages: '{pages}' }),
    blocks,
  }
}
