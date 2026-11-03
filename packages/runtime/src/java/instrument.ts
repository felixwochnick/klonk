import { parse } from 'java-parser'
import MagicString from 'magic-string'

/** Prüfpunkt-Aufrufe (statisch importiert aus `klonk.Klonk`, siehe robot.ts) */
const CP = '__cp'
const VAR = '__v'
const WAIT = '__pause'
/** Speicherabbild: Schnittstelle und Methode je eigener Klasse (siehe Debug.java) */
const INSPECT = '__Inspect'
const INSPECT_METHOD = '__klonkInspect'

type CstNode = {
  name: string
  children: Record<string, (CstNode | CstToken)[]>
  location: { startOffset: number, endOffset: number, startLine: number }
}
type CstToken = { image: string, startOffset: number, endOffset: number, startLine: number, tokenType: unknown }

const isNode = (n: CstNode | CstToken): n is CstNode => 'children' in n
const kids = (node: CstNode, name: string) => (node.children[name] ?? []).filter(isNode)
const kid = (node: CstNode, name: string) => kids(node, name)[0]

/** Alle Bezeichner, die eine Deklaration einführt (`int a = 1, b;` ⇒ nur initialisierte: `a`) */
function declared(declaration: CstNode, initializedOnly: boolean): string[] {
  const names: string[] = []
  for (const list of kids(declaration, 'variableDeclaratorList')) {
    for (const declarator of kids(list, 'variableDeclarator')) {
      if (initializedOnly && !kid(declarator, 'variableInitializer')) continue
      const id = kid(declarator, 'variableDeclaratorId')
      const token = id?.children.Identifier?.[0] as CstToken | undefined
      if (token) names.push(token.image)
    }
  }
  return names
}

function identifiers(node: CstNode | undefined): string[] {
  if (!node) return []
  const out: string[] = []
  const walk = (n: CstNode) => {
    if (n.name === 'variableDeclaratorId') {
      const token = n.children.Identifier?.[0] as CstToken | undefined
      if (token) out.push(token.image)
      return
    }
    for (const list of Object.values(n.children)) for (const c of list) if (isNode(c)) walk(c)
  }
  walk(node)
  return out
}

/** Namen aller Klassen in Quelltexten (für `super.__klonkInspect()` bei eigenen Oberklassen) */
export function javaClassNames(sources: string[]) {
  return new Set(sources.flatMap(source => [...source.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]!)))
}

/**
 * Fügt in Java-Quelltext vor jeder Anweisung einen Prüfpunkt ein:
 * `if (__cp(zeile)) { __v("x", x); …; __pause(); }` (in Objektmethoden auch `this`).
 * Schleifen- und if-Rümpfe ohne Klammern werden geklammert. Eigene Klassen implementieren `__Inspect` und melden
 * ihre Attribute fürs Objektdiagramm (`ownClasses`: eigene Klassen aller Dateien, für Attribute der Oberklasse).
 * Nur Einfügungen ⇒ Zeilen bleiben gleich.
 * Gibt `null` zurück, wenn der Quelltext nicht geparst werden kann (dann meldet javac den Fehler).
 */
