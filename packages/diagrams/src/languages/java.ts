import type { SyntaxNode } from '@lezer/common'
import { parser } from '@lezer/java'
import type { Outline, Routine, StructBlock, UmlAttribute, UmlClass, UmlClassKind, UmlMethod, UmlParameter, Visibility } from '../model'
import { children, compact, Source, unparen } from '../source'

const TYPES = new Set(['PrimitiveType', 'TypeName', 'GenericType', 'ArrayType', 'ScopedTypeName', 'void', 'AnnotatedType'])
const DECLARATIONS: Record<string, UmlClassKind> = { ClassDeclaration: 'class', InterfaceDeclaration: 'interface', EnumDeclaration: 'enum' }
const SKIP = new Set(['{', '}', ';', 'LineComment', 'BlockComment', '⚠'])

/** Java: Klassen (Klassendiagramm) und Methoden (Struktogramme) aus dem Quelltext – fehlertolerant (Lezer) */
export function javaOutline(text: string, path?: string): Outline {
  const src = new Source(text)
  const tree = parser.parse(text)
  const top = tree.topNode
  const pkg = top.getChild('PackageDeclaration')
  const namespace = pkg ? src.of(pkg.getChild('ScopedIdentifier') ?? pkg.getChild('Identifier')) || undefined : undefined

  // Eigene Methoden ⇒ Aufrufe erscheinen im Struktogramm als Unterprogrammaufruf
  const own = new Set<string>()
  tree.iterate({
    enter(node) {
      if (node.name === 'MethodDeclaration') own.add(src.of(node.node.getChild('Definition')))
    },
  })

  const classes: UmlClass[] = []
  const routines: Routine[] = []

  const modifiers = (node: SyntaxNode) => new Set(children(node.getChild('Modifiers') ?? node).map(c => c.name))
  const visibility = (mods: Set<string>, fallback: Visibility): Visibility =>
    mods.has('public') ? 'public' : mods.has('private') ? 'private' : mods.has('protected') ? 'protected' : fallback
  const typeOf = (node: SyntaxNode) => {
    const type = children(node).find(c => TYPES.has(c.name))
    return type ? src.of(type) : undefined
  }
  const params = (node: SyntaxNode | null): UmlParameter[] => (node
    ? children(node).filter(c => c.name === 'FormalParameter' || c.name === 'SpreadParameter').map((p) => {
        const type = typeOf(p)
        return { name: src.of(p.getChild('Definition')), type: p.name === 'SpreadParameter' && type ? `${type}...` : type }
      })
    : [])
  const signature = (name: string, list: UmlParameter[], returns?: string) =>
    `${name}(${list.map(p => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ')})${returns ? `: ${returns}` : ''}`

  function declaration(node: SyntaxNode) {
    const kind = DECLARATIONS[node.name]!
    const mods = modifiers(node)
    const name = src.of(node.getChild('Definition'))
    if (!name) return
    const cls: UmlClass = {
      name,
      kind,
      isAbstract: mods.has('abstract') || undefined,
      namespace,
      attributes: [],
      methods: [],
      extends: [],
      implements: [],
      path,
      line: src.line(node.from),
    }
    const superclass = node.getChild('Superclass')
    if (superclass) cls.extends.push(...children(superclass).filter(c => TYPES.has(c.name)).map(c => src.of(c)))
    // Interfaces erweitern andere Interfaces (`extends`), Klassen/Enums implementieren sie
    const interfaces = node.getChild('SuperInterfaces') ?? node.getChild('ExtendsInterfaces')
    const list = interfaces?.getChild('InterfaceTypeList')
    if (list) (kind === 'interface' ? cls.extends : cls.implements).push(...children(list).filter(c => TYPES.has(c.name)).map(c => src.of(c)))
    classes.push(cls)

    const body = node.getChild('ClassBody') ?? node.getChild('InterfaceBody') ?? node.getChild('EnumBody')
    if (!body) return
    const members = children(body).flatMap(c => (c.name === 'EnumBodyDeclarations' ? children(c) : [c]))
    const defaultVisibility: Visibility = kind === 'interface' ? 'public' : 'package'
    for (const member of members) {
      const line = src.line(member.from)
      if (member.name === 'EnumConstant') {
        (cls.enumValues ??= []).push(src.of(member.getChild('Definition')))
      }
      else if (member.name === 'FieldDeclaration' || member.name === 'ConstantDeclaration') {
        const mods = modifiers(member)
        const type = typeOf(member)
        for (const declarator of member.getChildren('VariableDeclarator')) {
          const attribute: UmlAttribute = {
            name: src.of(declarator.getChild('Definition')),
            type,
            visibility: visibility(mods, defaultVisibility),
            isStatic: mods.has('static') || kind === 'interface' || undefined,
            isFinal: mods.has('final') || kind === 'interface' || undefined,
            line,
          }
          cls.attributes.push(attribute)
        }
      }
      else if (member.name === 'MethodDeclaration' || member.name === 'ConstructorDeclaration') {
        const constructor = member.name === 'ConstructorDeclaration'
        const mods = modifiers(member)
        const methodName = src.of(member.getChild('Definition'))
        const list = params(member.getChild('FormalParameters'))
        const returnType = constructor ? undefined : typeOf(member)
        const block = member.getChild('Block') ?? member.getChild('ConstructorBody')
        const method: UmlMethod = {
          name: methodName,
          params: list,
          returnType,
          visibility: visibility(mods, defaultVisibility),
          isStatic: mods.has('static') || undefined,
          isAbstract: mods.has('abstract') || (kind === 'interface' && !block) || undefined,
          isConstructor: constructor || undefined,
          line,
        }
        cls.methods.push(method)
        if (block) {
          routines.push({
            id: `${name}.${methodName}:${line}`,
            kind: constructor ? 'constructor' : 'method',
            name: methodName,
            signature: signature(methodName, list, returnType),
            className: name,
            line,
            body: statements(block),
          })
        }
      }
      else if (member.name in DECLARATIONS) {
        declaration(member)
      }
    }
  }

  function statements(node: SyntaxNode | null | undefined): StructBlock[] {
    if (!node) return []
    if (node.name === 'Block' || node.name === 'ConstructorBody') return children(node).flatMap(statement)
    return statement(node)
  }

  /** Nächster Anweisungsknoten nach `after` (Rumpf von if/while …) */
  const bodyAfter = (node: SyntaxNode, after: SyntaxNode | null, before?: SyntaxNode) =>
    children(node).find(c => after && c.from >= after.to && (!before || c.to <= before.from) && !SKIP.has(c.name) && c.name !== 'else')

  function statement(node: SyntaxNode): StructBlock[] {
    if (SKIP.has(node.name)) return []
    const line = src.line(node.from)
    switch (node.name) {
      case 'Block':
        return statements(node)
      case 'IfStatement': {
        const condition = node.getChild('ParenthesizedExpression')
        const elseKeyword = node.getChild('else')
        const then = bodyAfter(node, condition, elseKeyword ?? undefined)
        const otherwise = elseKeyword ? bodyAfter(node, elseKeyword) : undefined
        return [{ kind: 'if', condition: unparen(src.of(condition)), then: statements(then), else: statements(otherwise), line }]
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
      case 'ForStatement':
      case 'EnhancedForStatement': {
        const spec = node.getChild('ForSpec')
        return [{ kind: 'loop', test: 'pre', header: `for ${src.of(spec)}`, body: statements(bodyAfter(node, spec)), line }]
      }
      case 'SwitchStatement':
        return [switchBlock(node, line)]
      case 'TryStatement':
      case 'TryWithResourcesStatement': {
        const resources = node.getChild('ResourceSpecification')
        const result: StructBlock[] = [{ kind: 'block', header: resources ? `try ${src.of(resources)}` : 'try', body: statements(node.getChild('Block')), line }]
        for (const clause of node.getChildren('CatchClause')) {
          result.push({ kind: 'block', header: `catch ${src.of(clause.getChild('CatchFormalParameter'))}`, body: statements(clause.getChild('Block')), line: src.line(clause.from) })
        }
        const fin = node.getChild('FinallyClause')
        if (fin) result.push({ kind: 'block', header: 'finally', body: statements(fin.getChild('Block')), line: src.line(fin.from) })
        return result
      }
      case 'SynchronizedStatement':
        return [{ kind: 'block', header: `synchronized ${src.of(node.getChild('ParenthesizedExpression'))}`, body: statements(node.getChild('Block')), line }]
      case 'LabeledStatement':
        return children(node).filter(c => c.name !== 'Identifier' && c.name !== ':').flatMap(statement)
      case 'ReturnStatement':
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'ThrowStatement':
        return [{ kind: 'exit', text: actionText(node), line }]
      case 'ExpressionStatement': {
        const call = node.firstChild
        if (call?.name === 'MethodInvocation') {
          const receiver = call.firstChild?.name === 'MethodName' ? null : call.firstChild
          const name = src.of(call.getChild('MethodName'))
          if ((!receiver || src.of(receiver) === 'this') && own.has(name)) return [{ kind: 'call', text: actionText(node), line }]
        }
        return [{ kind: 'action', text: actionText(node), line }]
      }
      // Klassen in Methoden gehören ins Klassendiagramm, nicht ins Struktogramm
      case 'ClassDeclaration':
      case 'InterfaceDeclaration':
      case 'EnumDeclaration':
        declaration(node)
        return []
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
      // `break` am Ende eines Falls ist Teil der Fallauswahl, kein Aussprung
      const last = body?.at(-1)
      if (last?.kind === 'exit' && /^break\b/.test(last.text)) body!.pop()
      const isDefault = labels.includes(null)
      cases.push({ label: isDefault ? null : labels.join(', '), body: body ?? [] })
      labels = []
      body = null
    }
    for (const child of children(node.getChild('SwitchBlock') ?? node)) {
      if (child.name === 'SwitchLabel') {
        if (body) flush()
        labels.push(child.getChild('default') ? null : compact(children(child).filter(c => c.name !== 'case' && c.name !== ':').map(c => src.of(c)).join(' ')))
      }
      else if (!SKIP.has(child.name)) {
        (body ??= []).push(...statement(child))
      }
    }
    flush()
    // „sonst“ immer zuletzt
    cases.sort((a, b) => Number(a.label === null) - Number(b.label === null))
    return { kind: 'switch', subject: unparen(src.of(node.getChild('ParenthesizedExpression'))), cases, line }
  }

  const actionText = (node: SyntaxNode) => src.of(node).replace(/;$/, '')

  for (const node of children(top)) if (node.name in DECLARATIONS) declaration(node)
  return { routines, classes }
}
