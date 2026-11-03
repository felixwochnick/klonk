import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { LEARN_MODULES } from '../src'
import { moduleDoc } from '../src/docs'

// Die Modulseiten der Docs entstehen aus denselben Daten wie die App – veraltete Seiten lassen den Test scheitern.
// Neu erzeugen: UPDATE_LEARN_DOCS=1 pnpm --filter @klonk/learn test
const content = fileURLToPath(new URL('../../../apps/docs/content/', import.meta.url))

for (const lang of ['de', 'en'] as const) {
  LEARN_MODULES.forEach((module, i) => {
    it(`Docs ${lang}/${module.id} sind aktuell`, () => {
      const path = `${content}${lang}/4.teaching/2.modules/${i + 2}.${module.id}.md`
      const expected = moduleDoc(module, i, lang)
      if (process.env.UPDATE_LEARN_DOCS) writeFileSync(path, expected)
      expect(readFileSync(path, 'utf8')).toBe(expected)
    })
  })
}
