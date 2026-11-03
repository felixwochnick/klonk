/** Inhalt einer neuen Datenbank: kleines Beispiel mit Fremdschlüssel (läuft in SQLite und PostgreSQL) */
export function databaseSample(lang: 'de' | 'en') {
  return lang === 'en'
    ? `-- Example database. Change it with SQL in the console on the right – it is saved automatically.
CREATE TABLE classes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  class_id INTEGER REFERENCES classes(id)
);
INSERT INTO classes (id, name) VALUES (1, '7a'), (2, '7b');
INSERT INTO students (id, first_name, class_id) VALUES (1, 'Mia', 1), (2, 'Ben', 1), (3, 'Ali', 2);
`
    : `-- Beispiel-Datenbank. Ändern mit SQL in der Konsole rechts – sie wird automatisch gespeichert.
CREATE TABLE klassen (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE schueler (
  id INTEGER PRIMARY KEY,
  vorname TEXT NOT NULL,
  klasse_id INTEGER REFERENCES klassen(id)
);
INSERT INTO klassen (id, name) VALUES (1, '7a'), (2, '7b');
INSERT INTO schueler (id, vorname, klasse_id) VALUES (1, 'Mia', 1), (2, 'Ben', 1), (3, 'Ali', 2);
`
}

/** Inhalt einer neuen SQL-Abfrage: fragt die Welt ab (geht ohne eigene Datenbank) */
export function sqlSample(lang: 'de' | 'en') {
  return lang === 'en'
    ? `-- Choose a database above (or the world) and run with Ctrl+Enter.
SELECT name, x, y, direction FROM characters;
`
    : `-- Oben eine Datenbank (oder die Welt) wählen und mit Strg+Enter ausführen.
SELECT name, x, y, richtung FROM figuren;
`
}
