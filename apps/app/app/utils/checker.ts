import type { CheckDiagnostic, CheckLanguage, FromChecker } from '@klonk/runtime'
import CheckWorker from '@klonk/runtime/check-worker?worker'

// Ein gemeinsamer Prüf-Worker für alle Editoren (lädt Pyodide/javac/Roslyn erst bei Bedarf)
let worker: Worker | undefined
let nextId = 0
const waiting = new Map<number, (diagnostics: CheckDiagnostic[] | null) => void>()

/** Syntax-/Compilerfehler ohne Ausführen; `null`, wenn die Sprache gerade nicht prüfbar ist (z. B. offline) */
export function checkProgram(language: CheckLanguage, source: string, files: Record<string, string> = {}) {
  if (!worker) {
    worker = new CheckWorker()
    worker.onmessage = (event: MessageEvent<FromChecker>) => {
      const reply = event.data
      waiting.get(reply.id)?.('diagnostics' in reply ? reply.diagnostics : null)
      waiting.delete(reply.id)
    }
  }
  const id = ++nextId
  // Der Worker beantwortet je Sprache nur die neueste Anfrage – ältere gelten als erledigt
  for (const [pendingId, resolve] of waiting) {
    resolve(null)
    waiting.delete(pendingId)
  }
  return new Promise<CheckDiagnostic[] | null>((resolve) => {
    waiting.set(id, resolve)
    worker!.postMessage({ id, language, source, files: { ...files } })
  })
}

export const CHECKED_LANGUAGES: readonly string[] = ['python', 'java', 'csharp'] satisfies CheckLanguage[]
