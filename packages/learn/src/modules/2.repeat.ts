import { map } from '../map'
import type { LearnModule } from '../types'

export const repeat: LearnModule = {
  id: 'repeat',
  title: { de: 'Wiederholung mit fester Anzahl', en: 'Repetition with a fixed count' },
  summary: {
    de: 'Gleiche Anweisungen nicht abschreiben, sondern wiederholen lassen.',
    en: 'Instead of copying the same instructions, let them repeat.',
  },
  objectives: [
    { de: 'Wiederkehrende Anweisungsfolgen erkennen', en: 'Recognize recurring sequences of instructions' },
    { de: 'Die Zählschleife `wiederhole … mal` verwenden', en: 'Use the counting loop `repeat … times`' },
    { de: 'Schleifen ineinander schachteln', en: 'Nest loops' },
  ],
  intro: {
    de: `Wenn sich Anweisungen wiederholen, musst du sie nicht abschreiben. \`wiederhole … mal\` führt alles bis \`ende\` so oft aus, wie du angibst:

\`\`\`klonk
wiederhole 4 mal
  schritt
  hinlegen
ende
\`\`\`

Die eingerückten Zeilen bilden den **Schleifenrumpf**. Auch in einem Schleifenrumpf darf wieder eine Schleife stehen – dann wird die innere bei jedem Durchlauf der äußeren komplett ausgeführt.`,
    en: `If instructions repeat, you do not have to copy them. \`repeat … times\` carries out everything up to \`end\` as often as you specify:

\`\`\`klonk
repeat 4 times
  step
  placeBrick
end
\`\`\`

The indented lines form the **loop body**. A loop body may contain another loop – then the inner loop runs completely in each pass of the outer one.`,
  },
  teacher: {
    de: `**Zeitbedarf:** etwa eine Doppelstunde.

**Typische Schwierigkeiten:** Was gehört in den Schleifenrumpf, was davor oder danach? Ein guter Zugang ist, zuerst die Anweisungsfolge für einen Durchlauf aufzuschreiben (z. B. in Aufgabe 1: drehen, hinlegen, zurückdrehen, Schritt) und sie dann in die Schleife zu setzen. Häufig fehlt die letzte Drehung, sodass die Figur nach dem ersten Durchlauf falsch steht.

**Differenzierung:** Aufgabe 3 (geschachtelte Schleifen) ist anspruchsvoll und kann als Zusatzaufgabe dienen. Über den Einzelschritt lässt sich gut zeigen, wie oft die innere Schleife läuft.

**Leistungsfeststellung:** Geeignet ist das Umschreiben einer langen Anweisungsfolge in eine möglichst kurze Schleifenlösung oder ein Struktogramm zu einer gegebenen Lösung.`,
    en: `**Time needed:** about one double lesson.

**Typical difficulties:** What belongs in the loop body, what before or after it? A good approach is to first write down the sequence for one pass (e.g. in task 1: turn, place, turn back, step) and then put it into the loop. Often the last turn is missing, so the character faces the wrong way after the first pass.

**Differentiation:** Task 3 (nested loops) is demanding and can serve as an extra task. Step mode shows well how often the inner loop runs.

**Assessment:** Suitable are rewriting a long sequence into the shortest possible loop solution, or a structure chart for a given solution.`,
  },
  tasks: [
    {
      id: 'row-of-bricks',
      title: { de: 'Lange Mauer', en: 'Long wall' },
      text: {
        de: 'Baue links neben Klonks Weg eine Mauer aus acht Ziegeln – auf die Felder gegenüber den gelben Marken. Nutze eine Schleife.',
        en: 'Build a wall of eight bricks to the left of Klonk\'s path – on the cells next to the yellow marks. Use a loop.',
      },
      hints: [
        { de: 'Schreib zuerst auf, was Klonk für **einen** Ziegel tun muss. Diese Anweisungen kommen in die Schleife.', en: 'First write down what Klonk has to do for **one** brick. These instructions go into the loop.' },
      ],
      worlds: [map(`
        . . . . . . . . . .
        >y y y y y y y y . .
      `)],
      solution: {
        de: `wiederhole 8 mal
  linksDrehen
  hinlegen
  rechtsDrehen
  schritt
ende`,
        en: `repeat 8 times
  turnLeft
  placeBrick
  turnRight
  step
end`,
      },
      check: { cells: true },
      requires: ['repeatTimes'],
    },
    {
      id: 'square',
      title: { de: 'Eine Runde auf dem Platz', en: 'A lap of the square' },
      text: {
        de: 'Klonk läuft einmal um das Quadrat herum und markiert dabei jede der vier Ecken. Am Ende steht Klonk wieder am Start und schaut in dieselbe Richtung wie am Anfang.',
        en: 'Klonk walks once around the square and marks each of the four corners. In the end Klonk stands at the start again, facing the same direction as at the beginning.',
      },
      hints: [
        { de: 'Eine Seite des Quadrats ist drei Schritte lang. Was wiederholt sich viermal?', en: 'One side of the square is three steps long. What repeats four times?' },
      ],
      worlds: [map(`
        . . . . . .
        . > . . . .
        . . # # . .
        . . # # . .
        . . . . . .
        . . . . . .
      `)],
      solution: {
        de: `wiederhole 4 mal
  markieren
  schritt(3)
  rechtsDrehen
ende`,
        en: `repeat 4 times
  setMark
  step(3)
  turnRight
end`,
      },
      check: { position: true, direction: true, cells: true },
      requires: ['repeatTimes'],
    },
    {
      id: 'towers',
      title: { de: 'Drei Türme', en: 'Three towers' },
      text: {
        de: 'Baue auf jedes Feld mit einer gelben Marke einen Turm aus vier Ziegeln. Klonk kann nicht über einen Turm steigen – er muss außen herum laufen (über die obere Reihe).',
        en: 'Build a tower of four bricks on each cell with a yellow mark. Klonk cannot climb over a tower – it has to walk around it (via the top row).',
      },
      hints: [
        { de: 'Ein Turm ist selbst eine Schleife: viermal `hinlegen`.', en: 'A tower is a loop itself: `placeBrick` four times.' },
        { de: 'Nach dem Turm muss Klonk wieder genau so stehen wie vor dem ersten Turm – nur zwei Felder weiter rechts.', en: 'After the tower, Klonk must stand exactly as before the first tower – just two cells further to the right.' },
      ],
      worlds: [map(`
        . . . . . . . . .
        > y . y . y . . .
      `)],
      solution: {
        de: `wiederhole 3 mal
  wiederhole 4 mal
    hinlegen
  ende
  linksDrehen
  schritt
  rechtsDrehen
  schritt(2)
  rechtsDrehen
  schritt
  linksDrehen
ende`,
        en: `repeat 3 times
  repeat 4 times
    placeBrick
  end
  turnLeft
  step
  turnRight
  step(2)
  turnRight
  step
  turnLeft
end`,
      },
      check: { cells: true },
      requires: ['repeatTimes'],
    },
  ],
}
