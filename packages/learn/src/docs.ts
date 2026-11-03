import type { Construct, LearnModule, TaskCheck } from './types'

type Lang = 'de' | 'en'

const TEXT = {
  de: {
    generated: 'Diese Seite wird aus packages/learn erzeugt: UPDATE_LEARN_DOCS=1 pnpm --filter @klonk/learn test',
    module: 'Modul',
    open: (id: string) => `In der App unter **Lernen** (\`/learn/${id}\`). Die Aufgaben lassen sich mit Blöcken oder in Klonk-Script lösen und werden automatisch geprüft.`,
    objectives: 'Lernziele',
    intro: 'Einführung für die Lernenden',
    introNote: 'So erscheint die Einführung in der App:',
    tasks: 'Aufgaben',
    checked: 'Geprüft wird',
    worlds: (n: number) => (n > 1 ? `in ${n} Startwelten` : 'in einer Startwelt'),
    requires: 'Verlangt',
    hints: 'Tipps in der App',
    solution: 'Musterlösung',
    teacher: 'Hinweise für Lehrkräfte',
    checks: { position: 'Endposition der Figur', direction: 'Blickrichtung', cells: 'Ziegel und Marken aller Felder', output: 'Zahlen in der Ausgabe' },
    constructs: { repeatTimes: 'Zählschleife (`wiederhole … mal`)', repeatWhile: 'bedingte Schleife (`wiederhole solange`/`bis`)', if: 'Verzweigung (`wenn … dann`)', procedure: 'eigene Anweisung (`anweisung … ende`)', variable: 'Variable (`var`)' },
  },
  en: {
    generated: 'This page is generated from packages/learn: UPDATE_LEARN_DOCS=1 pnpm --filter @klonk/learn test',
    module: 'Module',
    open: (id: string) => `In the app under **Learn** (\`/learn/${id}\`). The tasks can be solved with blocks or in Klonk-Script and are checked automatically.`,
    objectives: 'Learning objectives',
    intro: 'Introduction for students',
    introNote: 'This is how the introduction appears in the app:',
    tasks: 'Tasks',
    checked: 'Checked',
    worlds: (n: number) => (n > 1 ? `in ${n} start worlds` : 'in one start world'),
    requires: 'Requires',
    hints: 'Hints in the app',
    solution: 'Sample solution',
    teacher: 'Notes for teachers',
    checks: { position: 'final position of the character', direction: 'direction it faces', cells: 'bricks and marks of all cells', output: 'numbers in the output' },
    constructs: { repeatTimes: 'counting loop (`repeat … times`)', repeatWhile: 'conditional loop (`repeat while`/`until`)', if: 'branch (`if … then`)', procedure: 'own procedure (`procedure … end`)', variable: 'variable (`var`)' },
  },
} satisfies Record<Lang, unknown>

function checks(check: TaskCheck, lang: Lang) {
  const t = TEXT[lang].checks
  return [check.position && t.position, check.direction && t.direction, check.cells && t.cells, check.output && t.output].filter(Boolean).join(', ')
}

/** Markdown-Seite eines Moduls für die Docs (Zielgruppe Lehrkräfte) */
export function moduleDoc(module: LearnModule, index: number, lang: Lang): string {
  const t = TEXT[lang]
  const lines = [
    '---',
    `title: ${JSON.stringify(module.title[lang])}`,
    `description: ${JSON.stringify(module.summary[lang])}`,
    '---',
    '',
    `<!-- ${t.generated} -->`,
    '',
    `**${t.module} ${index + 1}** · ${module.summary[lang]}`,
    '',
    t.open(module.id),
    '',
    `## ${t.objectives}`,
    '',
    ...module.objectives.map(o => `- ${o[lang]}`),
    '',
    `## ${t.intro}`,
    '',
    t.introNote,
    '',
    module.intro[lang],
    '',
    `## ${t.tasks}`,
  ]
  module.tasks.forEach((task, i) => {
    lines.push('', `### ${i + 1}. ${task.title[lang]}`, '', task.text[lang], '')
    lines.push(`- **${t.checked}:** ${checks(task.check, lang)} – ${t.worlds(task.worlds.length)}`)
    if (task.requires?.length) lines.push(`- **${t.requires}:** ${task.requires.map((c: Construct) => t.constructs[c]).join(', ')}`)
    if (task.hints?.length) lines.push(`- **${t.hints}:** ${task.hints.map(h => h[lang]).join(' · ')}`)
    lines.push('', `**${t.solution}**`, '', '```klonk', task.solution[lang], '```')
  })
  lines.push('', `## ${t.teacher}`, '', module.teacher[lang], '')
  return lines.join('\n')
}
