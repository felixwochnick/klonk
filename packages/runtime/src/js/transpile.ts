import { transform } from 'sucrase'
import { InstrumentationError } from './instrument'

/** TypeScript ⇒ JavaScript (nur Typen entfernen – Zeilennummern bleiben gleich) */
export function stripTypes(source: string): string {
  try {
    return transform(source, { transforms: ['typescript'], disableESTransforms: true, keepUnusedImports: true }).code
  }
  catch (error) {
    const e = error as Error & { loc?: { line: number, column: number } }
    throw new InstrumentationError({ code: 'js_syntax', message: e.message.replace(/\s*\(\d+:\d+\)$/, ''), line: e.loc?.line ?? 1, column: (e.loc?.column ?? 0) + 1 })
  }
}
