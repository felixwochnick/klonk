import type { LearnDatabase, LearnModule } from '../../types'

// Schule mit Klassen (1:n) und Arbeitsgemeinschaften (n:m über die Tabelle der Teilnahmen), je Startsituation andere Daten

const CLUBS = {
  robotics: { de: 'Robotik', en: 'Robotics' },
  choir: { de: 'Chor', en: 'Choir' },
  chess: { de: 'Schach', en: 'Chess' },
  drama: { de: 'Theater', en: 'Drama' },
  football: { de: 'Fußball', en: 'Football' },
} as const
type Club = keyof typeof CLUBS

const DAYS = {
  mon: { de: 'Montag', en: 'Monday' },
  tue: { de: 'Dienstag', en: 'Tuesday' },
  wed: { de: 'Mittwoch', en: 'Wednesday' },
  thu: { de: 'Donnerstag', en: 'Thursday' },
  fri: { de: 'Freitag', en: 'Friday' },
} as const

const TEACHERS = {
  okafor: { de: 'Frau Okafor', en: 'Ms Okafor' },
  schulz: { de: 'Herr Schulz', en: 'Mr Schulz' },
  lang: { de: 'Frau Lang', en: 'Ms Lang' },
  yilmaz: { de: 'Herr Yilmaz', en: 'Mr Yilmaz' },
} as const

type School = {
  /** Klasse ⇒ Klassenleitung */
  classes: [name: string, teacher: keyof typeof TEACHERS][]
  /** Vorname, Klasse (Name), AGs */
  students: [firstName: string, form: string, clubs: Club[]][]
  clubs: [club: Club, day: keyof typeof DAYS][]
}

function schoolSql(school: School, lang: 'de' | 'en') {
  const n = lang === 'de'
    ? { classes: 'klassen', teacher: 'lehrkraft', students: 'schueler', firstName: 'vorname', classId: 'klasse_id', clubs: 'ags', day: 'wochentag', members: 'teilnahmen', studentId: 'schueler_id', clubId: 'ag_id' }
    : { classes: 'classes', teacher: 'teacher', students: 'students', firstName: 'first_name', classId: 'class_id', clubs: 'clubs', day: 'weekday', members: 'memberships', studentId: 'student_id', clubId: 'club_id' }
  const classId = (form: string) => school.classes.findIndex(([name]) => name === form) + 1
  const clubId = (club: Club) => school.clubs.findIndex(([c]) => c === club) + 1
  const values = (rows: string[]) => rows.map(row => `  (${row})`).join(',\n')
  return [
    `CREATE TABLE ${n.classes} (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  ${n.teacher} TEXT\n);`,
    `CREATE TABLE ${n.students} (\n  id INTEGER PRIMARY KEY,\n  ${n.firstName} TEXT NOT NULL,\n  ${n.classId} INTEGER REFERENCES ${n.classes}(id)\n);`,
    `CREATE TABLE ${n.clubs} (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  ${n.day} TEXT\n);`,
    `CREATE TABLE ${n.members} (\n  ${n.studentId} INTEGER REFERENCES ${n.students}(id),\n  ${n.clubId} INTEGER REFERENCES ${n.clubs}(id),\n  PRIMARY KEY (${n.studentId}, ${n.clubId})\n);`,
    `INSERT INTO ${n.classes} VALUES\n${values(school.classes.map(([name, teacher], i) => `${i + 1}, '${name}', '${TEACHERS[teacher][lang]}'`))};`,
    `INSERT INTO ${n.students} VALUES\n${values(school.students.map(([name, form], i) => `${i + 1}, '${name}', ${classId(form)}`))};`,
    `INSERT INTO ${n.clubs} VALUES\n${values(school.clubs.map(([club, day], i) => `${i + 1}, '${CLUBS[club][lang]}', '${DAYS[day][lang]}'`))};`,
    `INSERT INTO ${n.members} VALUES\n${values(school.students.flatMap(([, , clubs], i) => clubs.map(club => `${i + 1}, ${clubId(club)}`)))};`,
  ].join('\n') + '\n'
}

