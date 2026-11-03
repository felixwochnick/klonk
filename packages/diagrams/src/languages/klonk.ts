import { parse, tokenize, type Expression, type SourceRange, type Statement, type Token } from '@klonk/klonk-script'
import type { Outline, Routine, StructBlock } from '../model'
import { compact } from '../source'

/**
 * Klonk-Script (und damit Blöcke): Hauptprogramm und eigene Anweisungen/Funktionen als Struktogramme.
 * Texte stammen aus dem Quelltext (gleiche Sprache und Schreibweise wie im Editor); Klassen gibt es nicht.
 * Wirft bei Syntaxfehlern (die Oberfläche zeigt dann das letzte gültige Diagramm).
 */
export function klonkOutline(source: string): Outline {
  const program = parse(source)
  // Tokens je Zeile – für Kopfzeilen wie `wiederhole 3 mal` (ohne Kommentare und Block-Markierungen)
  const lines = new Map<number, Token[]>()
  for (const token of tokenize(source)) {
    if (token.type === 'comment' || token.type === 'newline' || token.type === 'eof') continue
    const list = lines.get(token.line) ?? []
    list.push(token)
    lines.set(token.line, list)
  }
  const sourceLines = source.split('\n')

  /** Text eines Bereichs (über mehrere Zeilen verdichtet) */
  const text = (range: SourceRange) => {
    if (range.line === range.endLine) return compact(sourceLines[range.line - 1]?.slice(range.column - 1, range.endColumn - 1) ?? '')
    const parts = [sourceLines[range.line - 1]?.slice(range.column - 1) ?? '']
    for (let l = range.line + 1; l < range.endLine; l++) parts.push(sourceLines[l - 1] ?? '')
    parts.push(sourceLines[range.endLine - 1]?.slice(0, range.endColumn - 1) ?? '')
    return compact(parts.join(' '))
  }
  /** Kopfzeile ab einer Position bis Zeilenende bzw. `;` */
  const header = (range: SourceRange) => {
    const tokens = (lines.get(range.line) ?? []).filter(t => t.column >= range.column)
    const end = tokens.findIndex(t => t.type === 'operator' && t.text === ';')
    const used = end < 0 ? tokens : tokens.slice(0, end)
    const last = used.at(-1)
    return last ? compact(sourceLines[range.line - 1]!.slice(range.column - 1, last.endColumn - 1)) : ''
  }
  const exprText = (expression: Expression) => text(expression.range)

  const own = new Set(program.body.filter(s => s.type === 'Definition').map(s => (s as { name: string }).name.toLowerCase()))

  function block(statements: Statement[]): StructBlock[] {
    return statements.flatMap(statement)
  }

  function statement(s: Statement): StructBlock[] {
    const line = s.range.line
    switch (s.type) {
      case 'If': {
        let tail = s.otherwise ? block(s.otherwise) : []
        for (let i = s.branches.length - 1; i >= 0; i--) {
          const branch = s.branches[i]!
          tail = [{ kind: 'if', condition: exprText(branch.condition), then: block(branch.body), else: tail, line: i === 0 ? line : branch.condition.range.line }]
        }
        return tail
      }
      case 'RepeatTimes':
      case 'RepeatWhile':
        // Klonk-Script prüft auch `wiederhole bis` vor jedem Durchlauf ⇒ kopfgesteuert
        return [{ kind: 'loop', test: 'pre', header: header(s.range), body: block(s.body), line }]
      case 'RepeatForever':
        return [{ kind: 'loop', test: 'none', header: header(s.range), body: block(s.body), line }]
      case 'Return':
      case 'Break':
      case 'Continue':
      case 'Stop':
        return [{ kind: 'exit', text: text(s.range), line }]
      case 'ExpressionStatement': {
        const call = s.expression
        if (call.type === 'Call' && call.callee.kind === 'user' && own.has(call.callee.name.toLowerCase())) return [{ kind: 'call', text: text(s.range), line }]
        return [{ kind: 'action', text: text(s.range), line }]
      }
      case 'Definition':
        return []
      default:
        return [{ kind: 'action', text: text(s.range), line }]
    }
  }

  const routines: Routine[] = []
  const main = block(program.body.filter(s => s.type !== 'Definition'))
  if (main.length) routines.push({ id: 'main', kind: 'main', name: '', signature: '', line: main[0]!.line, body: main })
  for (const s of program.body) {
    if (s.type !== 'Definition') continue
    routines.push({ id: `${s.name}:${s.range.line}`, kind: 'function', name: s.name, signature: header(s.range), line: s.range.line, body: block(s.body) })
  }
  return { routines, classes: [] }
}
