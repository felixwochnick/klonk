// Lädt den Java-Compiler für den Browser (teavm-javac: javac + TeaVM als WebAssembly, Apache 2.0)
// nach packages/runtime/teavm/ und prüft die SHA-256-Summen. Aufruf: node scripts/fetch-teavm-javac.ts
// Neue Version: BASE anpassen, Summen mit `sha256sum packages/runtime/teavm/*` aktualisieren und E2E testen.
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://teavm.org/playground/3/'
const FILES: Record<string, string> = {
  'compiler.wasm': '7f3828e4b7bddf5504dadebfc4016e40f4441e15ee0519071781813ba2ed3a4c',
  'compiler.wasm-runtime.js': '9ff6a6771f698be00ab9d5c7b46d904350a8d4115dc0b409553f31ed66688a55',
  'compile-classlib-teavm.bin': 'e80ae10423a39290c5f20b6bb6da34d21c3ad0a75cd8dbdda4998d2813045e15',
  'runtime-classlib-teavm.bin': 'ea670e71967eda93828cb894c1741a8ed2e94b3422eb99cb9eccec0de67daaa8',
}

const dir = join(import.meta.dirname, '../packages/runtime/teavm')
for (const [name, sha] of Object.entries(FILES)) {
  const response = await fetch(BASE + name)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  const data = Buffer.from(await response.arrayBuffer())
  const actual = createHash('sha256').update(data).digest('hex')
  if (actual !== sha) throw new Error(`${name}: Prüfsumme ${actual} statt ${sha}`)
  writeFileSync(join(dir, name), data)
  console.log(`${name} (${(data.length / 1024).toFixed(0)} KB)`)
}
