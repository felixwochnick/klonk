import { imageRatio, type ImageMap, type Line, type MaterialBlock, type MaterialDocument, type MaterialImage, type Presentation, type Slide } from './model'

// HTML für Vorschau und Druck (PDF über den Druckdialog des Browsers). Alle Texte werden maskiert – eigene Module
// stammen von Lehrkräften und dürfen kein HTML einschleusen. Die App zeigt das Ergebnis in einem Sandbox-iframe.

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
/** Text als CSS-Zeichenkette (für `content:` in Seitenrändern) */
const cssString = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/</g, '\\3c ').replace(/>/g, '\\3e ').replace(/\n/g, ' ')}"`

/** „Seite {page} von {pages}“ ⇒ CSS-`content` mit Seitenzählern */
function pageContent(label: string) {
  return label.split(/(\{page\}|\{pages\})/).filter(Boolean).map((part) => {
    if (part === '{page}') return 'counter(page)'
    if (part === '{pages}') return 'counter(pages)'
    return cssString(part)
  }).join(' ')
}

function line(parts: Line) {
  return parts.map((part) => {
    if (part.kind === 'code') return `<code>${escape(part.value)}</code>`
    if (part.kind === 'bold') return `<strong>${escape(part.value)}</strong>`
    return escape(part.value)
  }).join('')
}

/** Bild mit Bildunterschrift; `--ar` = Seitenverhältnis (Rahmen und Breite in der Bildzeile) */
function figure(image: MaterialImage, images: ImageMap) {
  const resolved = images[image.id]
  const img = resolved
    ? `<img src="${escape(resolved.src)}" alt="${escape(image.caption ?? '')}" data-kind="${image.kind}">`
    : `<div class="missing" data-kind="${image.kind}"></div>`
  return `<figure class="${image.kind}" style="--ar: ${imageRatio(image, images).toFixed(4)}">${img}${image.caption ? `<figcaption>${escape(image.caption)}</figcaption>` : ''}</figure>`
}

