import type { ClassModel, UmlClass, UmlRelation } from './model'

/** Klassen der Klonk-Bibliothek – erscheinen im Klassendiagramm, wenn eigene Klassen sie nutzen */
const LIBRARY = new Set(['Klonk', 'Database', 'Row'])

/** Listen, Mengen, Wörterbücher und Arrays ⇒ Multiplizität `*` */
const COLLECTION = /\[\]|^(?:[\w.]+\.)?(?:List|ArrayList|LinkedList|Set|HashSet|TreeSet|SortedSet|Collection|Iterable|Array|ReadonlyArray|IList|IReadOnlyList|IEnumerable|ICollection|ISet|Queue|Stack|Deque|ArrayDeque|Map|HashMap|TreeMap|Dictionary|IDictionary|Record|list|set|frozenset|tuple|dict|Sequence|MutableSequence|Mapping)\b/

/** Einfacher Klassenname: `java.util.List<X>` ⇒ `List`, `a.b.C` ⇒ `C` */
export function baseName(type: string) {
  return type.replace(/<.*$/s, '').replace(/\[.*$/s, '').trim().split('.').at(-1)!.trim()
}

/** Bezeichner in einer Typangabe (`Map<String, List<Held>>` ⇒ String, Held …) */
function identifiers(type: string) {
  return type.match(/[A-Za-z_]\w*/g) ?? []
}

/**
 * Beziehungen zwischen Klassen: Vererbung, Implementierung und Assoziationen (Attribute vom Typ einer anderen Klasse).
 * Fremde Ober-/Schnittstellenklassen und Bibliotheksklassen kommen als Klassen ohne Inhalt dazu.
 */
export function classRelations(model: ClassModel): { classes: UmlClass[], relations: UmlRelation[] } {
  const classes = [...model.classes]
  const known = new Map(classes.map(c => [c.name, c]))
  const relations: UmlRelation[] = []
  const external = (name: string, kind: UmlClass['kind']) => {
    if (!known.has(name)) {
      const cls: UmlClass = { name, kind, attributes: [], methods: [], extends: [], implements: [], external: true }
      known.set(name, cls)
      classes.push(cls)
    }
  }

  for (const cls of model.classes) {
    for (const parent of cls.extends) {
      const name = baseName(parent)
      if (!name) continue
      external(name, cls.kind === 'interface' ? 'interface' : 'class')
      relations.push({ kind: 'generalization', from: cls.name, to: name })
    }
    for (const iface of cls.implements) {
      const name = baseName(iface)
      if (!name) continue
      external(name, 'interface')
      relations.push({ kind: 'realization', from: cls.name, to: name })
    }
  }

  // Assoziationen: Attribute, deren Typ eine eigene Klasse (oder Klonk/Database) enthält
  for (const cls of model.classes) {
    for (const attribute of cls.attributes) {
      if (!attribute.type) continue
      const targets = [...new Set(identifiers(attribute.type))].filter(id => (known.has(id) && !known.get(id)!.external) || LIBRARY.has(id))
      for (const target of targets) {
        if (LIBRARY.has(target)) external(target, 'class')
        relations.push({ kind: 'association', from: cls.name, to: target, role: attribute.name, multiplicity: COLLECTION.test(attribute.type.trim()) ? '*' : undefined })
      }
    }
  }
  return { classes, relations }
}

/** Klassen mehrerer Dateien zusammenführen (gleicher Name ⇒ erste Deklaration gewinnt, z. B. partielle Klassen) */
export function mergeClasses(lists: UmlClass[][]): ClassModel {
  const result = new Map<string, UmlClass>()
  for (const list of lists) for (const cls of list) if (!result.has(cls.name)) result.set(cls.name, cls)
  return { classes: [...result.values()] }
}
