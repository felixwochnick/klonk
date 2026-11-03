import type { SyntaxNode } from '@lezer/common'
import { parser } from '@lezer/javascript'
import type { Outline, Routine, StructBlock, UmlAttribute, UmlClass, UmlMethod, UmlParameter, Visibility } from '../model'
import { children, compact, Source, unparen, walk } from '../source'

const SKIP = new Set(['{', '}', ';', 'LineComment', 'BlockComment', '⚠', 'ImportDeclaration', 'FunctionDeclaration', 'ClassDeclaration', 'InterfaceDeclaration', 'TypeAliasDeclaration', 'EnumDeclaration'])
const tsParser = parser.configure({ dialect: 'ts' })

/** JavaScript/TypeScript: Klassen (Klassendiagramm), Funktionen/Methoden und Hauptprogramm (Struktogramme) – fehlertolerant (Lezer) */
export function javascriptOutline(text: string, path?: string, typescript = false): Outline {
  const src = new Source(text)
  const tree = (typescript ? tsParser : parser).parse(text)
  const top = tree.topNode
  const namespace = path ? path.replace(/\.[jt]s$/, '') : undefined

  // Eigene Funktionen/Methoden ⇒ Aufrufe erscheinen im Struktogramm als Unterprogrammaufruf
  const own = new Set<string>()
  tree.iterate({
    enter(ref) {
      if (ref.name === 'FunctionDeclaration') own.add(src.of(ref.node.getChild('VariableDefinition')))
      else if (ref.name === 'MethodDeclaration') own.add(src.of(ref.node.getChild('PropertyDefinition')))
      else if (ref.name === 'VariableDeclaration' && (ref.node.getChild('ArrowFunction') || ref.node.getChild('FunctionExpression'))) own.add(src.of(ref.node.getChild('VariableDefinition')))
    },
  })

  const classes: UmlClass[] = []
  const routines: Routine[] = []

  const typeText = (node: SyntaxNode | null | undefined) => (node ? compact(src.slice(node.from, node.to).replace(/^\s*:\s*/, '')) || undefined : undefined)
  const keywords = (node: SyntaxNode) => new Set(children(node).map(c => (c.name === 'Privacy' ? src.slice(c.from, c.to) : c.name)))
  const visibility = (words: Set<string>, name: string): Visibility =>
    name.startsWith('#') || words.has('private') ? 'private' : words.has('protected') ? 'protected' : 'public'

  function params(list: SyntaxNode | null) {
    const result: (UmlParameter & { property?: Visibility })[] = []
    let inDefault = false
    let privacy: string | null = null
    for (const child of list ? children(list) : []) {
      if (child.name === ',') {
        inDefault = false
        privacy = null
      }
      else if (child.name === 'Equals') {
        inDefault = true
      }
      else if (child.name === 'Privacy' || child.name === 'readonly') {
        privacy = child.name === 'readonly' ? privacy ?? 'public' : src.slice(child.from, child.to)
      }
      else if ((child.name === 'VariableDefinition' || child.name === 'Spread') && !inDefault) {
        const spread = child.name === 'Spread'
        result.push({ name: spread ? '...' : src.of(child), property: privacy ? (privacy as Visibility) : undefined })
      }
      else if (child.name === 'VariableDefinition' && result.at(-1)?.name === '...') {
        result.at(-1)!.name += src.of(child)
      }
      else if (child.name === 'TypeAnnotation' && !inDefault && result.length) {
        result.at(-1)!.type = typeText(child)
      }
    }
    return result
  }

  const signature = (name: string, list: UmlParameter[], returns?: string) =>
    `${name}(${list.map(p => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ')})${returns ? `: ${returns}` : ''}`

  /** Typ eines zugewiesenen Werts erraten (für `this.x = …` ohne Typangabe) */
  function guessType(value: SyntaxNode | null | undefined, paramTypes: Map<string, string | undefined>) {
    if (!value) return undefined
    switch (value.name) {
      case 'Number': return 'number'
      case 'String':
      case 'TemplateString': return 'string'
      case 'BooleanLiteral': return 'boolean'
      case 'ArrayExpression': return 'Array'
      case 'VariableName': return paramTypes.get(src.slice(value.from, value.to))
      case 'NewExpression': return src.of(value.getChild('VariableName') ?? value.getChild('MemberExpression')) || undefined
      default: return undefined
    }
  }

  function classDeclaration(node: SyntaxNode) {
    const name = src.of(node.getChild('VariableDefinition') ?? node.getChild('TypeDefinition'))
    if (!name) return
    const kids = children(node)
    const after = (keyword: string) => {
      const index = kids.findIndex(k => k.name === keyword)
      if (index < 0) return []
      const result: string[] = []
      for (const kid of kids.slice(index + 1)) {
        if (['ClassBody', 'ObjectType', 'implements', 'extends'].includes(kid.name)) break
        if (kid.name !== ',') result.push(src.of(kid))
      }
      return result
    }
    const isInterface = node.name === 'InterfaceDeclaration'
    const cls: UmlClass = {
      name,
      kind: isInterface ? 'interface' : 'class',
      isAbstract: kids.some(k => k.name === 'abstract') || undefined,
      namespace,
      attributes: [],
      methods: [],
      extends: after('extends'),
      implements: after('implements'),
      path,
      line: src.line(node.from),
    }
    classes.push(cls)
    const seen = new Set<string>()
    const addAttribute = (attribute: UmlAttribute) => {
      if (seen.has(attribute.name)) return
      seen.add(attribute.name)
      cls.attributes.push(attribute)
    }

    const body = node.getChild('ClassBody') ?? node.getChild('ObjectType')
    for (const member of body ? children(body) : []) {
      const line = src.line(member.from)
      const words = keywords(member)
      const nameNode = member.getChild('PropertyDefinition') ?? member.getChild('PrivatePropertyDefinition')
      const memberName = src.of(nameNode)
      if (member.name === 'PropertyDeclaration' || member.name === 'PropertyType') {
        const value = member.getChild('Equals')?.nextSibling
        addAttribute({ name: memberName, type: typeText(member.getChild('TypeAnnotation')) ?? guessType(value, new Map()), visibility: visibility(words, memberName), isStatic: words.has('static') || undefined, isFinal: words.has('readonly') || undefined, line })
      }
      else if (member.name === 'MethodDeclaration' || member.name === 'MethodType') {
        const constructor = memberName === 'constructor'
        const all = params(member.getChild('ParamList'))
        const returnType = constructor ? undefined : typeText(member.getChild('TypeAnnotation'))
        // Getter erscheinen als Attribut, Setter gehören dazu
        if (words.has('get') || words.has('set')) {
          if (words.has('get')) addAttribute({ name: memberName, type: returnType, visibility: visibility(words, memberName), isStatic: words.has('static') || undefined, line })
          continue
        }
        const list = all.map(({ name, type }) => ({ name, type }))
        const block = member.getChild('Block')
        cls.methods.push({
          name: memberName,
          params: list,
          returnType,
          visibility: visibility(words, memberName),
          isStatic: words.has('static') || undefined,
          isAbstract: words.has('abstract') || (isInterface ? true : undefined),
          isConstructor: constructor || undefined,
          line,
        } satisfies UmlMethod)
        if (!block) continue
        routines.push({
          id: `${name}.${memberName}:${line}`,
          kind: constructor ? 'constructor' : 'method',
          name: memberName,
          signature: signature(memberName, list, returnType),
          className: name,
          line,
          body: statements(block),
        })
        // TypeScript-Parametereigenschaften (`constructor(private name: string)`) und `this.x = …`
        for (const param of all) if (param.property) addAttribute({ name: param.name, type: param.type, visibility: param.property, line })
        const paramTypes = new Map(all.map(p => [p.name, p.type]))
        walk(block, (assign) => {
          if (assign.name !== 'AssignmentExpression') return
          const target = assign.firstChild
          if (target?.name !== 'MemberExpression' || target.firstChild?.name !== 'this') return
          const attrName = src.of(target.getChild('PropertyName') ?? target.getChild('PrivatePropertyName'))
          if (attrName) addAttribute({ name: attrName, type: guessType(assign.getChild('Equals')?.nextSibling, paramTypes), visibility: visibility(new Set(), attrName), line: src.line(assign.from) })
        })
      }
    }
  }

  function enumDeclaration(node: SyntaxNode) {
    const name = src.of(node.getChild('TypeDefinition'))
    if (!name) return
    const values = (node.getChild('EnumBody')?.getChildren('PropertyName') ?? []).map(n => src.of(n))
    classes.push({ name, kind: 'enum', namespace, attributes: [], methods: [], enumValues: values, extends: [], implements: [], path, line: src.line(node.from) })
  }

  /** Funktion aus `function f() {}` bzw. `const f = () => …` */
  function functionRoutine(name: string, fn: SyntaxNode, line: number) {
    const list = params(fn.getChild('ParamList')).map(({ name, type }) => ({ name, type }))
    const block = fn.getChild('Block')
    const body = block ? statements(block) : [{ kind: 'exit', text: `return ${src.of(fn.lastChild)}`, line } satisfies StructBlock]
    routines.push({ id: `${name}:${line}`, kind: 'function', name, signature: signature(name, list, typeText(fn.getChild('TypeAnnotation'))), line, body })
  }

  function statements(node: SyntaxNode | null | undefined): StructBlock[] {
    if (!node) return []
    if (node.name === 'Block') return children(node).flatMap(statement)
    return statement(node)
  }

  const bodyAfter = (node: SyntaxNode, after: SyntaxNode | null, before?: SyntaxNode | null) =>
    children(node).find(c => after && c.from >= after.to && (!before || c.to <= before.from) && !SKIP.has(c.name) && c.name !== 'else')
  const actionText = (node: SyntaxNode) => src.of(node).replace(/;$/, '')

  function statement(node: SyntaxNode): StructBlock[] {
    if (SKIP.has(node.name)) {
      if (node.name === 'FunctionDeclaration') functionRoutine(src.of(node.getChild('VariableDefinition')), node, src.line(node.from))
      return []
    }
    const line = src.line(node.from)
    switch (node.name) {
      case 'Block':
        return statements(node)
      case 'IfStatement': {
        const condition = node.getChild('ParenthesizedExpression')
        const elseKeyword = node.getChild('else')
        return [{ kind: 'if', condition: unparen(src.of(condition)), then: statements(bodyAfter(node, condition, elseKeyword)), else: statements(elseKeyword ? bodyAfter(node, elseKeyword) : null), line }]
      }
      case 'WhileStatement': {
        const condition = node.getChild('ParenthesizedExpression')
        const cond = unparen(src.of(condition))
        return [{ kind: 'loop', test: cond === 'true' ? 'none' : 'pre', header: `while (${cond})`, body: statements(bodyAfter(node, condition)), line }]
      }
      case 'DoStatement': {
        const condition = node.getChild('ParenthesizedExpression')
        const body = children(node).find(c => c.name !== 'do' && !SKIP.has(c.name))
        return [{ kind: 'loop', test: 'post', header: `while (${unparen(src.of(condition))})`, body: statements(body), line }]
      }
      case 'ForStatement': {
        const spec = node.getChild('ForSpec') ?? node.getChild('ForOfSpec') ?? node.getChild('ForInSpec')
        return [{ kind: 'loop', test: 'pre', header: `for ${src.of(spec)}`, body: statements(bodyAfter(node, spec)), line }]
      }
      case 'SwitchStatement':
        return [switchBlock(node, line)]
      case 'TryStatement': {
        const result: StructBlock[] = [{ kind: 'block', header: 'try', body: statements(node.getChild('Block')), line }]
        const catchClause = node.getChild('CatchClause')
        if (catchClause) {
          const param = children(catchClause).filter(c => c.name !== 'catch' && c.name !== 'Block').map(c => src.of(c)).join('')
          result.push({ kind: 'block', header: compact(`catch ${param}`), body: statements(catchClause.getChild('Block')), line: src.line(catchClause.from) })
        }
        const finallyClause = node.getChild('FinallyClause')
        if (finallyClause) result.push({ kind: 'block', header: 'finally', body: statements(finallyClause.getChild('Block')), line: src.line(finallyClause.from) })
        return result
      }
      case 'LabeledStatement':
        return children(node).filter(c => c.name !== 'Label' && c.name !== ':').flatMap(statement)
      case 'ReturnStatement':
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'ThrowStatement':
        return [{ kind: 'exit', text: actionText(node), line }]
      case 'ExportDeclaration':
        return children(node).flatMap(child => (child.name === 'ClassDeclaration' ? (classDeclaration(child), []) : statement(child)))
      case 'VariableDeclaration': {
        // `const f = () => …` ist eine Funktion, kein Schritt des Hauptprogramms
        const fn = node.getChild('ArrowFunction') ?? node.getChild('FunctionExpression')
        if (fn && node.getChildren('VariableDefinition').length === 1) {
          functionRoutine(src.of(node.getChild('VariableDefinition')), fn, line)
          return []
        }
        return [{ kind: 'action', text: actionText(node), line }]
      }
      case 'ExpressionStatement': {
        let call = node.firstChild
        if (call?.name === 'AwaitExpression') call = call.lastChild
        if (call?.name === 'CallExpression') {
          const callee = call.firstChild
          const name = callee?.name === 'VariableName'
            ? src.of(callee)
            : callee?.name === 'MemberExpression' && callee.firstChild?.name === 'this' ? src.of(callee.getChild('PropertyName')) : ''
          if (own.has(name)) return [{ kind: 'call', text: actionText(node), line }]
        }
        return [{ kind: 'action', text: actionText(node), line }]
      }
      default:
        return [{ kind: 'action', text: actionText(node), line }]
    }
  }

  function switchBlock(node: SyntaxNode, line: number): StructBlock {
    const cases: { label: string | null, body: StructBlock[] }[] = []
    let labels: (string | null)[] = []
    let body: StructBlock[] | null = null
    const flush = () => {
      if (!labels.length) return
      const last = body?.at(-1)
      if (last?.kind === 'exit' && /^break\b/.test(last.text)) body!.pop()
      cases.push({ label: labels.includes(null) ? null : labels.join(', '), body: body ?? [] })
      labels = []
      body = null
    }
    for (const child of children(node.getChild('SwitchBody') ?? node)) {
      if (child.name === 'CaseLabel' || child.name === 'DefaultLabel') {
        if (body) flush()
        labels.push(child.name === 'DefaultLabel' ? null : compact(children(child).filter(c => c.name !== 'case' && c.name !== ':').map(c => src.of(c)).join(' ')))
      }
      else if (!SKIP.has(child.name)) {
        (body ??= []).push(...statement(child))
      }
    }
    flush()
    cases.sort((a, b) => Number(a.label === null) - Number(b.label === null))
    return { kind: 'switch', subject: unparen(src.of(node.getChild('ParenthesizedExpression'))), cases, line }
  }

  // Oberste Ebene: Klassen, Funktionen und das Hauptprogramm (alles Übrige)
  const main: StructBlock[] = []
  for (const node of children(top)) {
    const declaration = node.name === 'ExportDeclaration' ? children(node).find(c => c.name !== 'export' && c.name !== 'default') ?? node : node
    if (declaration.name === 'ClassDeclaration' || declaration.name === 'InterfaceDeclaration') classDeclaration(declaration)
    else if (declaration.name === 'EnumDeclaration') enumDeclaration(declaration)
    else if (declaration.name === 'FunctionDeclaration') functionRoutine(src.of(declaration.getChild('VariableDefinition')), declaration, src.line(declaration.from))
    else main.push(...statement(declaration))
  }
  if (main.length) routines.unshift({ id: 'main', kind: 'main', name: '', signature: '', line: main[0]!.line, body: main })
  // Hauptprogramm zuerst, dann in Reihenfolge der Datei
  routines.sort((a, b) => (a.kind === 'main' ? -1 : b.kind === 'main' ? 1 : a.line - b.line))
  return { routines, classes }
}
