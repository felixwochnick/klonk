import type { SyntaxNode } from '@lezer/common'
import { parser } from '@lezer/python'
import type { Outline, Routine, StructBlock, UmlAttribute, UmlClass, UmlMethod, UmlParameter, Visibility } from '../model'
import { children, compact, Source, walk } from '../source'

const SKIP = new Set([':', 'Comment', '⚠', 'ImportStatement', 'FunctionDefinition', 'ClassDefinition', 'DecoratedStatement'])

/** Sichtbarkeit nach Python-Konvention: `__x` privat, `_x` geschützt */
function visibilityOf(name: string): Visibility {
  if (name.startsWith('__') && !name.endsWith('__')) return 'private'
  return name.startsWith('_') && !name.endsWith('__') ? 'protected' : 'public'
}

/** Python: Klassen (Klassendiagramm), Funktionen/Methoden und Hauptprogramm (Struktogramme) – fehlertolerant (Lezer) */
export function pythonOutline(text: string, path?: string): Outline {
  const src = new Source(text)
  const tree = parser.parse(text)
  const top = tree.topNode
  const namespace = path ? path.replace(/\.py$/, '').replace(/\//g, '.') : undefined

  // Eigene Funktionen/Methoden ⇒ Aufrufe erscheinen im Struktogramm als Unterprogrammaufruf
  const own = new Set<string>()
  tree.iterate({
    enter(node) {
      if (node.name === 'FunctionDefinition') own.add(src.of(node.node.getChild('VariableName')))
    },
  })

  const classes: UmlClass[] = []
  const routines: Routine[] = []

  /** Text nach `:`/`->` einer Typangabe */
  const typeText = (node: SyntaxNode | null | undefined) => (node ? compact(src.slice(node.from, node.to).replace(/^\s*(->|:)\s*/, '')) || undefined : undefined)

  function params(list: SyntaxNode | null): UmlParameter[] {
    const result: UmlParameter[] = []
    let inDefault = false
    let stars = ''
    for (const child of list ? children(list) : []) {
      const text = src.slice(child.from, child.to)
      if (child.name === ',') {
        inDefault = false
        stars = ''
      }
      else if (child.name === 'AssignOp') {
        inDefault = true
      }
      else if (text === '*' || text === '**') {
        stars = text
      }
      else if (child.name === 'VariableName' && !inDefault) {
        result.push({ name: stars + text })
      }
      else if (child.name === 'TypeDef' && !inDefault && result.length) {
        result.at(-1)!.type = typeText(child)
      }
    }
    return result
  }

  const signature = (name: string, list: UmlParameter[], returns?: string) =>
    `${name}(${list.map(p => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ')})${returns ? `: ${returns}` : ''}`

  /** Funktion mit Dekoratoren (`@staticmethod` …) */
  function unwrap(node: SyntaxNode) {
    if (node.name !== 'DecoratedStatement') return { node, decorators: [] as string[] }
    const decorators = node.getChildren('Decorator').map(d => src.of(d).replace(/^@/, '').replace(/\(.*$/, '').split('.').at(-1)!)
    const inner = children(node).find(c => c.name === 'FunctionDefinition' || c.name === 'ClassDefinition')
    return { node: inner ?? node, decorators }
  }

  /** Typ eines zugewiesenen Werts erraten (für `self.x = …` ohne Typangabe) */
  function guessType(value: SyntaxNode | undefined, paramTypes: Map<string, string | undefined>) {
    if (!value) return undefined
    switch (value.name) {
      case 'Number': return /[.eE]/.test(src.slice(value.from, value.to)) && !/^0x/i.test(src.slice(value.from, value.to)) ? 'float' : 'int'
      case 'String':
      case 'FormatString': return 'str'
      case 'Boolean': return 'bool'
      case 'ArrayExpression':
      case 'ArrayComprehensionExpression': return 'list'
      case 'DictionaryExpression':
      case 'DictionaryComprehensionExpression': return 'dict'
      case 'SetExpression': return 'set'
      case 'TupleExpression': return 'tuple'
      case 'VariableName': return paramTypes.get(src.slice(value.from, value.to))
      case 'CallExpression': {
        const callee = src.of(value.firstChild)
        return /^[A-Z]\w*$/.test(callee) || ['list', 'dict', 'set', 'tuple', 'str', 'int', 'float', 'bool'].includes(callee) ? callee : undefined
      }
      default: return undefined
    }
  }

  function classDefinition(node: SyntaxNode, decorators: string[]) {
    const name = src.of(node.getChild('VariableName'))
    if (!name) return
    const bases: string[] = []
    const args = node.getChild('ArgList')
    const argNodes = args ? children(args) : []
    argNodes.forEach((arg, i) => {
      // Schlüsselwortargumente (`metaclass=…`) sind keine Oberklassen
      if ((arg.name === 'VariableName' || arg.name === 'MemberExpression') && argNodes[i + 1]?.name !== 'AssignOp' && argNodes[i - 1]?.name !== 'AssignOp') bases.push(src.of(arg))
    })
    const isEnum = bases.some(b => /(^|\.)(Enum|IntEnum|StrEnum|Flag)$/.test(b))
    const cls: UmlClass = {
      name,
      kind: isEnum ? 'enum' : 'class',
      isAbstract: bases.some(b => /(^|\.)ABC$/.test(b)) || undefined,
      namespace,
      attributes: [],
      methods: [],
      extends: bases.filter(b => !/(^|\.)(ABC|object|Enum|IntEnum|StrEnum|Flag)$/.test(b)),
      implements: [],
      path,
      line: src.line(node.from),
    }
    classes.push(cls)
    const dataclass = decorators.includes('dataclass')
    const seen = new Set<string>()
    const addAttribute = (attribute: UmlAttribute) => {
      if (seen.has(attribute.name)) return
      seen.add(attribute.name)
      cls.attributes.push(attribute)
    }

    for (const member of children(node.getChild('Body') ?? node)) {
      const line = src.line(member.from)
      if (member.name === 'AssignStatement' || (member.name === 'ExpressionStatement' && member.getChild('TypeDef'))) {
        const target = member.firstChild
        if (target?.name !== 'VariableName') continue
        const attrName = src.of(target)
        const value = member.getChild('AssignOp')?.nextSibling ?? undefined
        if (isEnum) {
          (cls.enumValues ??= []).push(attrName)
          continue
        }
        // Klassenattribute sind statisch – außer in Datenklassen (dort sind es die Felder der Objekte)
        addAttribute({ name: attrName, type: typeText(member.getChild('TypeDef')) ?? guessType(value, new Map()), visibility: visibilityOf(attrName), isStatic: !dataclass || undefined, line })
        continue
      }
      const { node: fn, decorators: fnDecorators } = unwrap(member)
      if (fn.name === 'ClassDefinition') {
        classDefinition(fn, fnDecorators)
        continue
      }
      if (fn.name !== 'FunctionDefinition') continue
      const methodName = src.of(fn.getChild('VariableName'))
      const isStatic = fnDecorators.includes('staticmethod')
      const all = params(fn.getChild('ParamList'))
      const list = isStatic ? all : all.slice(1)
      const returnType = typeText(fn.getChild('TypeDef'))
      if (fnDecorators.includes('property')) {
        addAttribute({ name: methodName, type: returnType, visibility: visibilityOf(methodName), line })
        continue
      }
      const constructor = methodName === '__init__'
      const method: UmlMethod = {
        name: methodName,
        params: list,
        returnType,
        visibility: visibilityOf(methodName),
        isStatic: isStatic || fnDecorators.includes('classmethod') || undefined,
        isAbstract: fnDecorators.includes('abstractmethod') || undefined,
        isConstructor: constructor || undefined,
        line,
      }
      if (method.isAbstract) cls.isAbstract = true
      cls.methods.push(method)
      routines.push({
        id: `${name}.${methodName}:${line}`,
        kind: constructor ? 'constructor' : 'method',
        name: methodName,
        signature: signature(methodName, list, returnType),
        className: name,
        line,
        body: statements(fn.getChild('Body')),
      })

      // Attribute der Objekte: `self.x = …` in den Methoden
      const self = all[0]?.name
      if (!self || isStatic) continue
      const paramTypes = new Map(all.map(p => [p.name, p.type]))
      walk(fn, (assign) => {
        if (assign.name !== 'AssignStatement') return
        const target = assign.firstChild
        if (target?.name !== 'MemberExpression' || src.of(target.firstChild) !== self) return
        const attrName = src.of(target.getChild('PropertyName'))
        if (!attrName) return
        const value = assign.getChild('AssignOp')?.nextSibling ?? undefined
        addAttribute({ name: attrName, type: typeText(assign.getChild('TypeDef')) ?? guessType(value, paramTypes), visibility: visibilityOf(attrName), line: src.line(assign.from) })
      })
    }
  }

  function statements(body: SyntaxNode | null | undefined): StructBlock[] {
    if (!body) return []
    if (body.name === 'Body') return children(body).flatMap(statement)
    return statement(body)
  }

  /** Kopf bis zum Doppelpunkt vor dem Rumpf, z. B. `for i in range(3)` */
  const head = (node: SyntaxNode, from: number, body: SyntaxNode | null) => compact(src.slice(from, body?.from ?? node.to).replace(/:\s*$/, ''))

  function statement(node: SyntaxNode): StructBlock[] {
    if (SKIP.has(node.name)) return []
    const line = src.line(node.from)
    switch (node.name) {
      case 'IfStatement': {
        // if/elif/else ⇒ verschachtelte Verzweigungen
        const branches: { condition: string, body: SyntaxNode | null, line: number }[] = []
        let otherwise: SyntaxNode | null = null
        const kids = children(node)
        for (let i = 0; i < kids.length; i++) {
          const kid = kids[i]!
          if (kid.name === 'if' || kid.name === 'elif') {
            branches.push({ condition: src.of(kids[i + 1]), body: kids.slice(i + 2).find(k => k.name === 'Body') ?? null, line: src.line(kid.from) })
          }
          else if (kid.name === 'else') {
            otherwise = kids[i + 1] ?? null
          }
        }
        let tail = statements(otherwise)
        for (let i = branches.length - 1; i >= 0; i--) {
          const branch = branches[i]!
          tail = [{ kind: 'if', condition: branch.condition, then: statements(branch.body), else: tail, line: branch.line }]
        }
        return tail
      }
      case 'WhileStatement': {
        const body = node.getChild('Body')
        const condition = compact(src.slice(node.firstChild!.to, body?.from ?? node.to).replace(/:\s*$/, ''))
        return [{ kind: 'loop', test: condition === 'True' ? 'none' : 'pre', header: `while ${condition}`, body: statements(body), line }]
      }
      case 'ForStatement': {
        const body = node.getChild('Body')
        return [{ kind: 'loop', test: 'pre', header: head(node, node.from, body), body: statements(body), line }]
      }
      case 'MatchStatement': {
        const matchBody = node.getChild('MatchBody')
        const subject = compact(src.slice(node.firstChild!.to, matchBody?.from ?? node.to).replace(/:\s*$/, ''))
        const cases = (matchBody?.getChildren('MatchClause') ?? []).map((clause) => {
          const body = clause.getChild('Body')
          const label = head(clause, clause.firstChild!.to, body)
          return { label: label === '_' ? null : label, body: statements(body) }
        })
        return [{ kind: 'switch', subject, cases, line }]
      }
      case 'TryStatement':
      case 'WithStatement': {
        // try/except/else/finally: je Teil eine Gruppe mit Überschrift
        const result: StructBlock[] = []
        let start: SyntaxNode | null = null
        for (const kid of children(node)) {
          if (kid.name === 'Body') {
            result.push({ kind: 'block', header: head(node, start?.from ?? node.from, kid), body: statements(kid), line: src.line(start?.from ?? node.from) })
            start = null
          }
          else {
            start ??= kid
          }
        }
        return result
      }
      case 'ReturnStatement':
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'RaiseStatement':
        return [{ kind: 'exit', text: src.of(node), line }]
      case 'ExpressionStatement': {
        const call = node.firstChild
        if (call?.name === 'CallExpression') {
          const callee = call.firstChild
          const name = callee?.name === 'VariableName'
            ? src.of(callee)
            : callee?.name === 'MemberExpression' && /^(self|cls)$/.test(src.of(callee.firstChild)) ? src.of(callee.getChild('PropertyName')) : ''
          if (own.has(name)) return [{ kind: 'call', text: src.of(node), line }]
        }
        return [{ kind: 'action', text: src.of(node), line }]
      }
      default:
        return [{ kind: 'action', text: src.of(node), line }]
    }
  }

  // Oberste Ebene: Klassen, Funktionen und das Hauptprogramm (alles Übrige)
  const main: StructBlock[] = []
  for (const node of children(top)) {
    const { node: inner, decorators } = unwrap(node)
    if (inner.name === 'ClassDefinition') {
      classDefinition(inner, decorators)
    }
    else if (inner.name === 'FunctionDefinition') {
      const name = src.of(inner.getChild('VariableName'))
      const list = params(inner.getChild('ParamList'))
      const returnType = typeText(inner.getChild('TypeDef'))
      routines.push({ id: `${name}:${src.line(inner.from)}`, kind: 'function', name, signature: signature(name, list, returnType), line: src.line(inner.from), body: statements(inner.getChild('Body')) })
    }
    else {
      main.push(...statement(node))
    }
  }
  if (main.length) routines.unshift({ id: 'main', kind: 'main', name: '', signature: '', line: main[0]!.line, body: main })
  return { routines, classes }
}
