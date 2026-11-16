import { map } from '../../map'
import type { LearnModule } from '../../types'

export const characters: LearnModule = {
  id: 'characters',
  track: 'basics',
  title: { de: 'Mehrere Figuren', en: 'Several characters' },
  summary: {
    de: 'Mehrere Figuren in einer Welt steuern, neue Figuren erstellen und sie zusammenarbeiten lassen.',
    en: 'Control several characters in one world, create new characters and let them work together.',
  },
  objectives: [
    { de: 'Mit `wechsle` zwischen Figuren umschalten und jede Figur gezielt steuern', en: 'Switch between characters with `switch` and control each character on purpose' },
    { de: 'Neue Figuren mit `erstelle` in die Welt bringen', en: 'Bring new characters into the world with `create`' },
    { de: 'Eine Aufgabe auf mehrere Figuren aufteilen und Werte zwischen ihnen weitergeben', en: 'Split a task between several characters and pass values between them' },
  ],
  prerequisites: ['procedures', 'variables'],
  intro: {
    de: `In einer Welt können mehrere Figuren stehen. Jede hat einen **Namen**, ihren eigenen Platz und ihre eigene Blickrichtung. Dein Programm steuert immer **eine** Figur – am Anfang die erste. Mit \`wechsle\` gibst du die Steuerung an eine andere Figur weiter:

\`\`\`klonk
schritt              // Klonk geht
wechsle("Klara")
schritt              // jetzt geht Klara
linksDrehen
wechsle("Klonk")
markieren            // und wieder Klonk
\`\`\`

Mit \`erstelle\` bringst du eine neue Figur in die Welt. Sie erscheint auf einem freien Feld direkt neben der Figur, die du gerade steuerst, schaut in dieselbe Richtung – und wird ab sofort gesteuert:

\`\`\`klonk
erstelle("Kim", "weiblich")
schritt              // Kim geht
\`\`\`

Als Aussehen gibt es \`"männlich"\`, \`"weiblich"\` und \`"divers"\`. Jeder Name darf nur einmal vorkommen; Groß- und Kleinschreibung spielt dabei keine Rolle. Figuren können nicht durcheinander hindurchlaufen.

Variablen gehören übrigens nicht zu einer Figur, sondern zum Programm: Was du dir beim Steuern von Klonk gemerkt hast, kannst du auch nach \`wechsle\` noch verwenden. In den Blöcken findest du beide Befehle unter **Figuren**.`,
    en: `Several characters can stand in one world. Each has a **name**, its own place and its own direction. Your program always controls **one** character – at the beginning the first one. With \`switch\` you hand control over to another character:

\`\`\`klonk
step                 // Klonk walks
switch("Klara")
step                 // now Klara walks
turnLeft
switch("Klonk")
setMark              // and Klonk again
\`\`\`

With \`create\` you bring a new character into the world. It appears on a free cell right next to the character you are currently controlling, faces the same direction – and is controlled from now on:

\`\`\`klonk
create("Kim", "female")
step                 // Kim walks
\`\`\`

The looks available are \`"male"\`, \`"female"\` and \`"diverse"\`. Each name may only occur once; upper and lower case do not matter. Characters cannot walk through each other.

By the way, variables do not belong to a character but to the program: what you remembered while controlling Klonk you can still use after \`switch\`. In blocks you find both commands under **Characters**.`,
  },
  teacher: {
    de: `**Zeitbedarf:** eine bis zwei Doppelstunden.

**Voraussetzungen:** Bedingte Wiederholung, eigene Anweisungen und Variablen. Alle Aufgaben lassen sich auch ohne Lizenz mit mehreren Figuren lösen.

**Typische Schwierigkeiten:** Nach \`erstelle\` steuert das Programm die **neue** Figur – das wird oft übersehen, sodass Befehle für Klonk bei der neuen Figur landen. Wo eine neue Figur erscheint, hängt davon ab, wo die gesteuerte Figur gerade steht; in Aufgabe 2 muss Kim deshalb erstellt werden, bevor Klonk losläuft. Figuren blockieren sich gegenseitig, und die Sensoren erkennen keine anderen Figuren – Begegnungen müssen über Marken oder die Reihenfolge im Programm geregelt werden. Namen müssen genau stimmen (bis auf Groß- und Kleinschreibung).

**Ausblick Objektorientierung:** Jede Figur ist ein eigenes Objekt mit eigenen Attributwerten (Name, Position, Blickrichtung) und denselben Methoden (\`schritt\`, \`hinlegen\` …). \`wechsle\` legt fest, welches Objekt die nächsten Befehle bekommt. In der Reihe F wird daraus die Schreibweise \`klara = new Klonk("Klara")\` mit \`klara.step()\`. Variablen gehören dagegen zum Programm und nicht zu einer Figur – Aufgabe 3 nutzt das, um einen Wert von Klonk an Klara weiterzugeben.

**Differenzierung:** Aufgabe 4 (Staffellauf mit unterschiedlich vielen Läufern) verbindet Schleife, Variable und zusammengesetzte Namen (\`"Klonk " + nummer\`) und eignet sich als Zusatzaufgabe.`,
    en: `**Time needed:** one to two double lessons.

**Prerequisites:** Conditional repetition, procedures and variables. All tasks can be solved with several characters even without a license.

**Typical difficulties:** After \`create\` the program controls the **new** character – this is often overlooked, so commands meant for Klonk end up with the new character. Where a new character appears depends on where the controlled character currently stands; in task 2 Kim must therefore be created before Klonk sets off. Characters block each other, and the sensors do not detect other characters – encounters have to be arranged via marks or the order in the program. Names must match exactly (apart from upper and lower case).

**Outlook on object orientation:** Each character is an object of its own with its own attribute values (name, position, direction) and the same methods (\`step\`, \`placeBrick\` …). \`switch\` determines which object receives the next commands. In track F this becomes the notation \`klara = new Klonk("Klara")\` with \`klara.step()\`. Variables, by contrast, belong to the program and not to a character – task 3 uses this to pass a value from Klonk to Klara.

**Differentiation:** Task 4 (relay with different numbers of runners) combines loop, variable and composed names (\`"Klonk " + number\`) and is suitable as an extra task.`,
  },
  tasks: [
    {
      id: 'two-characters',
      title: { de: 'Zu zweit', en: 'The two of them' },
      text: {
        de: 'In der Welt stehen Klonk und Klara. Beide laufen bis zur Wand und markieren dort ihr Zielfeld. Am Anfang steuert dein Programm Klonk.',
        en: 'Klonk and Klara stand in the world. Both walk to the wall and mark their final cell there. At the beginning your program controls Klonk.',
      },
      hints: [
        { de: 'Beide tun dasselbe – eine eigene Anweisung spart dir das Abschreiben.', en: 'Both do the same – a procedure saves you from copying.' },
      ],
      worlds: [
        map(`
          > . . . . .
          . . . . . <
        `, { names: ['Klonk', 'Klara'] }),
        map(`
          > . . . . . . . .
          . . . . . . . . <
        `, { names: ['Klonk', 'Klara'] }),
        map(`
          > . .
          . . <
        `, { names: ['Klonk', 'Klara'] }),
      ],
      solution: {
        de: `anweisung zurWandUndMarkieren
  wiederhole solange nicht istWand
    schritt
  ende
  markieren
ende

zurWandUndMarkieren
wechsle("Klara")
zurWandUndMarkieren`,
        en: `procedure toWallAndMark
  repeat while not isWall
    step
  end
  setMark
end

toWallAndMark
switch("Klara")
toWallAndMark`,
      },
      check: { position: true, cells: true },
      characters: 2,
    },
    {
      id: 'reinforcements',
      title: { de: 'Verstärkung', en: 'Reinforcements' },
      text: {
        de: 'Klonk soll jedes Feld seiner Spalte und der Spalte daneben markieren. Allein dauert ihm das zu lange – er holt sich Hilfe: `erstelle("Kim", "weiblich")` setzt Kim auf ein freies Feld neben ihn. Danach markieren Kim und Klonk jeweils jedes Feld ihrer eigenen Spalte bis zur Wand. Die Spalten sind unterschiedlich lang.',
        en: 'Klonk is supposed to mark every cell of its column and of the column next to it. That takes too long on its own – it gets help: `create("Kim", "female")` puts Kim on a free cell next to it. Then Kim and Klonk each mark every cell of their own column up to the wall. The columns differ in length.',
      },
      hints: [
        { de: 'Erstelle Kim gleich am Anfang, solange Klonk noch oben in der Ecke steht – dann erscheint sie in der Spalte neben ihm.', en: 'Create Kim right at the beginning, while Klonk still stands in the top corner – then she appears in the column next to it.' },
        { de: 'Nach `erstelle` steuert dein Programm Kim. Mit `wechsle("Klonk")` kommst du zurück zu Klonk.', en: 'After `create` your program controls Kim. With `switch("Klonk")` you get back to Klonk.' },
      ],
      worlds: [
        map(`
          v .
          . .
          . .
          . .
        `),
        map(`
          v .
          . .
        `),
        map(`
          v .
          . .
          . .
          . .
          . .
          . .
        `),
      ],
      solution: {
        de: `anweisung spurMarkieren
  markieren
  wiederhole solange nicht istWand
    schritt
    markieren
  ende
ende

erstelle("Kim", "weiblich")
spurMarkieren
wechsle("Klonk")
spurMarkieren`,
        en: `procedure markLane
  setMark
  repeat while not isWall
    step
    setMark
  end
end

create("Kim", "female")
markLane
switch("Klonk")
markLane`,
      },
      check: { position: true, cells: true },
      characters: 2,
    },
    {
      id: 'hand-over',
      title: { de: 'Ziegel weitergeben', en: 'Passing on bricks' },
      text: {
        de: 'Klonk räumt seinen Weg bis zur Wand frei: Er hebt alle Ziegel auf und zählt dabei mit. Auf manchen Feldern liegen mehrere Ziegel. Danach baut Klara vor sich einen Turm aus genauso vielen Ziegeln, wie Klonk aufgehoben hat.',
        en: 'Klonk clears its path up to the wall: it picks up all bricks and counts along. Some cells hold several bricks. Then Klara builds a tower in front of her with exactly as many bricks as Klonk picked up.',
      },
      hints: [
        { de: 'Das Einsammeln kennst du aus dem Modul „Verzweigung“, das Mitzählen aus „Variablen und Zählen“.', en: 'You know collecting from the module “Branching” and counting along from “Variables and counting”.' },
        { de: 'Die Variable gehört dem Programm, nicht Klonk – nach `wechsle("Klara")` hat sie noch denselben Wert.', en: 'The variable belongs to the program, not to Klonk – after `switch("Klara")` it still has the same value.' },
      ],
      worlds: [
        map(`
          > 1 . 2 . 1
          . . . . . .
          > . . . . .
        `, { names: ['Klonk', 'Klara'] }),
        map(`
          > . 3 1 . . 2
          > . . . . . .
        `, { names: ['Klonk', 'Klara'] }),
        map(`
          > . 1
          . . .
          . . .
          > . .
        `, { names: ['Klonk', 'Klara'] }),
      ],
      solution: {
        de: `var ziegel = 0
wiederhole solange nicht istWand
  wenn istZiegel dann
    aufheben
    ziegel = ziegel + 1
  sonst
    schritt
  ende
ende
wechsle("Klara")
wiederhole ziegel mal
  hinlegen
ende`,
        en: `var bricks = 0
repeat while not isWall
  if isBrick then
    pickBrick
    bricks = bricks + 1
  else
    step
  end
end
switch("Klara")
repeat bricks times
  placeBrick
end`,
      },
      check: { cells: true },
      requires: ['variable'],
      characters: 2,
    },
    {
      id: 'relay',
      title: { de: 'Staffellauf', en: 'Relay race' },
      text: {
        de: 'Auf der Bahn stehen die Läufer Klonk 1, Klonk 2, Klonk 3 … – in jeder Welt unterschiedlich viele. Direkt hinter jedem Läufer außer dem ersten liegt eine gelbe Marke: Dort übergibt der vorige Läufer den Staffelstab. Klonk 1 läuft los bis zur ersten Marke, dann läuft Klonk 2 bis zur nächsten Marke und so weiter. Der letzte Läufer läuft bis zur Wand und markiert das Ziel grün.',
        en: 'The runners Klonk 1, Klonk 2, Klonk 3 … stand on the track – a different number in each world. Right behind every runner except the first there is a yellow mark: there the previous runner hands over the baton. Klonk 1 runs to the first mark, then Klonk 2 runs to the next mark and so on. The last runner runs to the wall and marks the finish green.',
      },
      hints: [
        { de: 'Alle Läufer tun dasselbe: laufen, bis sie auf einer Marke stehen oder vor der Wand.', en: 'All runners do the same: run until they stand on a mark or in front of the wall.' },
        { de: 'Zähl die Nummer des Läufers in einer Variablen mit. Den Namen setzt du mit `"Klonk " + nummer` zusammen.', en: 'Keep track of the runner\'s number in a variable. You compose the name with `"Klonk " + number`.' },
      ],
      worlds: [
        map('> . . y > . y > . .', { names: ['Klonk 1', 'Klonk 2', 'Klonk 3'] }),
        map('> y > . y > y > . .', { names: ['Klonk 1', 'Klonk 2', 'Klonk 3', 'Klonk 4'] }),
        map('> . . . y > .', { names: ['Klonk 1', 'Klonk 2'] }),
      ],
      solution: {
        de: `anweisung laufen
  wiederhole bis istMarke oder istWand
    schritt
  ende
ende

var nummer = 1
laufen
wiederhole solange istMarke
  nummer = nummer + 1
  wechsle("Klonk " + nummer)
  laufen
ende
markieren(grün)`,
        en: `procedure run
  repeat until isMark or isWall
    step
  end
end

var number = 1
run
repeat while isMark
  number = number + 1
  switch("Klonk " + number)
  run
end
setMark(green)`,
      },
      check: { position: true, cells: true },
      requires: ['variable', 'repeatWhile'],
      characters: 4,
    },
  ],
}
