/// <reference lib="webworker" />
import { createChecker, type FromChecker, type ToChecker } from './check'

// Prüft Programme im Hintergrund, während im Editor getippt wird (eigener Worker – der Ausführungs-Worker
// ist während eines Laufs blockiert). Pro Sprache zählt nur die neueste Anfrage.
const checker = createChecker()
const pending = new Map<string, ToChecker>()
let busy = false

self.onmessage = (event: MessageEvent<ToChecker>) => {
  pending.set(event.data.language, event.data)
  void work()
}

async function work() {
  if (busy) return
  busy = true
  try {
    for (let next = first(); next; next = first()) {
      pending.delete(next.language)
      let reply: FromChecker
      try {
        reply = { id: next.id, diagnostics: await checker.check(next.language, next.source, next.files) }
      }
      catch {
        // Laufzeit nicht ladbar (offline, C#-Host nicht gebaut …) – dann eben ohne Prüfung
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
  return pending.values().next().value as ToChecker | undefined
}
