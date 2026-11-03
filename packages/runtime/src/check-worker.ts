/// <reference lib="webworker" />
import { createChecker, type FromChecker, type ToChecker } from './check'

// Sprachdienst im Hintergrund, während im Editor getippt wird (eigener Worker – der Ausführungs-Worker
// ist während eines Laufs blockiert). Je Art und Sprache zählt nur die neueste Anfrage.
const checker = createChecker()
const pending = new Map<string, ToChecker>()
let busy = false

self.onmessage = (event: MessageEvent<ToChecker>) => {
  const request = event.data
  const key = `${request.type}:${request.language}`
  const replaced = pending.get(key)
  // Verdrängte Anfrage beantworten, damit niemand ewig wartet
  if (replaced) self.postMessage({ id: replaced.id, unavailable: true } satisfies FromChecker)
  pending.set(key, request)
  void work()
}

async function work() {
  if (busy) return
  busy = true
  try {
    // Vorschläge und Erklärungen zuerst – darauf wartet jemand beim Tippen
    for (let next = first(); next; next = first()) {
      pending.delete(`${next.type}:${next.language}`)
      let reply: FromChecker
      try {
        if (next.type === 'complete') reply = { id: next.id, items: await checker.complete(next) }
        else if (next.type === 'hover') reply = { id: next.id, hover: await checker.hover(next) }
        else if (next.type === 'outline') reply = { id: next.id, outline: await checker.outline(next.source, next.files) }
        else reply = { id: next.id, diagnostics: await checker.check(next.language, next.source, next.files) }
      }
      catch (error) {
        // Laufzeit nicht ladbar (offline, C#-Host nicht gebaut …) – dann eben ohne
        console.warn('Klonk-Sprachdienst:', error)
        reply = { id: next.id, unavailable: true }
      }
      self.postMessage(reply)
    }
  }
  finally {
    busy = false
  }
}

function first() {
  const all = [...pending.values()]
  return all.find(r => r.type === 'complete' || r.type === 'hover') ?? all[0]
}