const SCHOOLS: School[] = [
  {
    classes: [['7a', 'okafor'], ['7b', 'schulz'], ['8a', 'lang']],
    students: [
      ['Mia', '7a', ['robotics', 'choir']], ['Ben', '7a', []], ['Elif', '7b', ['robotics']], ['Jonas', '7b', []],
      ['Lea', '8a', ['chess']], ['Noah', '8a', ['robotics']], ['Ida', '7a', ['choir']], ['Tim', '7b', ['chess']],
    ],
    clubs: [['robotics', 'mon'], ['choir', 'tue'], ['chess', 'thu'], ['drama', 'fri']],
  },
  {
    classes: [['5a', 'schulz'], ['5b', 'okafor'], ['6a', 'lang'], ['6b', 'yilmaz']],
    students: [
      ['Can', '5a', ['robotics', 'football']], ['Zoe', '5b', ['robotics']], ['Ole', '5b', ['football']], ['Sara', '6a', ['chess']],
      ['Finn', '6b', []], ['Lina', '5b', ['robotics', 'choir']], ['Paul', '5a', ['football']], ['Emma', '6a', []], ['Luca', '6b', ['robotics']],
    ],
    clubs: [['chess', 'mon'], ['robotics', 'wed'], ['football', 'tue'], ['choir', 'thu']],
  },
  {
    classes: [['9a', 'okafor'], ['9b', 'lang']],
    students: [
      ['Ali', '9a', ['robotics', 'chess']], ['Eva', '9a', ['drama']], ['Jan', '9b', ['robotics']], ['Nina', '9b', ['drama', 'choir']],
      ['Max', '9a', ['drama']], ['Ina', '9b', []], ['Kai', '9b', []],
    ],
    clubs: [['drama', 'mon'], ['robotics', 'tue'], ['chess', 'wed'], ['choir', 'fri'], ['football', 'thu']],
  },
]

const school: LearnDatabase[] = [{
  name: { de: 'schule', en: 'school' },
  sql: SCHOOLS.map(s => ({ de: schoolSql(s, 'de'), en: schoolSql(s, 'en') })),
}]

