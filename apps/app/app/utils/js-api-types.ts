import { BUILTINS, type Builtin, type ScriptLanguage } from '@klonk/klonk-script'

const RETURNS: Record<string, string> = { brickCount: 'number', positionX: 'number', positionY: 'number', random: 'number' }

/**
 * TypeScript-Deklarationen der Roboter-API (für Autovervollständigung und Typprüfung in Monaco).
 * Erzeugt aus denselben Tabellen wie Klonk-Script; Dokumentation in der UI-Sprache.
 */
export function robotApiDeclarations(lang: ScriptLanguage) {
  const brickColors = Object.entries(BUILTINS).filter(([, b]) => b.kind === 'constant').map(([name, b]) => [name, [...b.names.en]] as const)
  const colorType = brickColors.flatMap(([, names]) => names).map(n => `'${n}'`).join(' | ')
  const markColorType = brickColors.filter(([name]) => ['yellow', 'red', 'blue', 'green'].includes(name)).flatMap(([, names]) => names).map(n => `'${n}'`).join(' | ')

  const lines = [
    '// Roboter-API von Klonk (englische Namen)',
    `type KlonkColor = ${colorType}`,
    `type KlonkMarkColor = ${markColorType}`,
  ]

  for (const [name, builtin] of Object.entries(BUILTINS) as [string, Builtin][]) {
    const doc = `/** ${builtin.doc[lang].replace(/\*\//g, '')} */`
    for (const spelling of builtin.names.en) {
      if (builtin.kind === 'constant') {
        lines.push(doc, `declare const ${spelling}: '${name}'`)
        continue
      }
      const params = (builtin.params ?? []).map((p) => {
        const type = p.type === 'color' ? 'KlonkColor' : p.type === 'markColor' ? 'KlonkMarkColor' : p.type === 'any' ? 'unknown' : p.type
        return name === 'print' ? `...${p.name.en[0]}: unknown[]` : `${p.name.en[0]}${p.optional ? '?' : ''}: ${type}`
      })
      const returns = builtin.kind === 'sensor' ? (RETURNS[name] ?? 'boolean') : (RETURNS[name] ?? 'void')
      lines.push(doc, `declare function ${spelling}(${params.join(', ')}): ${returns}`)
    }
  }
  return lines.join('\n')
}
