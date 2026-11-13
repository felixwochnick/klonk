import { map } from '../map'
import type { LearnModule } from '../types'

/** Einstieg: Farbmuster mit Marken und Ziegeln – Welten 3×3, die letzte aus zwei Platten (6×3) */
export const patterns: LearnModule = {
  id: 'patterns',
  track: 'start',
  title: { de: 'Muster und Farben', en: 'Patterns and colours' },
  summary: {
    de: 'Farbige Muster legen, fortsetzen und mit einer Wiederholung kürzer beschreiben.',
    en: 'Lay out coloured patterns, continue them and describe them more briefly with a repetition.',
  },
  objectives: [
    { de: 'Befehlen eine Farbe mitgeben: `markieren(rot)`, `hinlegen(blau)`', en: 'Give commands a colour: `setMark(red)`, `placeBrick(blue)`' },
    { de: 'Ein Muster erkennen und fortsetzen', en: 'Recognise and continue a pattern' },
    { de: 'Den sich wiederholenden Teil eines Musters mit `wiederhole` beschreiben', en: 'Describe the repeating part of a pattern with `repeat`' },
  ],
  intro: {
    de: `Viele Befehle kennen Farben. Die Farbe steht in Klammern hinter dem Befehl:

\`\`\`klonk
markieren(rot)
schritt
markieren(blau)
\`\`\`

Marken gibt es in **gelb, rot, blau** und **grün**. Ziegel gibt es in noch mehr Farben, zum Beispiel \`hinlegen(grün)\` oder \`hinlegen(orange)\`.

Ein **Muster** besteht aus einem Teil, der sich wiederholt: *rot, blau, rot, blau …* – der Teil heißt hier *rot, blau*.`,
    en: `Many commands know colours. The colour goes in brackets after the command:

\`\`\`klonk
setMark(red)
step
setMark(blue)
\`\`\`

Marks come in **yellow, red, blue** and **green**. Bricks come in even more colours, for example \`placeBrick(green)\` or \`placeBrick(orange)\`.

A **pattern** consists of a part that repeats: *red, blue, red, blue …* – here the part is *red, blue*.`,
  },
  teacher: {
    de: `**Zielgruppe:** Grundschule (Mathematik, *Muster untersuchen und erstellen*), Förderschule, Unterstufe.

**Zeitbedarf:** eine Doppelstunde.

**Ohne Computer:** Die Muster zuerst mit farbigen Plättchen (oder gedruckten Marken) auf der 3 × 3-Platte legen. Für Aufgabe 4 zwei Platten zusammenstecken (6 × 3 Felder).

**Typische Schwierigkeiten:** \`markieren\` malt das Feld **unter** Klonk an, \`hinlegen\` baut **vor** Klonk. Bei Aufgabe 3 (Schachbrett) hilft es, den Weg zuerst mit dem Finger auf dem Arbeitsblatt zu fahren.

**Mathematischer Bezug:** In Aufgabe 4 entdecken die Kinder, dass die Wiederholung genau dem sich wiederholenden Teil des Musters entspricht.`,
    en: `**Target group:** primary school (Mathematics, *investigating and creating patterns*), special schools, lower secondary.

**Time needed:** one double lesson.

**Without a computer:** first lay the patterns with coloured counters (or printed marks) on the 3 × 3 plate. For task 4, connect two plates (6 × 3 cells).

**Typical difficulties:** \`setMark\` paints the cell **under** Klonk, \`placeBrick\` builds **in front of** Klonk. In task 3 (chessboard) it helps to trace the path with a finger on the worksheet first.

**Mathematical connection:** in task 4, children discover that the repetition corresponds exactly to the repeating part of the pattern.`,
  },
  tasks: [
    {
      id: 'colour-row',
      title: { de: 'Bunte Reihe', en: 'Colourful row' },
      text: {
        de: 'Markiere die mittlere Reihe: **rot, blau, rot**.',
        en: 'Mark the middle row: **red, blue, red**.',
      },
      worlds: [map(`
        . . .
        > . .
        . . .
      `)],
      solution: {
        de: 'markieren(rot)\nschritt\nmarkieren(blau)\nschritt\nmarkieren(rot)',
        en: 'setMark(red)\nstep\nsetMark(blue)\nstep\nsetMark(red)',
      },
      check: { cells: true },
    },
    {
      id: 'traffic-light',
      title: { de: 'Ampel', en: 'Traffic light' },
      text: {
        de: 'Bau vor Klonk eine Ampel aus drei Ziegeln: unten **grün**, in der Mitte **gelb**, oben **rot**.',
        en: 'Build a traffic light of three bricks in front of Klonk: **green** at the bottom, **yellow** in the middle, **red** at the top.',
      },
      hints: [
        { de: 'Der erste Ziegel liegt ganz unten.', en: 'The first brick is at the very bottom.' },
      ],
      worlds: [map(`
        . . .
        . . .
        . ^ .
      `)],
      solution: {
        de: 'hinlegen(grün)\nhinlegen(gelb)\nhinlegen(rot)',
        en: 'placeBrick(green)\nplaceBrick(yellow)\nplaceBrick(red)',
      },
      check: { cells: true },
    },
    {
      id: 'chessboard',
      title: { de: 'Schachbrett', en: 'Chessboard' },
      text: {
        de: 'Markiere die Felder wie auf einem Schachbrett: die vier Ecken und die Mitte – fünf gelbe Felder.',
        en: 'Mark the cells like on a chessboard: the four corners and the centre – five yellow cells.',
      },
      hints: [
        { de: 'Fahre den Weg zuerst mit dem Finger: oben nach rechts, dann in Schlangenlinien nach unten.', en: 'Trace the path with your finger first: along the top to the right, then down in a zigzag.' },
      ],
      worlds: [map(`
        > . .
        . . .
        . . .
      `)],
      solution: {
        de: `markieren
schritt
schritt
markieren
rechtsDrehen
schritt
rechtsDrehen
schritt
markieren
schritt
linksDrehen
schritt
markieren
linksDrehen
schritt
schritt
markieren`,
        en: `setMark
step
step
setMark
turnRight
step
turnRight
step
setMark
step
turnLeft
step
setMark
turnLeft
step
step
setMark`,
      },
      check: { cells: true },
    },
    {
      id: 'continue-pattern',
      title: { de: 'Muster fortsetzen', en: 'Continue the pattern' },
      text: {
        de: 'Zwei Platten sind zusammengesteckt. Markiere die mittlere Reihe abwechselnd **rot, blau, rot, blau, rot, blau**. Benutze `wiederhole … mal`.',
        en: 'Two plates are connected. Mark the middle row alternately **red, blue, red, blue, red, blue**. Use `repeat … times`.',
      },
      hints: [
        { de: 'Welcher Teil wiederholt sich? *rot – Schritt – blau – Schritt*. Am Ende ist Klonk schon am Rand.', en: 'Which part repeats? *red – step – blue – step*. At the end Klonk is already at the edge.' },
      ],
      worlds: [map(`
        . . . . . .
        > . . . . .
        . . . . . .
      `)],
      solution: {
        de: `wiederhole 2 mal
  markieren(rot)
  schritt
  markieren(blau)
  schritt
ende
markieren(rot)
schritt
markieren(blau)`,
        en: `repeat 2 times
  setMark(red)
  step
  setMark(blue)
  step
end
setMark(red)
step
setMark(blue)`,
      },
      check: { cells: true },
      requires: ['repeatTimes'],
    },
  ],
}
