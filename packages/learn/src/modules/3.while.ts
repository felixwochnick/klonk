import { map } from '../map'
import type { LearnModule } from '../types'

export const whileLoop: LearnModule = {
  id: 'while',
  title: { de: 'Bedingte Wiederholung', en: 'Conditional repetition' },
  summary: {
    de: 'Wiederholen, solange eine Bedingung gilt – egal, wie groß die Welt ist.',
    en: 'Repeat as long as a condition holds – no matter how big the world is.',
  },
  objectives: [
    { de: 'Sensoren wie `istWand`, `istZiegel` und `istMarke` als Bedingungen nutzen', en: 'Use sensors such as `isWall`, `isBrick` and `isMark` as conditions' },
    { de: 'Die Schleifen `wiederhole solange …` und `wiederhole bis …` verwenden', en: 'Use the loops `repeat while …` and `repeat until …`' },
    { de: 'Programme schreiben, die in verschiedenen Welten funktionieren', en: 'Write programs that work in different worlds' },
  ],
  intro: {
    de: `Oft weißt du vorher nicht, wie oft etwas wiederholt werden muss – etwa, wie weit es bis zur Wand ist. Dann wiederholst du, **solange** eine Bedingung erfüllt ist (oder **bis** sie erfüllt ist):

\`\`\`klonk
wiederhole solange nicht istWand
  schritt
ende

wiederhole bis istMarke
  schritt
ende
\`\`\`

Bedingungen liefern **Sensoren**: \`istWand\` (vor Klonk ist der Rand oder ein Quader), \`istZiegel\` (vor Klonk liegt ein Ziegel), \`istMarke\` (Klonk steht auf einer Marke). Mit \`nicht\` drehst du eine Bedingung um.

Die Aufgaben in diesem Modul werden in **mehreren Welten** geprüft. Ein Programm, das nur Schritte abzählt, löst deshalb nicht alle.`,
    en: `Often you do not know beforehand how often something has to be repeated – for example how far it is to the wall. Then you repeat **while** a condition holds (or **until** it holds):

\`\`\`klonk
repeat while not isWall
  step
end

repeat until isMark
  step
end
\`\`\`

Conditions come from **sensors**: \`isWall\` (the edge or a block is in front of Klonk), \`isBrick\` (a brick lies in front of Klonk), \`isMark\` (Klonk stands on a mark). \`not\` reverses a condition.

The tasks in this module are checked in **several worlds**. A program that only counts steps therefore does not solve all of them.`,
  },
  teacher: {
    de: `**Zeitbedarf:** etwa eine Doppelstunde.

**Typische Schwierigkeiten:** Die Bedingung wird **vor** jedem Durchlauf geprüft – ist sie schon am Anfang nicht erfüllt, läuft die Schleife gar nicht. Verwechslungen zwischen \`solange\` und \`bis\` lassen sich gut über die Umformung \`bis X\` = \`solange nicht X\` klären. Endlosschleifen (z. B. \`solange nicht istWand\` ohne \`schritt\` im Rumpf) erkennt Klonk beim Prüfen und meldet sie.

**Mehrere Welten:** Jede Aufgabe hat mehrere Startwelten (über die Reiter über der Welt erreichbar). Das macht sichtbar, warum eine Zählschleife hier nicht genügt.

**Differenzierung:** Aufgabe 4 verbindet bedingte Wiederholung mit einer Zählschleife (geschachtelt) und eignet sich als Zusatzaufgabe.`,
    en: `**Time needed:** about one double lesson.

**Typical difficulties:** The condition is checked **before** each pass – if it is false right at the start, the loop does not run at all. Confusion between \`while\` and \`until\` can be cleared up with the rewrite \`until X\` = \`while not X\`. Endless loops (e.g. \`while not isWall\` without \`step\` in the body) are detected by Klonk when checking and reported.

**Several worlds:** Each task has several start worlds (reachable via the tabs above the world). This makes visible why a counting loop is not enough here.

**Differentiation:** Task 4 combines conditional repetition with a counting loop (nested) and is suitable as an extra task.`,
  },
  tasks: [
    {
      id: 'to-the-wall',
      title: { de: 'Bis zur Wand', en: 'To the wall' },
      text: {
        de: 'Klonk läuft bis zur Wand und markiert das letzte Feld. Die Welten sind unterschiedlich lang – dein Programm muss in allen funktionieren.',
        en: 'Klonk walks to the wall and marks the last cell. The worlds differ in length – your program has to work in all of them.',
      },
      hints: [
        { de: 'Wiederhole `schritt`, solange vor Klonk **keine** Wand ist.', en: 'Repeat `step` while there is **no** wall in front of Klonk.' },
      ],
      worlds: [
        map('> . . . .'),
        map('> . . . . . . . .'),
        map('> .'),
      ],
      solution: {
        de: `wiederhole solange nicht istWand
  schritt
ende
markieren`,
        en: `repeat while not isWall
  step
end
setMark`,
      },
      check: { position: true, cells: true },
      requires: ['repeatWhile'],
    },
    {
      id: 'find-the-mark',
      title: { de: 'Die Marke finden', en: 'Find the mark' },
      text: {
        de: 'Irgendwo auf dem Weg liegt eine blaue Marke. Klonk soll darauf stehen bleiben.',
        en: 'Somewhere on the path there is a blue mark. Klonk should stop on it.',
      },
      hints: [
        { de: '`wiederhole bis istMarke` wiederholt so lange, bis Klonk auf einer Marke steht.', en: '`repeat until isMark` repeats until Klonk stands on a mark.' },
      ],
      worlds: [
        map('> . . b . . .'),
        map('> b . . . . .'),
        map('> . . . . . b'),
      ],
      solution: {
        de: `wiederhole bis istMarke
  schritt
ende`,
        en: `repeat until isMark
  step
end`,
      },
      check: { position: true },
      requires: ['repeatWhile'],
    },
    {
      id: 'pick-stack',
      title: { de: 'Stapel abbauen', en: 'Take down the stack' },
      text: {
        de: 'Vor Klonk steht ein Stapel Ziegel. Hebe alle Ziegel auf – wie hoch der Stapel ist, weißt du vorher nicht.',
        en: 'A stack of bricks stands in front of Klonk. Pick up all the bricks – you do not know beforehand how high the stack is.',
      },
      worlds: [
        map('> 3 .'),
        map('> 5 .'),
        map('> 1 .'),
      ],
      solution: {
        de: `wiederhole solange istZiegel
  aufheben
ende`,
        en: `repeat while isBrick
  pickBrick
end`,
      },
      check: { cells: true },
      requires: ['repeatWhile'],
    },
    {
      id: 'lap',
      title: { de: 'Einmal rundherum', en: 'All the way round' },
      text: {
        de: 'Klonk steht in einer Ecke des Raums. Er läuft einmal an allen vier Wänden entlang, markiert dabei jede Ecke und steht am Ende wieder am Start – mit derselben Blickrichtung wie am Anfang. Die Räume sind unterschiedlich groß.',
        en: 'Klonk stands in a corner of the room. It walks once along all four walls, marks each corner and ends up at the start again – facing the same direction as at the beginning. The rooms differ in size.',
      },
      hints: [
        { de: 'Eine Wand entlanglaufen kennst du aus Aufgabe 1. Wie oft muss das passieren?', en: 'You know walking along one wall from task 1. How often does that have to happen?' },
      ],
      worlds: [
        map(`
          > . . .
          . . . .
          . . . .
        `),
        map(`
          > . . . . . .
          . . . . . . .
          . . . . . . .
          . . . . . . .
          . . . . . . .
        `),
        map(`
          > .
          . .
        `),
      ],
      solution: {
        de: `wiederhole 4 mal
  markieren
  wiederhole solange nicht istWand
    schritt
  ende
  rechtsDrehen
ende`,
        en: `repeat 4 times
  setMark
  repeat while not isWall
    step
  end
  turnRight
end`,
      },
      check: { position: true, direction: true, cells: true },
      requires: ['repeatWhile'],
    },
  ],
}
