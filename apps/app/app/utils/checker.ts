import type { CheckDiagnostic, CheckLanguage, CompletionItem, FromChecker, HoverInfo, ToChecker } from '@klonk/runtime'
import CheckWorker from '@klonk/runtime/check-worker?worker'

// Ein gemeinsamer Sprachdienst-Worker für alle Editoren (lädt Pyodide/Jedi, javac, Roslyn erst bei Bedarf)
let worker: Worker | undefined
let nextId = 0
const waiting = new Map<number, (reply: FromChecker) => void>()

function request(message: Omit<ToChecker, 'id'>) {
  if (!worker) {
    worker = new CheckWorker()
    worker.onmessage = (event: MessageEvent<FromChecker>) => {
      waiting.get(event.data.id)?.(event.data)
      waiting.delete(event.data.id)
    }
  }
  const id = ++nextId
  return new Promise<FromChecker>((resolve) => {
    waiting.set(id, resolve)
    worker!.postMessage({ ...message, id, files: { ...message.files } })
  })
}

/** Syntax-/Compilerfehler ohne Ausführen; `null`, wenn die Sprache gerade nicht prüfbar ist (z. B. offline) */
export async function checkProgram(language: CheckLanguage, source: string, files: Record<string, string> = {}) {
  const reply = await request({ type: 'check', language, source, files })
  return 'diagnostics' in reply ? reply.diagnostics : null
}

/** Vorschläge an einer Stelle; `null` = Dienst nicht verfügbar (dann die einfachen Vorschläge) */
export async function completeProgram(message: Omit<ToChecker, 'id' | 'type'>): Promise<CompletionItem[] | null> {
  const reply = await request({ ...message, type: 'complete' })
  return 'items' in reply ? reply.items : null
}

export async function hoverProgram(message: Omit<ToChecker, 'id' | 'type'>): Promise<HoverInfo | null | undefined> {
  const reply = await request({ ...message, type: 'hover' })
  return 'hover' in reply ? reply.hover : undefined
}

export const CHECKED_LANGUAGES: readonly string[] = ['python', 'java', 'csharp'] satisfies CheckLanguage[]

/** Projektkontext je Monaco-Modell (Pfad und andere Dateien), gesetzt vom Editor */
export type ModelContext = { path?: string, files: Record<string, string> }
export const modelContexts = new Map<string, ModelContext>()

export type { CheckDiagnostic }
