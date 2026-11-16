import { map } from '../../map'
import type { LearnModule } from '../../types'

export const algorithms: LearnModule = {
  id: 'algorithms',
  track: 'basics',
  title: { de: 'Knobelaufgaben: Suchen und Labyrinthe', en: 'Puzzles: searching and mazes' },
  summary: {
    de: 'Labyrinthe, Spuren, Maximum und Sortieren: Algorithmen, die in jeder Welt zum Ziel führen.',
    en: 'Mazes, trails, maximum and sorting: algorithms that reach the goal in every world.',
  },
  objectives: [
    { de: 'Bekannte Verfahren wie die Rechte-Hand-Regel und die Maximumsuche umsetzen', en: 'Implement well-known methods such as the right-hand rule and finding the maximum' },
    { de: 'Ein Problem erst in Worten lösen und dann in Funktionen, Anweisungen und Schleifen zerlegen', en: 'Solve a problem in words first and then break it down into functions, procedures and loops' },
    { de: 'Algorithmen in verschiedenen Welten testen, auch mit Grenzfällen', en: 'Test algorithms in different worlds, including edge cases' },
  ],
  prerequisites: ['functions', 'nested-loops'],
  intro: {
    de: `Ein **Algorithmus** ist ein genau beschriebenes Verfahren, das eine Aufgabe in **jeder** passenden Welt löst – nicht nur in der, die du gerade siehst. Neue Befehle brauchst du in diesem Modul kaum, aber gute Ideen. Beschreibe dein Verfahren zuerst in Worten, zerlege es dann in Funktionen und Anweisungen und teste es in allen Welten. Zwei bewährte Ideen:

**Sich das Beste merken.** Um den größten Wert zu finden, merkst du dir den größten bisher gefundenen Wert und vergleichst jeden neuen damit:

\`\`\`klonk
var größte = 0
wiederhole 5 mal
  var wurf = zufall(1, 6)
  ausgabe("Gewürfelt: " + wurf)
  wenn wurf > größte dann
    größte = wurf
  ende
ende
ausgabe("Größter Wurf: " + größte)
\`\`\`

**Die Rechte-Hand-Regel.** Wer sich in einem Labyrinth immer mit der rechten Hand an der Wand entlangtastet, findet garantiert den Ausgang – solange alle Wände zusammenhängen. Für Klonk heißt das: Ist rechts frei, dreht er sich nach rechts und geht einen Schritt. Sonst geht er geradeaus, wenn vorn frei ist. Sonst dreht er sich nach links.`,
    en: `An **algorithm** is a precisely described method that solves a task in **every** suitable world – not just in the one you are looking at. You hardly need new commands in this module, but good ideas. First describe your method in words, then break it down into functions and procedures and test it in all worlds. Two proven ideas:

**Remember the best so far.** To find the largest value, you remember the largest value found so far and compare each new one with it:

\`\`\`klonk
var largest = 0
repeat 5 times
  var roll = random(1, 6)
  print("Rolled: " + roll)
  if roll > largest then
    largest = roll
  end
end
print("Largest roll: " + largest)
\`\`\`

**The right-hand rule.** Whoever always feels their way along the wall of a maze with their right hand is guaranteed to find the exit – as long as all walls are connected. For Klonk this means: if it is free on the right, it turns right and takes a step. Otherwise it goes straight on if it is free in front. Otherwise it turns left.`,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei bis drei Doppelstunden. Das Modul schließt die Reihe E ab; die Aufgaben sind unabhängig voneinander und können auch zur Differenzierung einzeln vergeben werden.

**Voraussetzungen:** Alle vorigen Module der Reihe E, besonders Funktionen (eigene Sensoren wie \`istRechtsFrei\`) und Variablen.

**Typische Schwierigkeiten:** Bei der Rechte-Hand-Regel (Aufgabe 1) ist die Reihenfolge der Abfragen entscheidend: erst rechts, dann vorn, sonst links drehen. Die Labyrinthe haben nur ein Feld breite Gänge; in offenen Flächen kann die Regel im Kreis laufen – ein guter Anlass, über Grenzen eines Verfahrens zu sprechen. In Aufgabe 2 muss die Funktion, die vorausschaut, Klonk wieder genau auf sein Feld und in seine Blickrichtung zurückbringen. Bei der Maximumsuche (Aufgabe 3) wird gern vergessen, auch den ersten Turm zu berücksichtigen oder sich neben dem Wert auch die Stelle zu merken. Aufgabe 4 ist ein Sortierverfahren (Bubblesort): Benachbarte Türme werden verglichen und bei Bedarf getauscht, und die Durchgänge wiederholen sich, bis in einem ganzen Durchgang nichts mehr getauscht wurde. Eine Wahrheitswert-Variable (\`wahr\`/\`falsch\`) als „Merker“ ist dabei neu.

**Fachlicher Bezug:** Die Aufgaben eignen sich, um Eigenschaften von Algorithmen zu besprechen: Korrektheit (in allen Welten), Terminierung (endet die Schleife sicher?) und Aufwand (die Zahl der Schritte lässt sich mitzählen und für verschieden große Welten vergleichen).

**Differenzierung:** Schnelle Lernende lösen das Labyrinth zusätzlich mit der Linken-Hand-Regel und vergleichen die Wege, geben in Aufgabe 3 auch die Stelle des höchsten Turms aus oder sortieren in Aufgabe 4 absteigend.`,
    en: `**Time needed:** two to three double lessons. The module completes track E; the tasks are independent of each other and can also be assigned individually for differentiation.

**Prerequisites:** All previous modules of track E, especially functions (own sensors such as \`isRightFree\`) and variables.

**Typical difficulties:** With the right-hand rule (task 1) the order of the queries is crucial: first right, then front, otherwise turn left. The mazes only have corridors one cell wide; in open areas the rule can go round in circles – a good occasion to talk about the limits of a method. In task 2 the function that looks ahead has to bring Klonk back exactly to its cell and its direction. When finding the maximum (task 3) learners often forget to include the first tower or to remember the place as well as the value. Task 4 is a sorting algorithm (bubble sort): neighboring towers are compared and swapped if necessary, and the passes repeat until nothing was swapped in a whole pass. A Boolean variable (\`true\`/\`false\`) as a flag is new here.

**Subject link:** The tasks are suitable for discussing properties of algorithms: correctness (in all worlds), termination (does the loop end for sure?) and effort (the number of steps can be counted and compared for worlds of different sizes).

**Differentiation:** Fast learners additionally solve the maze with the left-hand rule and compare the paths, also output the position of the highest tower in task 3, or sort in descending order in task 4.`,
  },
  tasks: [
    {
      id: 'maze',
      title: { de: 'Labyrinth', en: 'Maze' },
      text: {
        de: 'Klonk steht in einem Labyrinth und soll den Ausgang finden: das Feld mit der grünen Marke. Das Labyrinth hat Abzweigungen und Sackgassen. Verwende die Rechte-Hand-Regel aus der Einführung (oder die Linke-Hand-Regel).',
        en: 'Klonk stands in a maze and has to find the exit: the cell with the green mark. The maze has branches and dead ends. Use the right-hand rule from the introduction (or the left-hand rule).',
      },
      hints: [
        { de: 'Die Funktion `istRechtsFrei` kennst du schon aus dem Modul „Funktionen“.', en: 'You already know the function `isRightFree` from the module “Functions”.' },
        { de: 'Bis Klonk auf der Marke steht: Ist rechts frei, dreh dich nach rechts und geh einen Schritt – sonst, wenn vorn frei ist, geh einen Schritt – sonst dreh dich nach links.', en: 'Until Klonk stands on the mark: if the right is free, turn right and take a step – otherwise, if the front is free, take a step – otherwise turn left.' },
      ],
      worlds: [
        map(`
          > . . # . . .
          # # . # . # .
          . . . # . # .
          . # # # . # #
          . # . . . . .
          . # . # # # .
          . . . # g . .
        `),
        map(`
          . . . . . . . . .
          . # # # . # # # .
          . # . . . # . . .
          . # . # # # . # .
          ^ # . . . # g # .
        `),
        map(`
          > . . . .
          # # . # .
          . . . # .
          . # # # .
          . . . # g
        `),
      ],
      solution: {
        de: `funktion istRechtsFrei
  rechtsDrehen
  var frei = nicht istWand
  linksDrehen
  zurück frei
ende

wiederhole bis istMarke
  wenn istRechtsFrei() dann
    rechtsDrehen
    schritt
  sonst wenn nicht istWand dann
    schritt
  sonst
    linksDrehen
  ende
ende`,
        en: `function isRightFree
  turnRight
  var free = not isWall
  turnLeft
  return free
end

repeat until isMark
  if isRightFree() then
    turnRight
    step
  else if not isWall then
    step
  else
    turnLeft
  end
end`,
      },
      check: { position: true },
      requires: ['function', 'if'],
    },
    {
      id: 'trail',
      title: { de: 'Spurensuche', en: 'Following the trail' },
      text: {
        de: 'Auf dem Boden liegt eine Spur aus gelben Marken, die um Ecken führt. Klonk steht am Anfang der Spur, an ihrem Ende liegt eine rote Marke. Klonk folgt der Spur bis zur roten Marke. Aber Vorsicht: Klonk merkt nur, ob er **auf** einer Marke steht. Um nachzusehen, ob die Spur vor ihm weitergeht, muss er hingehen – und notfalls wieder zurück. Die Spur berührt sich nirgends selbst.',
        en: 'There is a trail of yellow marks on the floor that turns corners. Klonk stands at the beginning of the trail, at its end there is a red mark. Klonk follows the trail to the red mark. But careful: Klonk only notices whether it stands **on** a mark. To find out whether the trail continues in front of it, it has to go there – and back again if necessary. The trail never touches itself.',
      },
      hints: [
        { de: 'Schreib eine Funktion `istVorneMarke`: Ist vorn keine Wand, geht Klonk einen Schritt, merkt sich, ob er auf einer Marke steht, und kehrt auf sein Feld und in seine Blickrichtung zurück.', en: 'Write a function `isMarkAhead`: if there is no wall in front, Klonk takes a step, remembers whether it stands on a mark and returns to its cell and direction.' },
        { de: 'Geht die Spur nicht geradeaus weiter, schau links nach. Geht sie dort auch nicht weiter, dann muss sie nach rechts führen.', en: 'If the trail does not continue straight on, look to the left. If it does not continue there either, it must lead to the right.' },
      ],
      worlds: [
        map(`
          >y y y . . .
          .  . y . . .
          .  . y y y .
          .  . . . y .
          .  . . . r .
        `),
        map(`
          .  . y y y y .
          .  . y . . y .
          y  y y . . y .
          y  . . y y y .
          y  . . y . . .
          ^y . . y y y r
        `),
        map(`
          .  . . .
          >y y . .
          .  y y r
        `),
      ],
      solution: {
        de: `anweisung umdrehen
  linksDrehen
  linksDrehen
ende

funktion istVorneMarke
  var marke = falsch
  wenn nicht istWand dann
    schritt
    marke = istMarke
    umdrehen
    schritt
    umdrehen
  ende
  zurück marke
ende

wiederhole bis istMarke(rot)
  wenn nicht istVorneMarke() dann
    linksDrehen
    wenn nicht istVorneMarke() dann
      umdrehen
    ende
  ende
  schritt
ende`,
        en: `procedure turnAround
  turnLeft
  turnLeft
end

function isMarkAhead
  var mark = false
  if not isWall then
    step
    mark = isMark
    turnAround
    step
    turnAround
  end
  return mark
end

repeat until isMark(red)
  if not isMarkAhead() then
    turnLeft
    if not isMarkAhead() then
      turnAround
    end
  end
  step
end`,
      },
      check: { position: true },
      requires: ['function', 'if'],
    },
    {
      id: 'highest-tower',
      title: { de: 'Der höchste Turm', en: 'The highest tower' },
      text: {
        de: 'Links neben Klonks Weg stehen Türme unterschiedlicher Höhe, manche Felder sind leer. Klonk läuft bis zur Wand und findet dabei heraus, wie hoch der höchste Turm ist. Gib die Höhe aus. Danach geht Klonk zurück und markiert das Feld seines Wegs, das neben dem höchsten Turm liegt. In jeder Welt gibt es genau einen höchsten Turm – er kann auch neben dem Start- oder dem Zielfeld stehen.',
        en: 'To the left of Klonk\'s path there are towers of different heights, some cells are empty. Klonk walks to the wall and finds out how high the highest tower is. Output the height. Then Klonk walks back and marks the cell of its path that lies next to the highest tower. In each world there is exactly one highest tower – it can also stand next to the start or the final cell.',
      },
      hints: [
        { de: 'Eine Funktion `höheLinks` liefert die Höhe des Turms links von Klonk – mit `ziegelAnzahl`, nachdem Klonk sich zum Turm gedreht hat.', en: 'A function `heightLeft` delivers the height of the tower to Klonk\'s left – with `brickCount` after Klonk has turned towards the tower.' },
        { de: 'Merke dir neben der größten Höhe auch die Stelle, an der du sie gefunden hast (`positionX`). Auf dem Rückweg läufst du, bis du wieder an dieser Stelle bist.', en: 'Besides the greatest height, also remember the place where you found it (`positionX`). On the way back you walk until you are at this place again.' },
      ],
      worlds: [
        map(`
          2 . 4 1 . 3
          > . . . . .
        `),
        map(`
          1 3 . 2 5 . 4 1
          > . . . . . . .
        `),
        map(`
          3 1 .
          > . .
        `),
        map(`
          . 1 . 2 . 6
          > . . . . .
        `),
      ],
      solution: {
        de: `funktion höheLinks
  linksDrehen
  var anzahl = ziegelAnzahl
  rechtsDrehen
  zurück anzahl
ende

var größte = höheLinks()
var stelle = positionX
var höhe = 0
wiederhole solange nicht istWand
  schritt
  höhe = höheLinks()
  wenn höhe > größte dann
    größte = höhe
    stelle = positionX
  ende
ende
ausgabe("Der höchste Turm ist " + größte + " Ziegel hoch.")
linksDrehen
linksDrehen
wiederhole solange positionX > stelle
  schritt
ende
markieren`,
        en: `function heightLeft
  turnLeft
  var count = brickCount
  turnRight
  return count
end

var largest = heightLeft()
var place = positionX
var height = 0
repeat while not isWall
  step
  height = heightLeft()
  if height > largest then
    largest = height
    place = positionX
  end
end
print("The highest tower is " + largest + " bricks high.")
turnLeft
turnLeft
repeat while positionX > place
  step
end
setMark`,
      },
      check: { cells: true, output: 'numbers' },
      requires: ['variable', 'if'],
    },
    {
      id: 'sort-towers',
      title: { de: 'Türme sortieren', en: 'Sorting towers' },
      text: {
        de: 'Links neben Klonks Weg steht eine Reihe von Türmen. Klonk sortiert sie der Höhe nach: links der niedrigste, rechts der höchste – wie Orgelpfeifen. Dazu darf er Ziegel aufheben und hinlegen; am Ende muss auf jedem Platz ein Turm der richtigen Höhe stehen. Wo Klonk am Ende steht, ist egal.',
        en: 'To the left of Klonk\'s path there is a row of towers. Klonk sorts them by height: the lowest on the left, the highest on the right – like organ pipes. For this it may pick up and place bricks; in the end there has to be a tower of the right height in every place. Where Klonk ends up does not matter.',
      },
      hints: [
        { de: 'Vergleiche zwei benachbarte Türme. Ist der linke höher als der rechte, tausche ihre Höhen: Ziegel aufheben bzw. hinlegen, bis jeder Turm so hoch ist wie vorher der andere.', en: 'Compare two neighboring towers. If the left one is higher than the right one, swap their heights: pick up or place bricks until each tower is as high as the other one was before.' },
        { de: 'Lauf so lange immer wieder von links nach rechts, bis in einem ganzen Durchgang nichts mehr getauscht wurde. Ob getauscht wurde, merkst du dir in einer Variablen mit `wahr` oder `falsch`.', en: 'Walk from left to right again and again until nothing was swapped in a whole pass. You remember whether something was swapped in a variable with `true` or `false`.' },
      ],
      worlds: [
        map(`
          3 1 4 2
          > . . .
        `),
        map(`
          5 2 6 1 3 4
          > . . . . .
        `),
        map(`
          2 1
          > .
        `),
        map(`
          4 1 3 1 2
          > . . . .
        `),
      ],
      solution: {
        de: `funktion höheLinks
  linksDrehen
  var anzahl = ziegelAnzahl
  rechtsDrehen
  zurück anzahl
ende

anweisung höheSetzen(ziel)
  linksDrehen
  wiederhole solange ziegelAnzahl > ziel
    aufheben
  ende
  wiederhole solange ziegelAnzahl < ziel
    hinlegen
  ende
  rechtsDrehen
ende

anweisung umdrehen
  linksDrehen
  linksDrehen
ende

var getauscht = wahr
var links = 0
var rechts = 0
wiederhole solange getauscht
  getauscht = falsch
  wiederhole solange nicht istWand
    links = höheLinks()
    schritt
    rechts = höheLinks()
    wenn links > rechts dann
      höheSetzen(links)
      umdrehen
      schritt
      umdrehen
      höheSetzen(rechts)
      schritt
      getauscht = wahr
    ende
  ende
  umdrehen
  wiederhole solange nicht istWand
    schritt
  ende
  umdrehen
ende`,
        en: `function heightLeft
  turnLeft
  var count = brickCount
  turnRight
  return count
end

procedure setHeight(target)
  turnLeft
  repeat while brickCount > target
    pickBrick
  end
  repeat while brickCount < target
    placeBrick
  end
  turnRight
end

procedure turnAround
  turnLeft
  turnLeft
end

var swapped = true
var left = 0
var right = 0
repeat while swapped
  swapped = false
  repeat while not isWall
    left = heightLeft()
    step
    right = heightLeft()
    if left > right then
      setHeight(left)
      turnAround
      step
      turnAround
      setHeight(right)
      step
      swapped = true
    end
  end
  turnAround
  repeat while not isWall
    step
  end
  turnAround
end`,
      },
      check: { cells: true },
      requires: ['variable', 'if', 'repeatWhile'],
    },
  ],
}
