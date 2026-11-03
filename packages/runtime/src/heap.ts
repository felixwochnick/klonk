import type { HeapObject, HeapSnapshot, HeapValue } from '@klonk/diagrams'
import { ROBOT_DISPLAY } from './js/api'

export type { HeapSnapshot } from '@klonk/diagrams'

/** Grenzen des Speicherabbilds (Objektdiagramm bleibt lesbar, Nachricht klein) */
export const HEAP_LIMITS = { objects: 60, fields: 30, text: 60 }

const short = (text: string) => (text.length > HEAP_LIMITS.text ? `${text.slice(0, HEAP_LIMITS.text - 1)}…` : text)

function primitive(value: unknown) {
  if (typeof value === 'string') return short(JSON.stringify(value))
  if (typeof value === 'bigint') return `${value}n`
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()
  return short(String(value))
}

/**
 * Speicherabbild der JS/TS-Variablen am Haltepunkt (für das Objektdiagramm): Objekte in Breitensuche ab den Variablen,
 * gleiche Objekte = gleiche ID (geteilte Verweise und Zyklen bleiben sichtbar). Klonk-Figuren tragen ihren Namen.
 */
export function jsHeap(variables: Record<string, unknown>): HeapSnapshot {
  const ids = new Map<object, number>()
  const queue: object[] = []
  let truncated = false

  const valueOf = (value: unknown): HeapValue | null => {
    if (typeof value === 'function' || typeof value === 'symbol') return null
    if (value === null || typeof value !== 'object' || value instanceof Date || value instanceof RegExp) return { value: primitive(value) }
    let id = ids.get(value)
    if (id === undefined) {
      if (ids.size >= HEAP_LIMITS.objects) {
        truncated = true
        return { value: '…' }
      }
      id = ids.size + 1
      ids.set(value, id)
      queue.push(value)
    }
    return { ref: id }
  }

  const result: HeapSnapshot = { variables: [], objects: [] }
  for (const [name, value] of Object.entries(variables)) {
    const v = valueOf(value)
    if (v) result.variables.push([name, v])
  }

  for (let i = 0; i < queue.length; i++) {
    const object = queue[i]!
    const entry: HeapObject = { id: ids.get(object)!, className: object.constructor?.name || 'Object', fields: [] }
    const add = (name: string, value: unknown) => {
      if (entry.fields.length >= HEAP_LIMITS.fields) {
        entry.more = true
        return
      }
      const v = valueOf(value)
      if (v) entry.fields.push([name, v])
    }
    const record = object as Record<PropertyKey, unknown>
    // Klonk/Database der Bibliothek am Anzeige-Symbol erkennen – im Produktions-Build sind Klassennamen verkürzt
    const display = ROBOT_DISPLAY in object ? String((record[ROBOT_DISPLAY] as () => unknown)()) : ''
    if (display.startsWith('Klonk(')) {
      entry.className = 'Klonk'
      entry.robot = String(record.name)
      add('name', record.name)
    }
    else if (display.startsWith('Database(')) {
      entry.className = 'Database'
      add('name', record.name)
      add('engine', record.engine)
    }
    else if (Array.isArray(object)) {
      object.forEach((item, index) => add(`[${index}]`, item))
    }
    else if (object instanceof Map) {
      for (const [key, value] of object) add(`[${primitive(key)}]`, value)
    }
    else if (object instanceof Set) {
      let index = 0
      for (const value of object) add(`[${index++}]`, value)
    }
    else {
      for (const key of Object.keys(object)) add(key, record[key])
    }
    result.objects.push(entry)
  }
  if (truncated) result.truncated = true
  return result
}