function table(block: Extract<MaterialBlock, { type: 'table' }>) {
  const { columns, rows, caption, more } = block.table
  const head = `<tr>${columns.map(c => `<th>${escape(c)}</th>`).join('')}</tr>`
  const body = rows.map(row => `<tr>${row.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')
  const rest = more ? `<tr class="more"><td colspan="${columns.length}">… +${more}</td></tr>` : ''
  return `<div class="table">${caption ? `<p class="caption">${escape(caption)}</p>` : ''}<table><thead>${head}</thead><tbody>${body}${rest}</tbody></table></div>`
}

function lines(block: Extract<MaterialBlock, { type: 'lines' }>) {
  const given = (code: string) => code.split('\n').map(text => `<div class="given">${escape(text) || '&nbsp;'}</div>`).join('')
  const pad = block.indent ? ` style="padding-left: ${block.indent}ch"` : ''
  const empty = Array.from({ length: block.count }, (_, i) => `<div class="write"${pad}><span class="no">${i + 1}</span></div>`).join('')
  const label = block.label ? `<p class="answer-label"><strong>${escape(block.label)}</strong></p>` : ''
  return `<div class="answer">${label}<div class="lines${block.code ? ' code' : ''}${block.fillable ? ' fill' : ''}">${block.before ? given(block.before) : ''}${empty}${block.after ? given(block.after) : ''}</div></div>`
}

export function renderBlocks(blocks: MaterialBlock[], images: ImageMap): string {
  return blocks.map((block) => {
    switch (block.type) {
      case 'heading': return `<h${block.level}>${escape(block.text)}</h${block.level}>`
      case 'paragraph': return `<p${block.muted ? ' class="muted"' : ''}>${block.lines.map(line).join('<br>')}</p>`
      case 'list': return `<ul${block.check ? ' class="check"' : ''}>${block.items.map(item => `<li>${line(item)}</li>`).join('')}</ul>`
      case 'code': return `<pre>${escape(block.code)}</pre>`
      case 'images': return `<div class="images"${block.maxHeight ? ` style="--max-h: ${block.maxHeight}mm"` : ''}>${block.rows.map(row => `<div class="row">${row.map(image => figure(image, images)).join('')}</div>`).join('')}</div>${block.note ? `<p class="note">${escape(block.note)}</p>` : ''}`
      case 'table': return table(block)
      case 'lines': return lines(block)
      case 'box': return `<aside class="box ${block.tone}"><p class="box-title">${escape(block.title)}</p>${renderBlocks(block.blocks, images)}</aside>`
      case 'keep': return `<section class="keep">${renderBlocks(block.blocks, images)}</section>`
      case 'fields': return `<div class="fields">${block.labels.map(label => `<div><span>${escape(label)}:</span><i></i></div>`).join('')}</div>`
      case 'pageBreak': return '<div class="page-break"></div>'
    }
    return ''
  }).join('\n')
}

const BASE_CSS = `
:root { --red: #c91a09; --blue: #0055bf; --yellow: #f2cd37; --green: #237841; --ink: #111827; --muted: #6b7280; --line: #d1d5db; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: var(--ink); font-family: Arial, 'Liberation Sans', Helvetica, sans-serif; }
code, pre, .lines { font-family: 'Courier New', 'Liberation Mono', 'DejaVu Sans Mono', monospace; }
code { background: #f3f4f6; border-radius: 3px; padding: 0 3px; font-size: 0.92em; }
pre { background: #f3f4f6; border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; white-space: pre-wrap; margin: 0.5em 0; break-inside: avoid; }
strong { font-weight: 700; }
`

const SHEET_CSS = `
@page { size: A4; margin: 15mm 16mm 16mm; }
body { background: #e5e7eb; font-size: 10.5pt; line-height: 1.45; }
.paper { width: 210mm; min-height: 297mm; margin: 24px auto; background: #fff; padding: 15mm 16mm 16mm; box-shadow: 0 4px 24px rgb(0 0 0 / 0.12); }
.sheet-head { display: flex; justify-content: space-between; gap: 12px; font-size: 8.5pt; color: var(--muted); border-bottom: 1px solid var(--line); padding-bottom: 4px; margin-bottom: 10px; }
.kicker { color: var(--red); font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }
h1 { font-size: 20pt; margin: 2px 0 10px; line-height: 1.15; }
h2 { font-size: 14pt; margin: 18px 0 6px; padding-top: 6px; border-top: 2px solid var(--red); break-after: avoid; }
h3 { font-size: 12pt; margin: 12px 0 4px; break-after: avoid; }
h4 { font-size: 11pt; margin: 10px 0 4px; break-after: avoid; }
p { margin: 0.4em 0; }
p.muted, p.note { color: var(--muted); font-size: 9pt; }
p.note { margin-top: 2px; }
ul { margin: 0.3em 0; padding-left: 1.4em; }
ul.check { list-style: none; padding-left: 0.2em; }
ul.check li::before { content: '☐'; margin-right: 0.5em; }
.fields { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 14px; margin: 4px 0 12px; }
.fields div { display: flex; align-items: flex-end; gap: 6px; }
.fields i { flex: 1; border-bottom: 1px solid var(--ink); height: 1.3em; }
.box { border: 1px solid var(--line); border-left: 4px solid var(--blue); background: #f8fafc; border-radius: 6px; padding: 6px 12px; margin: 10px 0; }
.box.hint { border-left-color: var(--yellow); background: #fffbeb; }
.box.solution { border-left-color: var(--green); background: #f0fdf4; break-inside: avoid; }
.box.teacher { border-left-color: var(--red); background: #fef2f2; }
.box-title { font-weight: 700; margin: 2px 0 4px; }
/* Bildzeile im Blocksatz: Breite je Bild ∝ Seitenverhältnis ⇒ alle Rahmen einer Zeile gleich hoch und zusammen 100 % breit.
   Wird die Zeile zu hoch, kappt max-height alle Rahmen gleich – sie bleiben voll breit, das Bild steht mittig darin. */
.images { margin: 8px 0 2px; }
.images .row { display: flex; gap: 10px; break-inside: avoid; }
.images .row + .row { margin-top: 8px; }
.images figure { margin: 0; text-align: center; flex: var(--ar) 1 0%; min-width: 0; }
.images img, .images .missing { display: block; width: 100%; aspect-ratio: var(--ar); max-height: var(--max-h, 62mm); padding: 3px; object-fit: contain; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.images .missing { background: repeating-linear-gradient(45deg, #f3f4f6 0 8px, #fff 8px 16px); }
figcaption { font-size: 8.5pt; color: var(--muted); margin-top: 2px; }
.table { margin: 8px 0; break-inside: avoid; }
.table .caption { font-weight: 700; font-size: 9.5pt; margin: 0 0 3px; }
table { border-collapse: collapse; font-size: 9pt; }
th, td { border: 1px solid #9ca3af; padding: 2px 7px; text-align: left; }
th { background: #e5e7eb; }
tr.more td { color: var(--muted); font-style: italic; }
.answer { break-inside: avoid; }
.answer-label { margin: 8px 0 2px; }
.lines { border: 1px solid #9ca3af; border-radius: 6px; padding: 4px 10px 6px; margin: 4px 0 10px; break-inside: avoid; font-size: 10pt; }
.lines .given { color: #374151; white-space: pre; line-height: 1.5; }
.lines .write { position: relative; height: 9mm; border-bottom: 1px dotted #9ca3af; }
/* Digital ausfüllbar: ein Eingabefeld statt Linien (wie im DOCX bzw. in der PDF aus dem DOCX) */
.lines.fill .write { border-bottom-color: transparent; }
.lines.fill .no { display: none; }
.lines .no { position: absolute; left: -2px; bottom: 1px; font-size: 7pt; color: #9ca3af; font-family: Arial, sans-serif; }
/* Aufgabe nicht über zwei Seiten verteilen (ist sie länger als eine Seite, bricht der Browser trotzdem um) */
.keep { break-inside: avoid; }
.page-break { break-after: page; }
@media print {
  body { background: none; }
  .paper { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
}
`

function document(lang: string, title: string, css: string, body: string) {
  return `<!doctype html><html lang="${escape(lang)}"><head><meta charset="utf-8"><title>${escape(title)}</title><style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`
}

/** Arbeitsblatt bzw. Lösungsblatt als HTML-Seite (A4) */
export function renderDocumentHtml(doc: MaterialDocument, images: ImageMap): string {
  const module = [doc.code, doc.title].filter(Boolean).join(' · ')
  const margins = `@page { @bottom-left { content: ${cssString(doc.footer)}; font: 8pt Arial, sans-serif; color: #6b7280; } @bottom-right { content: ${pageContent(doc.pageLabel)}; font: 8pt Arial, sans-serif; color: #6b7280; } }`
  const body = `<main class="paper" data-kind="${doc.kind}">
<header class="sheet-head"><span>${escape(doc.school ?? '')}</span><span>${escape(module)}</span></header>
<div class="kicker">${escape(doc.label)}</div>
<h1>${escape(doc.title)}</h1>
${renderBlocks(doc.blocks, images)}
</main>`
  return document(doc.lang, `${module} – ${doc.label}`, SHEET_CSS + margins, body)
}

const SLIDES_CSS = `
@page { size: 297mm 167.0625mm; margin: 0; }
body { background: #e5e7eb; padding: 16px 0; }
.slide { container-type: inline-size; position: relative; width: min(960px, calc(100% - 32px)); aspect-ratio: 16 / 9; margin: 0 auto 16px; background: #fff; box-shadow: 0 4px 24px rgb(0 0 0 / 0.12); overflow: hidden; display: flex; flex-direction: column; padding: 4.2cqw 5cqw 3.4cqw; font-size: 2.05cqw; line-height: 1.4; }
.slide .kicker { color: var(--red); font-weight: 700; font-size: 1.5cqw; text-transform: uppercase; letter-spacing: 0.08em; }
.slide h2 { margin: 0.4cqw 0 0; font-size: 3.4cqw; line-height: 1.15; }
.slide .bar { width: 6cqw; height: 0.45cqw; background: var(--red); border-radius: 1cqw; margin: 1.2cqw 0 1.8cqw; }
.slide .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr; gap: 3cqw; }
.slide .body.with-images { grid-template-columns: 1.15fr 1fr; }
.slide .text { min-height: 0; overflow: hidden; }
.slide p { margin: 0 0 1cqw; }
.slide p.muted { color: var(--muted); font-size: 1.6cqw; }
.slide ul { margin: 0 0 1cqw; padding-left: 2.6cqw; }
.slide ul li { margin-bottom: 0.6cqw; }
.slide ul.check { list-style: none; padding-left: 0; }
.slide ul.check li::before { content: '✓'; color: var(--green); font-weight: 700; margin-right: 1cqw; }
.slide pre { font-size: 1.55cqw; line-height: 1.35; padding: 1cqw 1.4cqw; border-radius: 0.8cqw; }
.slide pre.small { font-size: 1.2cqw; }
.slide .table .caption { font-weight: 700; margin: 0 0 0.6cqw; font-size: 1.6cqw; }
.slide table { border-collapse: collapse; font-size: 1.45cqw; }
.slide th, .slide td { border: 1px solid #9ca3af; padding: 0.3cqw 1cqw; text-align: left; }
.slide th { background: #e5e7eb; }
.slide tr.more td { color: var(--muted); font-style: italic; }
.slide .pictures { display: flex; flex-direction: column; gap: 1.4cqw; min-height: 0; justify-content: center; }
.slide .pictures figure { margin: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; }
.slide .pictures img, .slide .pictures .missing { flex: 1; min-height: 0; max-width: 100%; aspect-ratio: var(--ar); object-fit: contain; border-radius: 1cqw; }
.slide .pictures .missing { width: 100%; background: repeating-linear-gradient(45deg, #f3f4f6 0 8px, #fff 8px 16px); }
.slide figcaption { font-size: 1.4cqw; color: var(--muted); margin-top: 0.4cqw; }
.slide footer { display: flex; justify-content: space-between; font-size: 1.2cqw; color: var(--muted); margin-top: 1.6cqw; }
.slide.title { flex-direction: row; padding: 0; }
.slide.title .panel { width: 38%; background: var(--red); color: #fff; display: flex; flex-direction: column; justify-content: flex-end; padding: 5cqw; }
.slide.title .code { font-size: 11cqw; font-weight: 800; line-height: 1; }
.slide.title .panel .kicker { color: #fff; opacity: 0.85; margin-top: 1.4cqw; }
.slide.title .main { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 5cqw; }
.slide.title h1 { font-size: 4.6cqw; line-height: 1.1; margin: 0 0 2cqw; }
.slide.title .subtitle { font-size: 2.2cqw; color: #374151; }
.slide.title .school { font-size: 1.5cqw; color: var(--muted); margin-top: 3cqw; }
.slide.section { background: var(--red); color: #fff; justify-content: center; align-items: flex-start; padding: 6cqw; }
.slide.section h2 { font-size: 5cqw; }
.slide.section .bar { background: #fff; }
@media print {
  body { background: none; padding: 0; }
  .slide { width: 297mm; margin: 0; box-shadow: none; break-after: page; }
}
`

function slideHtml(slide: Slide, index: number, deck: Presentation, images: ImageMap) {
  if (slide.layout === 'title') {
    return `<section class="slide title" data-slide="${index + 1}"><div class="panel">${deck.code ? `<div class="code">${escape(deck.code)}</div>` : ''}<div class="kicker">${escape(slide.kicker ?? '')}</div></div>
<div class="main"><h1>${escape(slide.title)}</h1>${slide.subtitle ? `<div class="subtitle">${escape(slide.subtitle)}</div>` : ''}${deck.school ? `<div class="school">${escape(deck.school)}</div>` : ''}</div></section>`
  }
  if (slide.layout === 'section') {
    return `<section class="slide section" data-slide="${index + 1}"><div class="bar"></div><h2>${escape(slide.title)}</h2></section>`
  }
  const longCode = slide.blocks.some(b => b.type === 'code' && b.code.split('\n').length > 14)
  const text = renderBlocks(slide.blocks, images).replace(/<pre>/g, longCode ? '<pre class="small">' : '<pre>')
  const pictures = slide.images.length ? `<div class="pictures">${slide.images.map(image => figure(image, images)).join('')}</div>` : ''
  return `<section class="slide content" data-slide="${index + 1}">${slide.kicker ? `<div class="kicker">${escape(slide.kicker)}</div>` : ''}<h2>${escape(slide.title)}</h2><div class="bar"></div>
<div class="body${pictures ? ' with-images' : ''}"><div class="text">${text}</div>${pictures}</div>
<footer><span>${escape(deck.footer)}</span><span>${index + 1}</span></footer></section>`
}

/** Präsentation als HTML-Seite (eine Folie je Druckseite, 16:9) */
export function renderSlidesHtml(deck: Presentation, images: ImageMap): string {
  const module = [deck.code, deck.title].filter(Boolean).join(' · ')
  return document(deck.lang, `${module} – ${deck.label}`, SLIDES_CSS, deck.slides.map((slide, i) => slideHtml(slide, i, deck, images)).join('\n'))
}