export function instrumentJava(source: string, ownClasses: Set<string> = javaClassNames([source])): string | null {
  let cst: CstNode
  try {
    cst = parse(source) as unknown as CstNode
  }
  catch {
    return null
  }
  const out = new MagicString(source)
  // Sichtbare lokale Variablen; `null` trennt Methoden/Lambdas (äußere Variablen dort nicht lesbar)
  const scopes: (string[] | null)[] = []

  const visible = () => {
    // Äußere Bereiche zuerst, innerhalb eines Bereichs in Reihenfolge der Deklaration
    const groups: string[][] = []
    for (let i = scopes.length - 1; i >= 0; i--) {
      const scope = scopes[i]
      if (scope === null) break
      if (scope) groups.unshift(scope)
    }
    return [...new Set(groups.flat())]
  }
  const checkpoint = (line: number) =>
    `if (${CP}(${line})) { ${visible().map(n => `${VAR}("${n}", ${n}); `).join('')}${WAIT}(); } `

  const withScope = (names: string[] | null, fn: () => void) => {
    scopes.push(names === null ? null : [...names])
    fn()
    scopes.pop()
  }
  const declare = (names: string[]) => {
    const top = scopes.at(-1)
    if (top) top.push(...names)
  }

  /** Rumpf ohne eigene Klammern (oder Schleifenrumpf) klammern und mit Prüfpunkt versehen */
  const wrap = (statement: CstNode, line: number) => {
    out.appendLeft(statement.location.startOffset, `{ ${checkpoint(line)}`)
    // appendLeft (nicht prependRight): ein Prüfpunkt der folgenden Anweisung an derselben Stelle gehört dahinter
    out.appendLeft(statement.location.endOffset + 1, ' }')
  }

  const walk = (node: CstNode, parent?: CstNode) => {
    switch (node.name) {
      case 'methodDeclaration':
      case 'constructorDeclaration': {
        const params = identifiers(kid(kid(node, 'methodHeader') ?? node, 'methodDeclarator') ?? kid(node, 'constructorDeclarator'))
        // Objektmethoden: `this` zeigt das eigene Objekt (Objektdiagramm)
        const isStatic = kids(node, 'methodModifier').some(m => 'Static' in m.children)
        withScope(null, () => withScope([...(isStatic ? [] : ['this']), ...params], () => children(node)))
        return
      }
      case 'normalClassDeclaration':
        inspectable(node)
        children(node)
        return
      case 'lambdaExpression': {
        const params = identifiers(kid(node, 'lambdaParameters'))
        const plain = kid(node, 'lambdaParameters')?.children.Identifier?.map(t => (t as CstToken).image) ?? []
        withScope(null, () => withScope([...params, ...plain], () => children(node)))
        return
      }
      case 'classBody':
      case 'enumBody':
      case 'recordBody':
      case 'interfaceBody':
        // Felder/Initialisierer: keine Anweisungen ⇒ nur Methoden darin instrumentieren
        withScope(null, () => children(node))
        return
      case 'block':
      case 'switchBlockStatementGroup':
      case 'catchClause':
        withScope([...(node.name === 'catchClause' ? identifiers(kid(node, 'catchFormalParameter')) : [])], () => children(node))
        return
      case 'blockStatement': {
        out.appendLeft(node.location.startOffset, checkpoint(node.location.startLine))
        children(node)
        // Deklaration gilt ab der nächsten Anweisung
        const declaration = kid(kid(node, 'localVariableDeclarationStatement') ?? node, 'localVariableDeclaration')
        if (declaration) declare(declared(declaration, true))
        return
      }
      case 'basicForStatement':
      case 'enhancedForStatement':
      case 'whileStatement':
      case 'doStatement': {
        withScope([], () => {
          const init = kid(kid(node, 'forInit') ?? node, 'localVariableDeclaration')
          if (init) declare(declared(init, true))
          if (node.name === 'enhancedForStatement') {
            const declaration = kid(node, 'localVariableDeclaration')
            declare(declaration ? identifiers(declaration) : identifiers(kid(node, 'variableDeclaratorId')))
          }
          for (const [key, list] of Object.entries(node.children)) {
            for (const child of list) {
              if (!isNode(child)) continue
              // Schleifenrumpf: Prüfpunkt je Durchlauf, auch bei leerem Rumpf
              if (key === 'statement') wrap(child, node.location.startLine)
              walk(child, node)
            }
          }
        })
        return
      }
      case 'ifStatement':
        for (const child of kids(node, 'statement')) {
          if (!isBlock(child)) wrap(child, child.location.startLine)
        }
        children(node)
        return
      default:
        void parent
        children(node)
    }
  }
  /** Klasse meldet Name und Attribute (ohne statische) fürs Speicherabbild */
  const inspectable = (node: CstNode) => {
    const name = (kid(node, 'typeIdentifier')?.children.Identifier?.[0] as CstToken | undefined)?.image
    const body = kid(node, 'classBody')
    const close = body?.children.RCurly?.[0] as CstToken | undefined
    if (!name || !body || !close) return
    const fields: string[] = []
    for (const declaration of kids(body, 'classBodyDeclaration')) {
      const field = kid(kid(declaration, 'classMemberDeclaration') ?? declaration, 'fieldDeclaration')
      if (!field || kids(field, 'fieldModifier').some(m => 'Static' in m.children)) continue
      fields.push(...declared(field, false))
    }
    const parentTokens = kid(kid(node, 'classExtends') ?? node, 'classType')?.children.Identifier ?? []
    const parent = (parentTokens.at(-1) as CstToken | undefined)?.image
    const implementsClause = kid(node, 'classImplements')
    if (implementsClause) out.appendLeft(implementsClause.location.endOffset + 1, `, ${INSPECT}`)
    else out.appendLeft(body.location.startOffset, ` implements ${INSPECT} `)
    const superCall = parent && ownClasses.has(parent) ? `super.${INSPECT_METHOD}(); ` : ''
    out.appendLeft(close.startOffset, ` public void ${INSPECT_METHOD}() { ${superCall}__cls("${name}"); ${fields.map(f => `__f("${f}", this.${f}); `).join('')}} `)
  }

  const children = (node: CstNode) => {
    for (const list of Object.values(node.children)) for (const c of list) if (isNode(c)) walk(c, node)
  }

  walk(cst)
  return out.toString()
}

function isBlock(statement: CstNode) {
  const inner = kid(statement, 'statementWithoutTrailingSubstatement')
  return !!inner && !!kid(inner, 'block')
}
