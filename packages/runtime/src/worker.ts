/// <reference lib="webworker" />
import { Interpreter, KlonkError, type SourceRange, type Value } from '@klonk/klonk-script'
import { World } from '@klonk/world'
import { runJavaScript } from './js/run'
import { runCSharp } from './csharp/run'
import { runJava } from './java/run'
import { runPython } from './python/run'
import type { FromWorker, ToWorker } from './protocol'

// Führt Programme abseits der Oberfläche aus. Abbrechen = Worker beenden (worker.terminate()).
// postMessage vorher sichern – JS/TS-Nutzercode bekommt es nicht.
const postMessage = self.postMessage.bind(self)
const post = (message: FromWorker) => postMessage(message)

let breakpoints = new Set<number>()
let delay = 0
let pauseRequested = false
let stepping = false
let resume: (() => void) | undefined
let lastLine = -1
let lastLinePost = 0
let checkpoints = 0
/** Zeilenmeldungen drosseln – sonst überfluten Schleifen ohne Befehle den Hauptthread */
const LINE_INTERVAL = 50

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data
  switch (message.type) {
    case 'run':
      if (message.language === 'klonk') void run(message)
      else if (message.language === 'python') void runPython(message, post)
      else if (message.language === 'java') void runJava(message, post)
      else if (message.language === 'csharp') void runCSharp(message, post)
      else runJavaScript(message, post)
      break
    case 'pause':
      pauseRequested = true
      break
    case 'resume':
      stepping = false
      resume?.()
      break
    case 'step':
      stepping = true
      resume?.()
      break
    case 'breakpoints':
      breakpoints = new Set(message.lines)
      break
    case 'delay':
      delay = message.delay
      break
  }
}

async function checkpoint(range: SourceRange, variables: () => Record<string, Value>) {
  // Gelegentlich die Ereignisschleife freigeben, damit Pause-Nachrichten ankommen
  if (++checkpoints % 500 === 0) await sleep(0)

  const atBreakpoint = breakpoints.has(range.line) && range.line !== lastLine
  if (delay > 0 && range.line !== lastLine && performance.now() - lastLinePost >= LINE_INTERVAL) {
    post({ type: 'line', line: range.line })
    lastLinePost = performance.now()
  }
  lastLine = range.line

  if (pauseRequested || stepping || atBreakpoint) {
    const reason = pauseRequested ? 'pause' : atBreakpoint ? 'breakpoint' : 'step'
    pauseRequested = false
    post({ type: 'paused', range, variables: variables(), reason })
    await new Promise<void>((r) => {
      resume = r
    })
    resume = undefined
    post({ type: 'resumed' })
  }
}

async function run(message: Extract<ToWorker, { type: 'run' }>) {
  breakpoints = new Set(message.breakpoints)
  delay = message.delay
  stepping = !!message.pauseOnStart
  try {
    const world = new World(message.world)
    const interpreter = Interpreter.fromSource(message.source, world, {
      checkpoint,
      command: async (command) => {
        post({ type: 'command', command })
        if (delay > 0) await sleep(delay)
      },
      print: text => post({ type: 'output', text }),
      wait: seconds => sleep(seconds * 1000),
      allowImports: message.allowImports,
      resolveImport: path => message.files[path],
      designs: message.designs,
      maxCharacters: message.maxCharacters,
    }, message.characterId)
    await interpreter.run()
    post({ type: 'done' })
  }
  catch (error) {
    if (error instanceof KlonkError) {
      post({ type: 'error', error: { code: error.code, params: error.params, range: error.range } })
    }
    else {
      post({ type: 'error', error: { code: 'internal', params: { message: String((error as Error)?.message ?? error) } } })
    }
  }
}
