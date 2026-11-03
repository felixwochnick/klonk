import { map } from '../map'
import type { LearnModule } from '../types'

export const variables: LearnModule = {
  id: 'variables',
  title: { de: 'Variablen und Zählen', en: 'Variables and counting' },
  summary: {
    de: 'Sich Werte merken, mitzählen und Ergebnisse ausgeben.',
    en: 'Remember values, count along and output results.',
  },
  objectives: [
    { de: 'Variablen mit `var` anlegen und Werte zuweisen', en: 'Create variables with `var` and assign values' },
    { de: 'Mit einer Variablen mitzählen (Zähler erhöhen)', en: 'Count along with a variable (increase a counter)' },
    { de: 'Ergebnisse mit `ausgabe` ausgeben und gemerkte Werte wiederverwenden', en: 'Output results with `print` and reuse remembered values' },
  ],
  intro: {
    de: `Eine **Variable** ist ein Speicherplatz mit Namen. Mit \`var\` legst du sie an, mit \`=\` gibst du ihr einen neuen Wert:

\`\`\`klonk
var schritte = 0
wiederhole solange nicht istWand
  schritt
  schritte = schritte + 1
ende
ausgabe("Schritte: " + schritte)
\`\`\`

\`schritte = schritte + 1\` bedeutet: Nimm den alten Wert, zähle eins dazu und speichere das Ergebnis wieder in \`schritte\`. \`ausgabe\` schreibt Text und Zahlen in die Ausgabe unter der Welt.

Den Wert einer Variablen kannst du überall verwenden, wo eine Zahl stehen darf – zum Beispiel in \`wiederhole schritte mal\`.`,
    en: `A **variable** is a named storage place. You create it with \`var\` and give it a new value with \`=\`:

\`\`\`klonk
var steps = 0
repeat while not isWall
  step
  steps = steps + 1
end
print("Steps: " + steps)
\`\`\`

\`steps = steps + 1\` means: take the old value, add one and store the result in \`steps\` again. \`print\` writes text and numbers to the output below the world.

You can use the value of a variable wherever a number is allowed – for example in \`repeat steps times\`.`,
  },
  teacher: {
    de: `**Zeitbedarf:** ein bis zwei Doppelstunden.

**Typische Schwierigkeiten:** Die Zuweisung \`x = x + 1\` widerspricht dem mathematischen Gleichheitszeichen und sollte ausdrücklich als „wird zu“ gelesen werden. Die Variable muss **vor** der Schleife angelegt werden – steht \`var\` im Schleifenrumpf, beginnt der Zähler bei jedem Durchlauf neu. Beim Anhalten (Haltepunkt oder Einzelschritt) zeigt Klonk alle Variablen mit ihren Werten; das eignet sich für Trace-Tabellen.

**Prüfung der Ausgabe:** Bei Aufgaben mit Ausgabe vergleicht Klonk nur die Zahlen; die Formulierung des Textes ist frei.

**Differenzierung:** Schnelle Lernende erweitern Aufgabe 3 so, dass Klonk den Stapel an seinen Ausgangsort zurückbringt, oder geben zusätzlich die Zahl der Schritte aus.`,
    en: `**Time needed:** one to two double lessons.

**Typical difficulties:** The assignment \`x = x + 1\` contradicts the mathematical equals sign and should explicitly be read as “becomes”. The variable has to be created **before** the loop – if \`var\` is inside the loop body, the counter starts again in each pass. When paused (breakpoint or step), Klonk shows all variables with their values; this is suitable for trace tables.

**Checking the output:** For tasks with output, Klonk only compares the numbers; the wording of the text is free.

**Differentiation:** Fast learners extend task 3 so that Klonk brings the stack back to its original place, or additionally output the number of steps.`,
  },
  tasks: [
    {
      id: 'count-steps',
      title: { de: 'Schritte zählen', en: 'Count the steps' },
      text: {
        de: 'Klonk läuft bis zur Wand und gibt danach aus, wie viele Schritte er gegangen ist.',
        en: 'Klonk walks to the wall and then outputs how many steps it took.',
      },
      hints: [
        { de: 'Leg vor der Schleife eine Variable mit dem Wert 0 an und erhöhe sie bei jedem Schritt um 1.', en: 'Create a variable with the value 0 before the loop and increase it by 1 with every step.' },
      ],
      worlds: [
        map('> . . . . .'),
        map('> . . . . . . . . .'),
        map('> . .'),
      ],
      solution: {
        de: `var schritte = 0
wiederhole solange nicht istWand
  schritt
  schritte = schritte + 1
ende
ausgabe(schritte)`,
        en: `var steps = 0
repeat while not isWall
  step
  steps = steps + 1
end
print(steps)`,
      },
      check: { position: true, output: 'numbers' },
      requires: ['variable'],
    },
    {
      id: 'count-marks',
      title: { de: 'Marken zählen', en: 'Count the marks' },
      text: {
        de: 'Klonk läuft bis zur Wand und zählt dabei die Marken auf seinem Weg. Am Ende gibt er die Anzahl aus. Klonks Startfeld ist immer leer.',
        en: 'Klonk walks to the wall and counts the marks on its way. At the end it outputs the number. Klonk\'s start cell is always empty.',
      },
      hints: [
        { de: 'Erhöhe den Zähler nur, **wenn** Klonk auf einer Marke steht.', en: 'Only increase the counter **if** Klonk stands on a mark.' },
      ],
      worlds: [
        map('> y . y y . .'),
        map('> . . b . r . . g'),
        map('> . .'),
      ],
      solution: {
        de: `var marken = 0
wiederhole solange nicht istWand
  schritt
  wenn istMarke dann
    marken = marken + 1
  ende
ende
ausgabe("Marken: " + marken)`,
        en: `var marks = 0
repeat while not isWall
  step
  if isMark then
    marks = marks + 1
  end
end
print("Marks: " + marks)`,
      },
      check: { output: 'numbers' },
      requires: ['variable', 'if'],
    },
    {
      id: 'move-stack',
      title: { de: 'Stapel umsetzen', en: 'Move the stack' },
      text: {
        de: 'Vor Klonk steht ein Stapel Ziegel. Klonk soll den Stapel hinter sich wieder aufbauen – genauso hoch wie vorher. Wie hoch er ist, weißt du vorher nicht.',
        en: 'A stack of bricks stands in front of Klonk. Klonk should rebuild the stack behind itself – exactly as high as before. You do not know beforehand how high it is.',
      },
      hints: [
        { de: 'Zähle beim Aufheben mit. Danach dreht sich Klonk um und legt so viele Ziegel hin, wie er gezählt hat.', en: 'Count while picking up. Then Klonk turns around and places as many bricks as it counted.' },
      ],
      worlds: [
        map('. > 3'),
        map('. > 5'),
        map('. > 1'),
      ],
      solution: {
        de: `var anzahl = 0
wiederhole solange istZiegel
  aufheben
  anzahl = anzahl + 1
ende
linksDrehen
linksDrehen
wiederhole anzahl mal
  hinlegen
ende`,
        en: `var count = 0
repeat while isBrick
  pickBrick
  count = count + 1
end
turnLeft
turnLeft
repeat count times
  placeBrick
end`,
      },
      check: { cells: true },
      requires: ['variable'],
    },
  ],
}
