// Erzeugt Favicon und PWA-Symbole aus assets/brand/*.svg (braucht rsvg-convert und ImageMagick)
// Aufruf: node scripts/gen-icons.ts
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const brand = join(root, 'assets/brand')
const uiPublic = join(root, 'packages/ui/public')
const appIcons = join(root, 'apps/app/public/icons')
mkdirSync(uiPublic, { recursive: true })
mkdirSync(appIcons, { recursive: true })

const png = (svg: string, size: number, out: string) =>
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', out, join(brand, svg)])

// Favicon für alle Apps (Layer @klonk/ui)
copyFileSync(join(brand, 'logo.svg'), join(uiPublic, 'favicon.svg'))
png('logo.svg', 32, join(uiPublic, 'favicon-32.png'))
png('logo.svg', 16, join(uiPublic, 'favicon-16.png'))
execFileSync('magick', [join(uiPublic, 'favicon-16.png'), join(uiPublic, 'favicon-32.png'), join(uiPublic, 'favicon.ico')])
for (const size of [16, 32]) unlinkSync(join(uiPublic, `favicon-${size}.png`))
png('maskable.svg', 180, join(uiPublic, 'apple-touch-icon.png'))
// Docs (Docus, kein @klonk/ui-Layer)
for (const file of ['favicon.ico', 'favicon.svg']) copyFileSync(join(uiPublic, file), join(root, 'apps/docs/public', file))

// PWA (App)
png('logo.svg', 192, join(appIcons, 'pwa-192.png'))
png('logo.svg', 512, join(appIcons, 'pwa-512.png'))
png('maskable.svg', 512, join(appIcons, 'maskable-512.png'))
console.log('Symbole erzeugt')
