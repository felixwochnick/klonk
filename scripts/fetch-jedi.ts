// Lädt Jedi (Autovervollständigung für Python, MIT) und Parso (Python-Parser, MIT) als reine Python-Wheels
// nach packages/runtime/pylibs/ und prüft die SHA-256-Summen. Aufruf: node scripts/fetch-jedi.ts
// Neue Version: Dateinamen/URLs und Summen aus https://pypi.org/pypi/<paket>/json übernehmen, E2E testen.
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FILES: Record<string, { url: string, sha256: string }> = {
  'jedi-0.20.1-py2.py3-none-any.whl': {
    url: 'https://files.pythonhosted.org/packages/be/c7/71eb0d51cdcbb63b857c931aa4e9218b078b5d9f8ecd383b234f28fe7b0f/jedi-0.20.1-py2.py3-none-any.whl',
    sha256: '0fb16d86c4a4c73c37ba518c77419975e30fcc620658a8d14fbb5720cdd34142',
  },
  'parso-0.8.7-py2.py3-none-any.whl': {
    url: 'https://files.pythonhosted.org/packages/99/5d/8268b644392ee874ee82a635cd0df1773de230bde356c38de28e298392cc/parso-0.8.7-py2.py3-none-any.whl',
    sha256: 'a8926eb2a1b915486941fdbd31e86a4baf88fe8c210f25f2f35ecec5b574ca1c',
  },
}

const dir = join(import.meta.dirname, '../packages/runtime/pylibs')
for (const [name, { url, sha256 }] of Object.entries(FILES)) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  const data = Buffer.from(await response.arrayBuffer())
  const actual = createHash('sha256').update(data).digest('hex')
  if (actual !== sha256) throw new Error(`${name}: Prüfsumme ${actual} statt ${sha256}`)
  writeFileSync(join(dir, name), data)
  console.log(`${name} (${(data.length / 1024).toFixed(0)} KB)`)
}
