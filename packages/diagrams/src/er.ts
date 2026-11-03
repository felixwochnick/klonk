import type { ErAttribute, ErEntity, ErModel, ErRelationship, SchemaTable } from './model'

/**
 * ER-Modell aus dem Schema einer Datenbank (Rückwärtsmodellierung):
 * - jede Tabelle ist eine Entität, Fremdschlüssel werden zu 1:n-Beziehungen (eindeutig ⇒ 1:1),
 * - Zwischentabellen (Primärschlüssel nur aus zwei Fremdschlüsseln) werden zu n:m-Beziehungen mit ihren übrigen Spalten als Attribute.
 * Sichten bleiben außen vor.
 */
export function erModel(schema: SchemaTable[]): ErModel {
  const tables = schema.filter(t => t.kind === 'table')
  const names = new Set(tables.map(t => t.name))
  const attributesOf = (table: SchemaTable): ErAttribute[] => {
    const foreign = new Set((table.foreignKeys ?? []).flatMap(fk => fk.columns))
    return table.columns.map(c => ({ name: c.name, type: c.type, key: c.primaryKey, foreign: foreign.has(c.name), notNull: c.notNull || c.primaryKey }))
  }

  const entities: ErEntity[] = []
  const relationships: ErRelationship[] = []
  for (const table of tables) {
    const fks = (table.foreignKeys ?? []).filter(fk => names.has(fk.table))
    const pk = table.columns.filter(c => c.primaryKey).map(c => c.name)
    const inFk = (column: string) => fks.some(fk => fk.columns.includes(column))
    // Zwischentabelle: genau zwei Fremdschlüssel, Primärschlüssel nur aus deren Spalten
    if (fks.length === 2 && pk.length >= 2 && pk.every(inFk)) {
      const [a, b] = fks as [typeof fks[0], typeof fks[0]]
      relationships.push({
        name: table.name,
        table: table.name,
        ends: [{ entity: a.table, chen: 'n', min: 0, max: 'n' }, { entity: b.table, chen: 'm', min: 0, max: 'n' }],
        attributes: attributesOf(table).filter(attr => !attr.foreign),
      })
      continue
    }
    entities.push({ name: table.name, attributes: attributesOf(table) })
    for (const fk of fks) {
      const columns = fk.columns.map(name => table.columns.find(c => c.name === name)).filter(c => !!c)
      const required = columns.length > 0 && columns.every(c => c.notNull || c.primaryKey)
      // 1:1, wenn der Fremdschlüssel eindeutig ist (UNIQUE oder genau der Primärschlüssel)
      const unique = (columns.length === 1 && !!columns[0]!.unique) || (pk.length > 0 && pk.length === fk.columns.length && pk.every(c => fk.columns.includes(c)))
      relationships.push({
        name: relationshipName(fk.columns, fk.table),
        table: table.name,
        ends: [
          { entity: table.name, chen: unique ? '1' : 'n', min: required ? 1 : 0, max: '1' },
          { entity: fk.table, chen: '1', min: 0, max: unique ? '1' : 'n' },
        ],
        attributes: [],
      })
    }
  }
  return { entities, relationships, tables }
}

/** Name der Beziehung aus dem Fremdschlüssel: `klasse_id` ⇒ `klasse`, sonst die Zieltabelle */
function relationshipName(columns: string[], target: string) {
  const name = columns.join(', ').replace(/_?id$/i, '').replace(/_$/, '')
  return name || target
}
