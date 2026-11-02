import { parse, type Node } from 'acorn'
import MagicString from 'magic-string'
import { InstrumentationError } from './instrument'

/** Namen im umgeschriebenen Modulcode */
export const IMPORT = '__klonk_import'
export const EXPORT = '__klonk_export'

type AnyNode = Node & Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * ES-Module ⇒ Skript für den Worker: `import … from "x"` wird zu `const … = __klonk_import("x")`,
 * Exporte werden zu Gettern (`__klonk_export({ name: () => name }, [() => modul für export *])`, ganz vorne –
 * Funktionen/Klassen sind dann auch bei Kreisimporten verfügbar). Ersetzungen behalten die Zeilenumbrüche ⇒ Zeilennummern bleiben gleich.
 */
export function transformModule(source: string): string {
  let ast: AnyNode
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true }) as AnyNode
  }
  catch (error) {
    const e = error as SyntaxError & { loc?: { line: number, column: number } }
    throw new InstrumentationError({ code: 'js_syntax', message: e.message.replace(/\s*\(\d+:\d+\)$/, ''), line: e.loc?.line ?? 1, column: (e.loc?.column ?? 0) + 1 })
  }

  const out = new MagicString(source)
  const getters: string[] = []
  const stars: string[] = []
  let counter = 0
  const keepLines = (node: AnyNode, text: string) => {
    const breaks = source.slice(node.start, node.end).split('\n').length - 1
    out.overwrite(node.start, node.end, text + '\n'.repeat(breaks))
  }
  const key = (node: AnyNode) => (node.type === 'Literal' ? String(node.value) : node.name as string)
  const load = (node: AnyNode) => `${IMPORT}(${JSON.stringify(node.source.value)})`

  for (const node of ast.body as AnyNode[]) {
    switch (node.type) {
      case 'ImportDeclaration': {
        const specifiers = node.specifiers as AnyNode[]
        if (!specifiers.length) {
          keepLines(node, `${load(node)};`)
          break
        }
        const module = `__klonk_m${++counter}`
        const parts = [`const ${module} = ${load(node)};`]
        const named: string[] = []
        for (const s of specifiers) {
          if (s.type === 'ImportNamespaceSpecifier') parts.push(`const ${s.local.name} = ${module};`)
          else if (s.type === 'ImportDefaultSpecifier') parts.push(`const ${s.local.name} = ${module}.default;`)
          else named.push(key(s.imported) === s.local.name ? s.local.name : `${JSON.stringify(key(s.imported))}: ${s.local.name}`)
        }
        if (named.length) parts.push(`const { ${named.join(', ')} } = ${module};`)
        keepLines(node, parts.join(' '))
        break
      }
      case 'ExportNamedDeclaration': {
        if (node.declaration) {
          // `export ` entfernen, Deklaration bleibt
          out.remove(node.start, node.declaration.start)
          const declaration = node.declaration as AnyNode
          const names = declaration.type === 'VariableDeclaration'
            ? (declaration.declarations as AnyNode[]).flatMap(d => patternNames(d.id))
            : [declaration.id.name as string]
          for (const name of names) getters.push(`${JSON.stringify(name)}: () => ${name}`)
        }
        else if (node.source) {
          const module = `__klonk_m${++counter}`
          keepLines(node, `const ${module} = ${load(node)};`)
          for (const s of node.specifiers as AnyNode[]) getters.push(`${JSON.stringify(key(s.exported))}: () => ${module}[${JSON.stringify(key(s.local))}]`)
        }
        else {
          keepLines(node, '')
          for (const s of node.specifiers as AnyNode[]) getters.push(`${JSON.stringify(key(s.exported))}: () => ${s.local.name}`)
        }
        break
      }
      case 'ExportDefaultDeclaration': {
        const declaration = node.declaration as AnyNode
        if ((declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') && declaration.id) {
          out.remove(node.start, declaration.start)
          getters.push(`default: () => ${declaration.id.name}`)
        }
        else {
          out.overwrite(node.start, declaration.start, 'const __klonk_default = ')
          getters.push('default: () => __klonk_default')
        }
        break
      }
      case 'ExportAllDeclaration': {
        const module = `__klonk_m${++counter}`
        keepLines(node, `const ${module} = ${load(node)};`)
        if (node.exported) getters.push(`${JSON.stringify(key(node.exported))}: () => ${module}`)
        else stars.push(`() => ${module}`)
        break
      }
    }
  }
  if (getters.length || stars.length) out.prepend(`${EXPORT}({ ${getters.join(', ')} }, [${stars.join(', ')}]);`)
  return out.toString()
}

function patternNames(pattern: AnyNode): string[] {
  switch (pattern.type) {
    case 'Identifier': return [pattern.name]
    case 'ObjectPattern': return (pattern.properties as AnyNode[]).flatMap(p => patternNames(p.type === 'RestElement' ? p.argument : p.value))
    case 'ArrayPattern': return (pattern.elements as AnyNode[]).filter(Boolean).flatMap(patternNames)
    case 'RestElement': return patternNames(pattern.argument)
    case 'AssignmentPattern': return patternNames(pattern.left)
    default: return []
  }
}

/** Pfad relativ zur importierenden Datei auflösen (`./a`, `../b/c`) – Endungen .ts/.js und index.* werden ergänzt */
export function resolveImport(from: string, specifier: string, files: Record<string, string>): string | null {
  const base = from.includes('/') ? from.slice(0, from.lastIndexOf('/')).split('/') : []
  const parts = [...base]
  for (const part of specifier.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.' && part) parts.push(part)
  }
  const path = parts.join('/')
  const candidates = [path, `${path}.ts`, `${path}.js`, `${path}/index.ts`, `${path}/index.js`]
  // TS-Schreibweise `./x.js` für `x.ts`
  if (/\.js$/.test(path)) candidates.push(path.replace(/\.js$/, '.ts'))
  return candidates.find(c => c in files) ?? null
}

export type ModuleNamespace = Record<string, unknown>

/** Modulobjekt mit Live-Bindungen: Getter der Exporte, `export *` wird beim Zugriff nachgeschlagen */
export function createNamespace() {
  const getters: Record<string, () => unknown> = {}
  const stars: (() => ModuleNamespace)[] = []
  const lookup = (key: string): unknown => {
    if (key in getters) return getters[key]!()
    for (const star of stars) {
      const module = star()
      if (key !== 'default' && key in module) return module[key]
    }
    return undefined
  }
  const keys = () => [...new Set([...Object.keys(getters), ...stars.flatMap(s => Object.keys(s()).filter(k => k !== 'default'))])]
  const namespace = new Proxy({} as ModuleNamespace, {
    get: (_, key) => (typeof key === 'string' ? lookup(key) : undefined),
    has: (_, key) => typeof key === 'string' && keys().includes(key),
    ownKeys: () => keys(),
    getOwnPropertyDescriptor: (_, key) => (typeof key === 'string' && keys().includes(key) ? { enumerable: true, configurable: true, value: lookup(key) } : undefined),
    set: () => false,
  })
  const register = (named: Record<string, () => unknown>, star: (() => ModuleNamespace)[] = []) => {
    Object.assign(getters, named)
    stars.push(...star)
  }
  return { namespace, register }
}