export const sqlJoin: LearnModule = {
  id: 'sql-join',
  track: 'sql',
  title: { de: 'Tabellen verknüpfen', en: 'Joining tables' },
  summary: {
    de: 'Lernende, Klassen und Arbeitsgemeinschaften stehen in eigenen Tabellen – über Schlüssel und Fremdschlüssel fügst du sie wieder zusammen.',
    en: 'Students, classes and clubs are stored in tables of their own – using keys and foreign keys you put them back together.',
  },
  objectives: [
    { de: 'Primär- und Fremdschlüssel in einer Datenbank erkennen und 1:n- sowie n:m-Beziehungen (mit Zwischentabelle) beschreiben', en: 'Identify primary and foreign keys in a database and describe 1:n and n:m relationships (with a junction table)' },
    { de: 'Zwei und mehr Tabellen mit `JOIN … ON` (oder über eine Bedingung in `WHERE`) verknüpfen', en: 'Join two or more tables with `JOIN … ON` (or with a condition in `WHERE`)' },
    { de: 'Mit `LEFT JOIN` auch Datensätze ohne Partner finden und Verknüpfungen mit `GROUP BY` auswerten', en: 'Find records without a partner using `LEFT JOIN` and evaluate joins with `GROUP BY`' },
  ],
  prerequisites: ['sql-aggregate'],
  intro: {
    de: `Die Datenbank \`schule\` speichert jede Sache nur einmal, in einer eigenen Tabelle:

- \`klassen\` (id, name, lehrkraft) – \`lehrkraft\` ist die Klassenleitung
- \`schueler\` (id, vorname, klasse_id) – \`klasse_id\` verweist auf \`klassen.id\`
- \`ags\` (id, name, wochentag) – die Arbeitsgemeinschaften
- \`teilnahmen\` (schueler_id, ag_id) – wer in welcher AG ist

\`id\` ist jeweils der **Primärschlüssel**. Eine Spalte wie \`klasse_id\`, die auf den Primärschlüssel einer anderen Tabelle verweist, heißt **Fremdschlüssel**. Eine Klasse hat viele Lernende, jede:r Lernende genau eine Klasse: eine **1:n-Beziehung**. Lernende können in mehreren AGs sein und AGs haben viele Mitglieder: eine **n:m-Beziehung** – dafür braucht es die **Zwischentabelle** \`teilnahmen\`.

Mit **JOIN** fügst du die Tabellen wieder zusammen:

\`\`\`sql
SELECT schueler.vorname, klassen.name, klassen.lehrkraft
FROM schueler
JOIN klassen ON schueler.klasse_id = klassen.id
\`\`\`

Hinter \`ON\` steht, welche Zeilen zusammengehören. Gleich lautende Spalten unterscheidest du mit dem Tabellennamen (\`klassen.name\`); kürzer geht es mit einem Alias: \`FROM schueler s JOIN klassen k ON s.klasse_id = k.id\`. Für eine n:m-Beziehung verknüpfst du drei Tabellen: \`schueler\` – \`teilnahmen\` – \`ags\`.

Du kannst die Tabellen auch durch Komma getrennt aufzählen und die Bedingung in \`WHERE\` schreiben – das Ergebnis ist dasselbe:

\`\`\`sql
SELECT schueler.vorname, klassen.name
FROM schueler, klassen
WHERE schueler.klasse_id = klassen.id
\`\`\`

\`JOIN\` liefert nur Zeilen, die einen Partner haben. \`LEFT JOIN\` behält alle Zeilen der linken Tabelle; fehlt der Partner, stehen in seinen Spalten NULL-Werte.

Tipp: Öffne die Datenbankdatei im Aufgabenordner – im Tab **ER-Diagramm** siehst du, wie die Tabellen zusammenhängen.`,
    en: `The database \`school\` stores each thing only once, in a table of its own:

- \`classes\` (id, name, teacher) – \`teacher\` is the form teacher
- \`students\` (id, first_name, class_id) – \`class_id\` refers to \`classes.id\`
- \`clubs\` (id, name, weekday) – the after-school clubs
- \`memberships\` (student_id, club_id) – who is in which club

\`id\` is the **primary key** in each case. A column like \`class_id\` that refers to the primary key of another table is called a **foreign key**. A class has many students, each student exactly one class: a **1:n relationship**. Students can be in several clubs and clubs have many members: an **n:m relationship** – this needs the **junction table** \`memberships\`.

With **JOIN** you put the tables back together:

\`\`\`sql
SELECT students.first_name, classes.name, classes.teacher
FROM students
JOIN classes ON students.class_id = classes.id
\`\`\`

After \`ON\` you state which rows belong together. Tell columns with the same name apart with the table name (\`classes.name\`); an alias makes it shorter: \`FROM students s JOIN classes c ON s.class_id = c.id\`. For an n:m relationship you join three tables: \`students\` – \`memberships\` – \`clubs\`.

You can also list the tables separated by commas and write the condition in \`WHERE\` – the result is the same:

\`\`\`sql
SELECT students.first_name, classes.name
FROM students, classes
WHERE students.class_id = classes.id
\`\`\`

\`JOIN\` only returns rows that have a partner. \`LEFT JOIN\` keeps all rows of the left table; if the partner is missing, its columns contain NULL values.

Tip: open the database file in the task folder – the **ER diagram** tab shows how the tables are connected.`,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei Doppelstunden.

**Voraussetzungen:** S3 und S4 (Aufgabe 5 gruppiert über eine Verknüpfung).

**Idee:** Die Lernenden arbeiten mit einer normalisierten Datenbank und erleben, warum Daten auf mehrere Tabellen verteilt werden (keine Wiederholungen, keine Widersprüche) – und wie man sie wieder zusammenführt. Klonk erzeugt aus der Datenbank ein **ER-Diagramm** (Datenbankdatei öffnen, Tab „ER-Diagramm“, Darstellungen Chen (1:n), Chen (min,max), Krähenfuß und Relationenschema). So lassen sich Entitätstypen, Beziehungstypen und Kardinalitäten (1:n, n:m) direkt am Beispiel besprechen.

**Schreibweise:** Klonk verlangt keine bestimmte Syntax. Die in bayerischen Lehrplänen und Schulbüchern verbreitete Form – Kreuzprodukt der Tabellen in \`FROM\` (durch Komma getrennt) und Verbundbedingung in \`WHERE\` – ist ebenso richtig wie \`JOIN … ON\`. Es bietet sich an, zuerst das Kreuzprodukt ohne Bedingung auszuführen (jede Zeile mit jeder) und daran zu zeigen, was die Bedingung bewirkt. Für \`LEFT JOIN\` (Aufgaben 4 und 5) gibt es in der Komma-Schreibweise keine direkte Entsprechung; Aufgabe 4 lässt sich alternativ mit \`NOT IN\` und einer Unterabfrage lösen (S7).

**Begriffe:** Primärschlüssel, Fremdschlüssel, zusammengesetzter Schlüssel (\`teilnahmen\`), Beziehung, Kardinalität, Zwischentabelle (Beziehungsrelation), Verbund (Join).

**Typische Schwierigkeiten:**
- Verknüpfungsbedingung vergessen – das Kreuzprodukt liefert viel zu viele Zeilen
- mehrdeutige Spaltennamen (\`name\` in \`klassen\` und \`ags\`) – Fehler „ambiguous column name“
- bei n:m die Zwischentabelle überspringen und \`schueler.id = ags.id\` vergleichen
- \`COUNT(*)\` statt \`COUNT(teilnahmen.ag_id)\` nach \`LEFT JOIN\` zählt AGs ohne Mitglieder als 1

**Differenzierung:** Aufgabe 3 kann zunächst in zwei Schritten gelöst werden (erst die ID der AG nachschlagen). Schnelle Lernende ergänzen in Aufgabe 3 die Klasse (vier Tabellen) oder zeichnen das ER-Diagramm vor dem Öffnen selbst.

**Weiterführend:** S6 legt solche Tabellen mit Primär- und Fremdschlüsseln selbst an, S7 behandelt Unterabfragen.`,
    en: `**Time needed:** two double lessons.

**Prerequisites:** S3 and S4 (task 5 groups over a join).

**Idea:** Students work with a normalised database and experience why data is spread over several tables (no repetition, no contradictions) – and how to bring it back together. Klonk generates an **ER diagram** from the database (open the database file, tab “ER diagram”, notations Chen (1:n), Chen (min,max), crow’s foot and relational schema). Entity types, relationship types and cardinalities (1:n, n:m) can be discussed directly with the example.

**Notation:** Klonk does not require a particular syntax. The form common in Bavarian curricula and textbooks – cross product of the tables in \`FROM\` (separated by commas) and join condition in \`WHERE\` – is just as correct as \`JOIN … ON\`. It is worth running the cross product without a condition first (every row with every row) and showing what the condition does. For \`LEFT JOIN\` (tasks 4 and 5) there is no direct equivalent in the comma notation; task 4 can alternatively be solved with \`NOT IN\` and a subquery (S7).

**Terms:** primary key, foreign key, composite key (\`memberships\`), relationship, cardinality, junction table, join.

**Typical difficulties:**
- forgetting the join condition – the cross product returns far too many rows
- ambiguous column names (\`name\` in \`classes\` and \`clubs\`) – error “ambiguous column name”
- skipping the junction table for n:m and comparing \`students.id = clubs.id\`
- \`COUNT(*)\` instead of \`COUNT(memberships.club_id)\` after \`LEFT JOIN\` counts clubs without members as 1

**Differentiation:** Task 3 can first be solved in two steps (look up the club’s ID first). Fast learners add the class in task 3 (four tables) or draw the ER diagram themselves before opening it.

**Next:** S6 creates such tables with primary and foreign keys, S7 covers subqueries.`,
  },
  tasks: [
    {
      id: 'classes',
      title: { de: 'Wer in welche Klasse geht', en: 'Who is in which class' },
      text: {
        de: 'Gib für alle Lernenden den Vornamen und den **Namen** ihrer Klasse (z. B. `7a`) aus – nicht die Nummer `klasse_id`.',
        en: 'For all students, output the first name and the **name** of their class (e.g. `7a`) – not the number `class_id`.',
      },
      hints: [
        { de: 'Der Name der Klasse steht in `klassen`. `JOIN klassen ON schueler.klasse_id = klassen.id` holt zu jeder Zeile die passende Klasse.', en: 'The name of the class is in `classes`. `JOIN classes ON students.class_id = classes.id` fetches the matching class for each row.' },
      ],
      worlds: [],
      databases: school,
      solution: {
        de: 'SELECT schueler.vorname, klassen.name\nFROM schueler\nJOIN klassen ON schueler.klasse_id = klassen.id',
        en: 'SELECT students.first_name, classes.name\nFROM students\nJOIN classes ON students.class_id = classes.id',
      },
      check: { result: 'unordered' },
    },
    {
      id: 'form-teacher',
      title: { de: 'Klasse von Frau Okafor', en: 'Ms Okafor’s class' },
      text: {
        de: 'Frau Okafor ist Klassenleiterin. Wer ist in ihrer Klasse? Gib die Vornamen alphabetisch sortiert aus. Welche Klasse sie leitet, ist in jedem Datensatz anders.',
        en: 'Ms Okafor is a form teacher. Who is in her class? Output the first names sorted alphabetically. Which class she leads differs in every data set.',
      },
      hints: [
        { de: 'Verknüpfe `schueler` und `klassen` wie in Aufgabe 1 und filtere dann mit `WHERE klassen.lehrkraft = \'Frau Okafor\'`.', en: 'Join `students` and `classes` as in task 1 and then filter with `WHERE classes.teacher = \'Ms Okafor\'`.' },
      ],
      worlds: [],
      databases: school,
      solution: {
        de: 'SELECT s.vorname\nFROM schueler s\nJOIN klassen k ON s.klasse_id = k.id\nWHERE k.lehrkraft = \'Frau Okafor\'\nORDER BY s.vorname',
        en: 'SELECT s.first_name\nFROM students s\nJOIN classes c ON s.class_id = c.id\nWHERE c.teacher = \'Ms Okafor\'\nORDER BY s.first_name',
      },
      check: { result: 'ordered' },
    },
    {
      id: 'robotics',
      title: { de: 'Die Robotik-AG', en: 'The robotics club' },
      text: {
        de: 'Wer ist in der AG `Robotik`? Gib die Vornamen der Mitglieder alphabetisch sortiert aus.',
        en: 'Who is in the club `Robotics`? Output the first names of the members sorted alphabetically.',
      },
      hints: [
        { de: 'Lernende und AGs hängen nur über `teilnahmen` zusammen: `schueler` → `teilnahmen` → `ags`, also zwei `JOIN`s.', en: 'Students and clubs are only connected via `memberships`: `students` → `memberships` → `clubs`, so two `JOIN`s.' },
        { de: '`JOIN teilnahmen t ON t.schueler_id = s.id JOIN ags a ON a.id = t.ag_id`', en: '`JOIN memberships m ON m.student_id = s.id JOIN clubs c ON c.id = m.club_id`' },
      ],
      worlds: [],
      databases: school,
      solution: {
        de: 'SELECT s.vorname\nFROM schueler s\nJOIN teilnahmen t ON t.schueler_id = s.id\nJOIN ags a ON a.id = t.ag_id\nWHERE a.name = \'Robotik\'\nORDER BY s.vorname',
        en: 'SELECT s.first_name\nFROM students s\nJOIN memberships m ON m.student_id = s.id\nJOIN clubs c ON c.id = m.club_id\nWHERE c.name = \'Robotics\'\nORDER BY s.first_name',
      },
      check: { result: 'ordered' },
    },
    {
      id: 'no-club',
      title: { de: 'Ohne AG', en: 'Without a club' },
      text: {
        de: 'Die Schule möchte alle zu einer AG einladen, die noch in **keiner** sind. Gib ihre Vornamen aus.',
        en: 'The school wants to invite everyone who is not in **any** club yet. Output their first names.',
      },
      hints: [
        { de: '`schueler LEFT JOIN teilnahmen` behält alle Lernenden – auch die ohne Teilnahme. Bei ihnen ist `teilnahmen.ag_id` NULL.', en: '`students LEFT JOIN memberships` keeps all students – including those without a membership. For them `memberships.club_id` is NULL.' },
      ],
      worlds: [],
      databases: school,
      solution: {
        de: 'SELECT s.vorname\nFROM schueler s\nLEFT JOIN teilnahmen t ON t.schueler_id = s.id\nWHERE t.ag_id IS NULL',
        en: 'SELECT s.first_name\nFROM students s\nLEFT JOIN memberships m ON m.student_id = s.id\nWHERE m.club_id IS NULL',
      },
      check: { result: 'unordered' },
    },
    {
      id: 'club-sizes',
      title: { de: 'Wie groß ist jede AG', en: 'How big is each club' },
      text: {
        de: 'Gib für **jede** AG ihren Namen und die Zahl ihrer Mitglieder aus – auch AGs ohne Mitglieder (mit 0). Sortiere nach der Zahl der Mitglieder, die größte AG zuerst; bei gleicher Zahl alphabetisch nach dem Namen der AG.',
        en: 'For **every** club, output its name and the number of its members – including clubs without members (with 0). Sort by the number of members, the biggest club first; for equal numbers alphabetically by the name of the club.',
      },
      hints: [
        { de: 'Beginne bei `ags` und hänge `teilnahmen` per `LEFT JOIN` an, dann `GROUP BY` je AG.', en: 'Start with `clubs` and attach `memberships` with a `LEFT JOIN`, then `GROUP BY` per club.' },
        { de: '`COUNT(*)` zählt auch die NULL-Zeile einer leeren AG mit. `COUNT(t.schueler_id)` zählt nur echte Mitglieder.', en: '`COUNT(*)` also counts the NULL row of an empty club. `COUNT(m.student_id)` counts only real members.' },
      ],
      worlds: [],
      databases: school,
      solution: {
        de: 'SELECT a.name, COUNT(t.schueler_id) AS mitglieder\nFROM ags a\nLEFT JOIN teilnahmen t ON t.ag_id = a.id\nGROUP BY a.id, a.name\nORDER BY mitglieder DESC, a.name',
        en: 'SELECT c.name, COUNT(m.student_id) AS members\nFROM clubs c\nLEFT JOIN memberships m ON m.club_id = c.id\nGROUP BY c.id, c.name\nORDER BY members DESC, c.name',
      },
      check: { result: 'ordered' },
    },
  ],
}
