import { findModule, LEARN_MODULES, map, type LearnModule } from '@klonk/learn'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  buildPresentation,
  buildWorksheet,
  collectImages,
  DEFAULT_SLIDES,
  DEFAULT_WORKSHEET,
  markdownBlocks,
  renderDocumentHtml,
  renderSlidesHtml,
  taskImageRows,
  taskImages,
  worldPlanSvg,
  type ImageMap,
  type MaterialBlock,
  type MaterialContext,
} from '../src'
import { renderDocxBytes } from '../src/docx'
import { renderPptxBytes } from '../src/pptx'

// Beschriftungen wie in der App: Schlüssel + Parameter (reicht, um Inhalte wiederzufinden)
const t: MaterialContext['t'] = (key, params) => (params ? `${key}(${Object.values(params).join(',')})` : key)
const ctx = (lang: 'de' | 'en', module: LearnModule): MaterialContext => ({
  lang,
  t,
  language: module.track === 'advanced' || module.track === 'apps' ? 'java' : undefined,
  school: 'Testschule',
})
// 1×1-PNG für alle Bilder
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
/** Bausteine ohne Verschachtelung durch `keep` (Aufgaben) */
const flat = (blocks: MaterialBlock[]): MaterialBlock[] => blocks.flatMap(b => (b.type === 'keep' ? flat(b.blocks) : [b]))
const fakeImages = (content: Parameters<typeof collectImages>[0]): ImageMap =>
  Object.fromEntries(collectImages(content).map(image => [image.id, { src: PNG, png: PNG, width: 400, height: 300 }]))

describe('Draufsicht', () => {
  it('zeigt Ziegelzahl, Figur und maskiert Namen', () => {
    const world = map(`
      > 3 .
      . y #
    `, { names: ['<b>Kim'] })
    world.characters.push({ ...world.characters[0]!, id: 'Klara', x: 2, z: 0 })
    const { svg, width, height } = worldPlanSvg(world)
    expect(width).toBeGreaterThan(3 * 48)
    expect(height).toBeGreaterThan(2 * 48)
    expect(svg).toContain('>3</text>')
    expect(svg).toContain('&#60;')
    expect(svg).not.toContain('<b>')
    expect(svg.match(/<path d="M0/g)).toHaveLength(2)
  })
})

describe('Markdown', () => {
  it('wählt aus aufeinanderfolgenden Codeblöcken die Programmiersprache', () => {
    const source = 'Text mit `code`\n\n```python\nprint(1)\n```\n\n```java\nSystem.out.println(1);\n```\n\n- eins\n- **zwei**'
    const blocks = markdownBlocks(source, 'java')
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'code', 'list'])
    expect(blocks[1]).toMatchObject({ code: 'System.out.println(1);' })
    expect(blocks[2]).toMatchObject({ items: [[{ kind: 'text', value: 'eins' }], [{ kind: 'bold', value: 'zwei' }]] })
  })
})

