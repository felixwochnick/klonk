<script setup lang="ts">
import { isCodeLanguage } from '@klonk/learn'

// Texte der Lernmodule: kleines Markdown (Absätze, Listen, `code`, **fett**, Codeblöcke) ohne v-html.
// Folgen Codeblöcke in mehreren Programmiersprachen direkt aufeinander, zeigt `language` nur den passenden
// (TypeScript ohne eigenen Block: JavaScript; ohne Sprache: alle).
const props = defineProps<{ text: string, language?: string | null }>()

type Part = ReturnType<typeof parseAiMarkdown>[number]
type Line = Extract<Part, { type: 'text' }>['lines'][number]
type Section = { type: 'code', code: string } | { type: 'paragraph', lines: Line[] } | { type: 'list', items: Line[] }

// Leerzeilen trennen Absätze, „- “ beginnt einen Listenpunkt
function visibleBlocks() {
  const blocks = parseAiMarkdown(props.text)
  const language = props.language
  if (!language || !isCodeLanguage(language)) return blocks
  const wanted = (lang: string) => lang === language || (language === 'typescript' && lang === 'javascript')
  return blocks.filter((block, i) => {
    if (block.type !== 'code' || !isCodeLanguage(block.lang)) return true
    // Gruppe direkt aufeinanderfolgender Codeblöcke in Programmiersprachen
    let from = i
    while (from > 0 && blocks[from - 1]!.type === 'code' && isCodeLanguage((blocks[from - 1] as { lang: string }).lang)) from--
    let to = i
    while (to + 1 < blocks.length && blocks[to + 1]!.type === 'code' && isCodeLanguage((blocks[to + 1] as { lang: string }).lang)) to++
    const group = blocks.slice(from, to + 1) as { lang: string }[]
    const exact = group.findIndex(b => b.lang === language)
    const pick = exact >= 0 ? exact : group.findIndex(b => wanted(b.lang))
    return i - from === (pick >= 0 ? pick : 0)
  })
}

const sections = computed(() => {
  const result: Section[] = []
  for (const block of visibleBlocks()) {
    if (block.type === 'code') {
      result.push({ type: 'code', code: block.code })
      continue
    }
    let current: Section | null = null
    for (const line of block.lines) {
      const first = line[0]
      if (!first || (line.length === 1 && first.kind === 'text' && !first.value.trim())) {
        current = null
        continue
      }
      const bullet = first.kind === 'text' && first.value.startsWith('- ')
      if (bullet) {
        const item = [{ ...first, value: first.value.slice(2) }, ...line.slice(1)]
        if (current?.type !== 'list') result.push(current = { type: 'list', items: [] })
        current.items.push(item)
      }
      else {
        if (current?.type !== 'paragraph') result.push(current = { type: 'paragraph', lines: [] })
        current.lines.push(line)
      }
    }
  }
  return result
})
</script>

<template>
  <div class="space-y-3 text-sm leading-relaxed">
    <template
      v-for="(section, s) in sections"
      :key="s"
    >
      <pre
        v-if="section.type === 'code'"
        class="overflow-x-auto rounded-md border border-(--ui-border) bg-(--ui-bg-muted) p-3 font-mono text-xs"
      >{{ section.code }}</pre>
      <ul
        v-else-if="section.type === 'list'"
        class="list-disc space-y-1 ps-5"
      >
        <li
          v-for="(item, i) in section.items"
          :key="i"
        >
          <LearnInline :parts="item" />
        </li>
      </ul>
      <p v-else>
        <template
          v-for="(line, l) in section.lines"
          :key="l"
        >
          <br v-if="l">
          <LearnInline :parts="line" />
        </template>
      </p>
    </template>
  </div>
</template>
