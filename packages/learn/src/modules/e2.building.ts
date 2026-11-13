import { map } from '../map'
import type { LearnModule } from '../types'

/** Einstieg: Ziegelstapel nach Bauplan (Würfelgebäude, Grundschule 3/4) – alle Welten 3×3 */
export const building: LearnModule = {
  id: 'building',
  track: 'start',
  title: { de: 'Bauen nach Bauplan', en: 'Building from a plan' },
  summary: {
    de: 'Türme, Treppen und Mauern bauen – genau so, wie es der Bauplan zeigt.',
    en: 'Build towers, stairs and walls – exactly as the building plan shows.',
  },
  objectives: [
    { de: 'Einen Bauplan (Draufsicht mit Zahlen) lesen und als Befehlsfolge umsetzen', en: 'Read a building plan (top view with numbers) and turn it into a sequence of commands' },
    { de: 'Mit `hinlegen` und `aufheben` Ziegel stapeln und abbauen', en: 'Stack and remove bricks with `placeBrick` and `pickBrick`' },
    { de: 'Gleiche Befehle mit `wiederhole … mal` kürzer schreiben', en: 'Write identical commands more briefly with `repeat … times`' },
  ],
  intro: {
    de: `Ein **Bauplan** zeigt die Platte von oben. Die Zahl in einem Feld sagt, wie viele Ziegel dort übereinander liegen:

**1 | 2 | 3** – links 1 Ziegel, in der Mitte 2, rechts 3.

\`hinlegen\` legt einen Ziegel auf das Feld **vor** Klonk. Liegt dort schon einer, kommt der neue obendrauf. \`aufheben\` nimmt den obersten Ziegel wieder weg.

\`\`\`klonk
hinlegen
hinlegen
\`\`\`

Wenn du denselben Befehl mehrmals brauchst, geht es kürzer:

\`\`\`klonk
wiederhole 3 mal
  hinlegen
ende
\`\`\``,
    en: `A **building plan** shows the plate from above. The number in a cell tells you how many bricks lie on top of each other there:

**1 | 2 | 3** – 1 brick on the left, 2 in the middle, 3 on the right.

\`placeBrick\` puts a brick on the cell **in front of** Klonk. If there is already one, the new one goes on top. \`pickBrick\` takes the top brick away again.

\`\`\`klonk
placeBrick
placeBrick
\`\`\`

If you need the same command several times, there is a shorter way:

\`\`\`klonk
repeat 3 times
  placeBrick
end
\`\`\``,
  },
  teacher: {
    de: `**Zielgruppe:** Grundschule 3/4 (Mathematik, *Würfelgebäude und Baupläne*), Förderschule (*Abläufe und Algorithmen*), Unterstufe.

**Zeitbedarf:** eine Doppelstunde.

**Ohne Computer:** Die Aufgaben zuerst mit gedruckten oder echten Klemmbausteinen auf der 3 × 3-Platte bauen. Ein gedruckter Ziegel entspricht genau einem Ziegel in Klonk (4 × 4 Noppen). Danach dieselbe Aufgabe am Computer – und die Ansicht von allen Seiten mit dem Bauwerk auf dem Tisch vergleichen.

**Typische Schwierigkeiten:** Klonk legt immer **vor** sich. Um das Nachbarfeld zu bebauen, geht Klonk seitlich weiter (rechts drehen, Schritt, links drehen). Das vorher mit der Figur auf der Platte zeigen.

**Wiederholung:** Aufgabe 3 verlangt \`wiederhole … mal\`. Das ist die erste Schleife; sie wird im Grundkurs (Modul 2) vertieft.`,
    en: `**Target group:** primary school 3/4 (Mathematics, *cube buildings and building plans*), special schools (*processes and algorithms*), lower secondary.

**Time needed:** one double lesson.

**Without a computer:** first build the tasks with printed or real interlocking bricks on the 3 × 3 plate. One printed brick corresponds exactly to one brick in Klonk (4 × 4 studs). Then the same task on the computer – and compare the view from all sides with the building on the table.

**Typical difficulties:** Klonk always builds **in front of** itself. To build on the neighbouring cell, Klonk moves sideways (turn right, step, turn left). Show this beforehand with the character on the plate.

**Repetition:** task 3 requires \`repeat … times\`. This is the first loop; it is deepened in the basic course (module 2).`,
  },
  tasks: [
    {
      id: 'tower',
      title: { de: 'Ein Turm', en: 'A tower' },
      text: {
        de: 'Bauplan: Auf dem Feld vor Klonk steht ein Turm aus **3** Ziegeln. Bau ihn.',
        en: 'Building plan: on the cell in front of Klonk there is a tower of **3** bricks. Build it.',
      },
      worlds: [map(`
        . . .
        . . .
        . ^ .
      `)],
      solution: { de: 'hinlegen\nhinlegen\nhinlegen', en: 'placeBrick\nplaceBrick\nplaceBrick' },
      check: { cells: true },
    },
    {
      id: 'stairs',
      title: { de: 'Treppe', en: 'Stairs' },
      text: {
        de: 'Bauplan für die mittlere Reihe: **1 | 2 | 3**. Bau die Treppe von links nach rechts.',
        en: 'Building plan for the middle row: **1 | 2 | 3**. Build the stairs from left to right.',
      },
      hints: [
        { de: 'Nach jedem Turm: rechts drehen, einen Schritt, links drehen – dann steht Klonk vor dem nächsten Feld.', en: 'After each tower: turn right, one step, turn left – then Klonk stands in front of the next cell.' },
      ],
      worlds: [map(`
        . . .
        . . .
        ^ . .
      `)],
      solution: {
        de: `hinlegen
rechtsDrehen
schritt
linksDrehen
hinlegen
hinlegen
rechtsDrehen
schritt
linksDrehen
hinlegen
hinlegen
hinlegen`,
        en: `placeBrick
turnRight
step
turnLeft
placeBrick
placeBrick
turnRight
step
turnLeft
placeBrick
placeBrick
placeBrick`,
      },
      check: { cells: true },
    },
    {
      id: 'wall',
      title: { de: 'Mauer', en: 'Wall' },
      text: {
        de: 'Bauplan für die mittlere Reihe: **2 | 2 | 2**. Benutze `wiederhole … mal`, damit dein Programm kürzer wird.',
        en: 'Building plan for the middle row: **2 | 2 | 2**. Use `repeat … times` to make your program shorter.',
      },
      hints: [
        { de: 'Bau den ersten Turm. Danach wiederholst du zweimal: zum nächsten Feld gehen, zwei Ziegel hinlegen.', en: 'Build the first tower. Then repeat twice: go to the next cell, place two bricks.' },
      ],
      worlds: [map(`
        . . .
        . . .
        ^ . .
      `)],
      solution: {
        de: `hinlegen
hinlegen
wiederhole 2 mal
  rechtsDrehen
  schritt
  linksDrehen
  hinlegen
  hinlegen
ende`,
        en: `placeBrick
placeBrick
repeat 2 times
  turnRight
  step
  turnLeft
  placeBrick
  placeBrick
end`,
      },
      check: { cells: true },
      requires: ['repeatTimes'],
    },
    {
      id: 'demolition',
      title: { de: 'Abriss', en: 'Demolition' },
      text: {
        de: 'In der mittleren Reihe stehen Türme nach dem Bauplan **2 | 1 | 2**. Räum alle Ziegel weg.',
        en: 'In the middle row there are towers following the plan **2 | 1 | 2**. Clear away all bricks.',
      },
      hints: [
        { de: '`aufheben` nimmt immer nur den obersten Ziegel.', en: '`pickBrick` only ever takes the top brick.' },
      ],
      worlds: [map(`
        . . .
        2 1 2
        ^ . .
      `)],
      solution: {
        de: `aufheben
aufheben
rechtsDrehen
schritt
linksDrehen
aufheben
rechtsDrehen
schritt
linksDrehen
aufheben
aufheben`,
        en: `pickBrick
pickBrick
turnRight
step
turnLeft
pickBrick
turnRight
step
turnLeft
pickBrick
pickBrick`,
      },
      check: { cells: true },
    },
  ],
}
