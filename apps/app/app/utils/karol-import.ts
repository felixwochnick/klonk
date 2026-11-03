import { convertKarolProgram, decodeKarolFile } from '@klonk/klonk-script'
import { convertKarolWorld } from '@klonk/world'
import { BlocksConversionError, scriptToBlocks } from '~/utils/blocks/from-script'

/** Robot-Karol-Dateien: Programme `.kdp` ⇒ Klonk-Script oder Blöcke, Welten `.kdw` ⇒ Klonk-Welt */
export type KarolTarget = 'klonk' | 'blocks'
export type KarolHint = { code: string, params: Record<string, string | number> }
export type KarolImport = { name: string, kind: 'klonk' | 'blocks' | 'world', content: string, hints: KarolHint[] }

export const KAROL_ACCEPT = '.kdp,.kdw'
export const isKarolFile = (name: string) => /\.kd[pw]$/i.test(name)

/** Eine Datei umwandeln – `name` ohne Endung; wirft bei Welten, die sich nicht lesen lassen */
export function convertKarolFile(fileName: string, bytes: Uint8Array, target: KarolTarget): KarolImport {
  const text = decodeKarolFile(bytes)
  const name = fileName.replace(/\.kd[pw]$/i, '')
  if (/\.kdw$/i.test(fileName)) {
    const { world, warnings } = convertKarolWorld(text)
    return {
      name,
      kind: 'world',
      content: `${JSON.stringify(world, null, 2)}\n`,
      hints: warnings.map(w => ({ code: w.code, params: { count: w.count, entry: w.entry ?? '' } })),
    }
  }
  const { source, warnings } = convertKarolProgram(text)
  const hints: KarolHint[] = warnings.map(w => ({ code: w.code, params: { line: w.line, name: w.name ?? '' } }))
  if (target === 'blocks') {
    try {
      return { name, kind: 'blocks', content: JSON.stringify(scriptToBlocks(source)), hints }
    }
    catch (error) {
      // Nicht als Blöcke darstellbar (oder fehlerhaftes Programm) ⇒ Klonk-Script
      const line = error instanceof BlocksConversionError ? error.line : 0
      hints.push({ code: 'blocks', params: { line } })
    }
  }
  return { name, kind: 'klonk', content: source, hints }
}