describe('Aufbau aus allen Lernmodulen', () => {
  for (const module of LEARN_MODULES) {
    for (const lang of ['de', 'en'] as const) {
      it(`${module.id} (${lang})`, () => {
        const sheet = buildWorksheet(module, DEFAULT_WORKSHEET, ctx(lang, module))
        const headings = flat(sheet.blocks).filter(b => b.type === 'heading')
        expect(headings).toHaveLength(module.tasks.length)
        expect(flat(sheet.blocks).filter(b => b.type === 'lines')).toHaveLength(module.tasks.length)
        // Jede Aufgabe bleibt als Ganzes zusammen
        expect(sheet.blocks.filter(b => b.type === 'keep')).toHaveLength(module.tasks.length)

        const solutions = buildWorksheet(module, { ...DEFAULT_WORKSHEET, kind: 'solutions' }, ctx(lang, module))
        expect(flat(solutions.blocks).some(b => b.type === 'lines')).toBe(false)
        expect(flat(solutions.blocks).filter(b => b.type === 'box' && b.tone === 'solution')).toHaveLength(module.tasks.length)

        const deck = buildPresentation(module, DEFAULT_SLIDES, ctx(lang, module))
        // Titel, Lernziele, Einführung, je Aufgabe eine Folie, Abschnitt + Lösungen, Zusammenfassung
        expect(deck.slides.filter(s => s.kicker === `taskKicker(${1})`)).toHaveLength(1)
        expect(deck.slides.length).toBeGreaterThanOrEqual(3 + 2 * module.tasks.length)

        expect(renderDocumentHtml(sheet, fakeImages(sheet))).toContain(module.title[lang].replace(/&/g, '&amp;').replace(/'/g, '&#39;'))
        expect(renderSlidesHtml(deck, fakeImages(deck))).toContain('class="slide title"')
      })
    }
  }

  it('Programmiersprachen: Startvorlage um die Schreiblinien, Lösung in der gewählten Sprache', () => {
    const module = findModule('code-start')!
    const sheet = buildWorksheet(module, DEFAULT_WORKSHEET, ctx('de', module))
    const lines = flat(sheet.blocks).find(b => b.type === 'lines')
    expect(lines).toMatchObject({ code: true, indent: 8 })
    expect(lines && 'before' in lines && lines.before).toContain('public class Programm')
    const solutions = buildWorksheet(module, { ...DEFAULT_WORKSHEET, kind: 'solutions' }, ctx('de', module))
    expect(JSON.stringify(solutions.blocks)).toContain('klonk.turnLeft();')
  })

  it('maskiert HTML aus eigenen Modulen', () => {
    const module = { ...findModule('paths')!, title: { de: '<script>alert(1)</script>', en: 'x' } }
    const html = renderDocumentHtml(buildWorksheet(module, DEFAULT_WORKSHEET, ctx('de', module)), {})
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('Bildzeilen', () => {
  const module = findModule('building')!
  const task = module.tasks[0]!
  const worlds = [task.worlds[0]!, task.worlds[0]!, task.worlds[0]!, task.worlds[0]!]
  const several = { ...task, worlds }
  const goals: MaterialContext['expected'] = { [task.id]: worlds.map(world => ({ world, output: [] })) as never }

  it('je Startwelt eine Zeile (Start + Ziel), einzelne Bilder bis zu drei je Zeile', () => {
    const both = taskImageRows(several, { ...ctx('de', module), expected: goals }, { pictures: 'both', goal: true, allWorlds: true })
    expect(both.map(row => row.map(image => image.kind))).toEqual([['world', 'plan', 'plan'], ['world', 'plan', 'plan'], ['world', 'plan', 'plan']])
    const single = taskImageRows(several, ctx('de', module), { pictures: 'plan', goal: false, allWorlds: true })
    expect(single.map(row => row.length)).toEqual([2, 2])
    expect(taskImages(several, ctx('de', module), { pictures: 'both', goal: false, allWorlds: true, limit: 3 })).toHaveLength(3)
  })

  it('HTML: Breite je Bild nach Seitenverhältnis', () => {
    const sheet = buildWorksheet(module, { ...DEFAULT_WORKSHEET, tasks: [task.id], goal: false }, ctx('de', module))
    const images = fakeImages(sheet)
    for (const image of collectImages(sheet)) images[image.id] = image.kind === 'plan' ? { src: PNG, png: PNG, width: 300, height: 300 } : { src: PNG, png: PNG, width: 600, height: 300 }
    const html = renderDocumentHtml(sheet, images)
    expect(html).toMatch(/<div class="row"><figure class="world" style="--ar: 2\.0000">.*?<figure class="plan" style="--ar: 1\.0000">/)
  })
})

describe('Dateien', () => {
  it('DOCX enthält Titel, Aufgaben und Bilder', async () => {
    const module = findModule('building')!
    const sheet = buildWorksheet(module, DEFAULT_WORKSHEET, ctx('de', module))
    const files = unzipSync(await renderDocxBytes(sheet, fakeImages(sheet)))
    const xml = strFromU8(files['word/document.xml']!)
    expect(xml).toContain(module.title.de)
    for (const task of module.tasks) expect(xml).toContain(task.title.de)
    expect(Object.keys(files).some(name => name.startsWith('word/media/'))).toBe(true)
    expect(strFromU8(files['word/header1.xml'] ?? files['word/header2.xml'] ?? new Uint8Array())).toContain('Testschule')
  })

  it('DOCX für SQL mit Tabellen', async () => {
    const module = findModule('sql-join')!
    const context: MaterialContext = { ...ctx('de', module), tables: { [module.tasks[0]!.id]: [{ columns: ['id', 'name'], rows: [['1', 'Ada']], caption: 'personen' }] } }
    const sheet = buildWorksheet(module, DEFAULT_WORKSHEET, context)
    const xml = strFromU8(unzipSync(await renderDocxBytes(sheet, fakeImages(sheet)))['word/document.xml']!)
    expect(xml).toContain('Ada')
  })

  it('PPTX mit einer Folie je Eintrag und Sprechernotizen', async () => {
    const module = findModule('repeat')!
    const deck = buildPresentation(module, DEFAULT_SLIDES, ctx('de', module))
    const files = unzipSync(await renderPptxBytes(deck, fakeImages(deck)))
    const slides = Object.keys(files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    expect(slides).toHaveLength(deck.slides.length)
    expect(strFromU8(files['ppt/slides/slide1.xml']!)).toContain(module.title.de)
    const notes = Object.keys(files).filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).map(name => strFromU8(files[name]!)).join('')
    expect(notes).toContain('solution')
  })
})
