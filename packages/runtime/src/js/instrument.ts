import { parse, type Node } from 'acorn'
import MagicString from 'magic-string'

/** Name der Prüfpunkt-Funktion im instrumentierten Code */
export const CHECKPOINT = '__klonk_cp'

export type InstrumentError = { code: 'js_syntax' | 'js_import', message: string, line: number, column: number }

export class InstrumentationError extends Error {
  constructor(public readonly detail: InstrumentError) {
    super(detail.message)
  }
}

type AnyNode = Node & Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Fügt vor jeder Anweisung einen Prüfpunkt ein: `__klonk_cp(zeile, () => sichtbare Variablen)`.
 * Damit hält der Debugger an Haltepunkten, im Einzelschritt und bei Pause – auch in leeren Schleifen.
 * Zeilen bleiben erhalten (nur Einfügungen), Fehler- und Haltepunktzeilen stimmen mit dem Quelltext überein.
 */
export function instrument(source: string): string {
  let ast: AnyNode
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: false }) as AnyNode
  }
  catch (error) {
    const e = error as SyntaxError & { loc?: { line: number, column: number } }
    // Importe als eigenen Fehler melden (Bibliotheken sind lizenzpflichtig und kommen mit den Projektdateien)
    if (/import|export/.test(e.message) && /^\s*(import|export)\b/m.test(source)) {
      throw new InstrumentationError({ code: 'js_import', message: e.message, line: e.loc?.line ?? 1, column: (e.loc?.column ?? 0) + 1 })
    }
    throw new InstrumentationError({ code: 'js_syntax', message: e.message.replace(/\s*\(\d+:\d+\)$/, ''), line: e.loc?.line ?? 1, column: (e.loc?.column ?? 0) + 1 })
  }

  const out = new MagicString(source)
  const scopes: string[][] = [[]]

  const visible = () => [...new Set(scopes.flat())].filter(n => !n.startsWith('__klonk'))
  const checkpoint = (line: number) => {
    const names = visible()
    // Variablen erst beim Anhalten lesen; noch nicht initialisierte (TDZ) still überspringen
    const reads = names.map(n => `try{o[${JSON.stringify(n)}]=${n}}catch{}`).join('')
    return `${CHECKPOINT}(${line},()=>{const o={};${reads}return o});`
  }

  const declare = (names: string[]) => scopes.at(-1)!.push(...names)

  function statements(list: AnyNode[]) {
    // Funktionsdeklarationen sind keine Variablen – sie erscheinen nicht in der Variablenansicht
    for (const statement of list) {
      if (statement.type === 'ExpressionStatement' && statement.directive) continue
      if (statement.type !== 'FunctionDeclaration' && statement.type !== 'EmptyStatement')
        out.appendLeft(statement.start, checkpoint(statement.loc!.start.line))
      visit(statement)
      if (statement.type === 'VariableDeclaration') declare(statement.declarations.flatMap((d: AnyNode) => patternNames(d.id)))
      if (statement.type === 'ClassDeclaration' && statement.id) declare([statement.id.name])
    }
  }

  /** Einzelne Anweisung als Rumpf (Schleife, if) – in Block mit Prüfpunkt verwandeln */
  function body(node: AnyNode, loop: boolean) {
    if (node.type === 'BlockStatement') {
      if (loop && node.body.length === 0) out.appendLeft(node.start + 1, checkpoint(node.loc!.start.line))
      visit(node)
      return
    }
    out.appendLeft(node.start, `{${checkpoint(node.loc!.start.line)}`)
    scopes.push([])
    visit(node)
    scopes.pop()
    out.appendRight(node.end, '}')
  }

  /** Methoden von Objekten (nicht statisch): `this` gehört zu den Variablen (Objektdiagramm) */
  const methods = new WeakSet<AnyNode>()

  function fn(node: AnyNode) {
    scopes.push([...(methods.has(node) ? ['this'] : []), ...(node.id && node.type === 'FunctionExpression' ? [node.id.name] : []), ...node.params.flatMap(patternNames)])
    for (const p of node.params) visit(p)
    if (node.body.type === 'BlockStatement') statements(node.body.body)
    else visit(node.body)
    scopes.pop()
  }

  function visit(node: AnyNode | null | undefined): void {
    if (!node || typeof node.type !== 'string') return
    switch (node.type) {
      case 'Program':
        statements(node.body)
        return
      case 'BlockStatement':
      case 'StaticBlock':
        scopes.push([])
        statements(node.body)
        scopes.pop()
        return
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        fn(node)
        return
      case 'IfStatement':
        visit(node.test)
        body(node.consequent, false)
        if (node.alternate) {
          if (node.alternate.type === 'IfStatement') visit(node.alternate)
          else body(node.alternate, false)
        }
        return
      case 'WhileStatement':
      case 'DoWhileStatement':
        visit(node.test)
        body(node.body, true)
        return
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement': {
        scopes.push([])
        const init = node.init ?? node.left
        if (init?.type === 'VariableDeclaration') {
          for (const d of init.declarations) visit(d.init)
          declare(init.declarations.flatMap((d: AnyNode) => patternNames(d.id)))
        }
        else visit(init)
        visit(node.test)
        visit(node.update)
        visit(node.right)
        body(node.body, true)
        scopes.pop()
        return
      }
      case 'SwitchStatement':
        visit(node.discriminant)
        for (const c of node.cases) {
          visit(c.test)
          scopes.push([])
          statements(c.consequent)
          scopes.pop()
        }
        return
      case 'TryStatement':
        visit(node.block)
        if (node.handler) {
          scopes.push(node.handler.param ? patternNames(node.handler.param) : [])
          visit(node.handler.body)
          scopes.pop()
        }
        visit(node.finalizer)
        return
      case 'LabeledStatement':
        body(node.body, false)
        return
      case 'MethodDefinition':
        if (!node.static) methods.add(node.value)
        break
    }
    // Übrige Knoten: Kinder durchlaufen (Ausdrücke können Funktionen enthalten)
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      const value = node[key]
      if (Array.isArray(value)) value.forEach(v => visit(v as AnyNode))
      else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value)
    }
  }

  visit(ast)
  return out.toString()
}

function patternNames(node: AnyNode | null): string[] {
  if (!node) return []
  switch (node.type) {
    case 'Identifier': return [node.name]
    case 'ObjectPattern': return node.properties.flatMap((p: AnyNode) => patternNames(p.type === 'RestElement' ? p.argument : p.value))
    case 'ArrayPattern': return node.elements.flatMap((e: AnyNode | null) => patternNames(e))
    case 'RestElement': return patternNames(node.argument)
    case 'AssignmentPattern': return patternNames(node.left)
    default: return []
  }
}
