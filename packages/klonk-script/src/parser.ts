import type { Expression, Program, Statement } from './ast'
import { KlonkError, type SourceRange } from './errors'
import type { Keyword } from './languages'
import { tokenize, type Token } from './lexer'

/**
 * Parser für Klonk-Script.
 *
 *   wiederhole 3 mal … ende            repeat 3 times … end
 *   wiederhole solange <bed> … ende    repeat while <cond> … end
 *   wiederhole bis <bed> … ende        repeat until <cond> … end
 *   wiederhole immer … ende            repeat forever … end
 *   wenn <bed> dann … sonst wenn … sonst … ende
 *   anweisung name(a, b) … ende        procedure name(a, b) … end
 *   funktion name(a) … zurück x ende   function name(a) … return x end
 *   var x = 1   x = x + 1   importiere "datei"   abbrechen   weiter   stopp
 *
 * Anweisungen stehen je Zeile (oder getrennt durch `;`). Befehle ohne Argumente brauchen keine Klammern.
 */
export function parse(source: string): Program {
  return new Parser(tokenize(source)).program()
}

/** Wie {@link parse}, sammelt aber alle Fehler (für die Live-Prüfung im Editor) */
export function check(source: string): KlonkError[] {
  try {
    parse(source)
    return []
  }
  catch (error) {
    if (error instanceof KlonkError) return [error]
    throw error
  }
}

const COMPARISON = { '=': '==', '==': '==', '!=': '!=', '<>': '!=', '<': '<', '>': '>', '<=': '<=', '>=': '>=' } as const

class Parser {
  private pos = 0
  /** Verschachtelung von Schleifen/Definitionen – für abbrechen/zurück außerhalb */
  private loops = 0
  private functions = 0

  constructor(private tokens: Token[]) {
    // Kommentare spielen für die Grammatik keine Rolle
    this.tokens = tokens.filter(t => t.type !== 'comment')
  }

  program(): Program {
    const body = this.block([])
    if (!this.at('eof')) throw this.error('unexpected_token', this.peek())
    return { type: 'Program', body }
  }

  // ---------------------------------------------------------------------------
  // Anweisungen

  /** Anweisungen bis zu einem der Schlüsselwörter (z. B. `ende`, `sonst`) */
  private block(terminators: Keyword[]): Statement[] {
    const statements: Statement[] = []
    for (;;) {
      this.skipSeparators()
      if (this.at('eof') || terminators.some(k => this.atKeyword(k))) return statements
      statements.push(this.statement())
      if (!this.at('eof') && !terminators.some(k => this.atKeyword(k))) this.expectSeparator()
    }
  }

  private statement(): Statement {
    const token = this.peek()
    if (token.type === 'keyword') {
      switch (token.value as Keyword) {
        case 'repeat': return this.repeat()
        case 'if': return this.ifStatement()
        case 'procedure': return this.definition('procedure')
        case 'function': return this.definition('function')
        case 'var': return this.varDeclaration()
        case 'return': return this.returnStatement()
        case 'break':
        case 'continue': {
          this.next()
          if (!this.loops) throw this.error(token.value === 'break' ? 'break_outside_loop' : 'continue_outside_loop', token)
          return { type: token.value === 'break' ? 'Break' : 'Continue', range: rangeOf(token) }
        }
        case 'stop':
          this.next()
          return { type: 'Stop', range: rangeOf(token) }
        case 'import': {
          this.next()
          const path = this.expect('string', 'expected_string')
          return { type: 'Import', path: String(path.value), range: span(token, path) }
        }
        case 'end':
          throw this.error('unexpected_end', token)
        case 'else':
          throw this.error('unexpected_else', token)
      }
    }

    // Zuweisung: name = Ausdruck
    if (token.type === 'identifier' && this.peek(1).text === '=') {
      this.next()
      this.next()
      const value = this.expression()
      return { type: 'Assignment', name: String(token.value), value, range: span(token, this.previous()) }
    }
    if (token.type === 'builtin' && this.peek(1).text === '=') throw this.error('assign_to_builtin', token, { name: token.text })

    const expression = this.expression()
    if (expression.type !== 'Call' && expression.type !== 'Variable' && expression.type !== 'Builtin')
      throw this.error('expected_statement', token)
    // Bloßer Name als Anweisung = Aufruf ohne Argumente (`schritt`, `meineAnweisung`)
    const call: Expression = expression.type === 'Call'
      ? expression
      : {
          type: 'Call',
          callee: expression.type === 'Builtin' ? { kind: 'builtin', name: expression.name } : { kind: 'user', name: expression.name },
          args: [],
          range: expression.range,
        }
    return { type: 'ExpressionStatement', expression: call, range: call.range }
  }

  private repeat(): Statement {
    const start = this.next()
    let statement: Statement
    if (this.atKeyword('while') || this.atKeyword('until')) {
      const until = this.next().value === 'until'
      const condition = this.expression()
      statement = { type: 'RepeatWhile', condition, until, body: this.loopBody(), range: rangeOf(start) }
    }
    else if (this.atKeyword('forever')) {
      this.next()
      statement = { type: 'RepeatForever', body: this.loopBody(), range: rangeOf(start) }
    }
    else {
      const count = this.expression()
      this.expectKeyword('times', 'expected_times')
      statement = { type: 'RepeatTimes', count, body: this.loopBody(), range: rangeOf(start) }
    }
    this.closeBlock(start, statement)
    return statement
  }

  private loopBody() {
    this.loops++
    try {
      return this.block(['end'])
    }
    finally {
      this.loops--
    }
  }

  private ifStatement(): Statement {
    const start = this.next()
    const branches: { condition: Expression, body: Statement[] }[] = []
    let otherwise: Statement[] | undefined
    let condition = this.condition()
    for (;;) {
      branches.push({ condition, body: this.block(['else', 'end']) })
      if (!this.atKeyword('else')) break
      this.next()
      if (this.atKeyword('if')) {
        this.next()
        condition = this.condition()
        continue
      }
      otherwise = this.block(['end'])
      break
    }
    const statement: Statement = { type: 'If', branches, otherwise, range: rangeOf(start) }
    this.closeBlock(start, statement)
    return statement
  }

  /** Bedingung mit optionalem `dann` */
  private condition() {
    const condition = this.expression()
    if (this.atKeyword('then')) this.next()
    return condition
  }

  private definition(kind: 'procedure' | 'function'): Statement {
    const start = this.next()
    const nameToken = this.peek()
    if (nameToken.type === 'builtin' || nameToken.type === 'keyword') throw this.error('reserved_name', nameToken, { name: nameToken.text })
    if (this.loops || this.functions) throw this.error('nested_definition', start)
    const name = String(this.expect('identifier', 'expected_name').value)
    const params: string[] = []
    if (this.peek().text === '(') {
      this.next()
      if (this.peek().text !== ')') {
        do {
          const p = this.peek()
          if (p.type !== 'identifier') throw this.error(p.type === 'builtin' || p.type === 'keyword' ? 'reserved_name' : 'expected_name', p, { name: p.text })
          this.next()
          if (params.includes(String(p.value))) throw this.error('duplicate_parameter', p, { name: p.text })
          params.push(String(p.value))
        } while (this.matchOperator(','))
      }
      this.expectOperator(')')
    }
    this.functions++
    const body = this.block(['end'])
    this.functions--
    const statement: Statement = { type: 'Definition', kind, name, params, body, range: span(start, nameToken) }
    this.closeBlock(start, statement)
    return statement
  }

  private varDeclaration(): Statement {
    const start = this.next()
    const nameToken = this.peek()
    if (nameToken.type !== 'identifier') throw this.error(nameToken.type === 'builtin' || nameToken.type === 'keyword' ? 'reserved_name' : 'expected_name', nameToken, { name: nameToken.text })
    this.next()
    this.expectOperator('=')
    const value = this.expression()
    return { type: 'VarDeclaration', name: String(nameToken.value), value, range: span(start, this.previous()) }
  }

  private returnStatement(): Statement {
    const start = this.next()
    if (!this.functions) throw this.error('return_outside_function', start)
    const value = this.at('newline') || this.at('eof') || this.atKeyword('end') || this.peek().text === ';' ? undefined : this.expression()
    return { type: 'Return', value, range: span(start, this.previous()) }
  }

  /** `ende` am Blockende verlangen – Fehler zeigt auf den Blockanfang */
  private closeBlock(start: Token, statement: Statement) {
    if (!this.atKeyword('end')) throw this.error('missing_end', start, { keyword: start.text })
    statement.range = span(start, this.next())
  }

  // ---------------------------------------------------------------------------
  // Ausdrücke (Vorrang: oder < und < nicht < Vergleich < +/- < */% < Vorzeichen < Aufruf)

  private expression(): Expression {
    return this.or()
  }

  private or(): Expression {
    let left = this.and()
    while (this.atKeyword('or')) {
      this.next()
      const right = this.and()
      left = { type: 'Binary', operator: 'or', left, right, range: join(left.range, right.range) }
    }
    return left
  }

  private and(): Expression {
    let left = this.not()
    while (this.atKeyword('and')) {
      this.next()
      const right = this.not()
      left = { type: 'Binary', operator: 'and', left, right, range: join(left.range, right.range) }
    }
    return left
  }

  private not(): Expression {
    if (this.atKeyword('not')) {
      const start = this.next()
      const operand = this.not()
      return { type: 'Unary', operator: 'not', operand, range: join(rangeOf(start), operand.range) }
    }
    return this.comparison()
  }

  private comparison(): Expression {
    let left = this.additive()
    for (;;) {
      const op = this.peek()
      if (op.type !== 'operator' || !(op.text in COMPARISON)) return left
      this.next()
      const right = this.additive()
      left = { type: 'Binary', operator: COMPARISON[op.text as keyof typeof COMPARISON], left, right, range: join(left.range, right.range) }
    }
  }

  private additive(): Expression {
    let left = this.multiplicative()
    while (this.peek().text === '+' || this.peek().text === '-') {
      const operator = this.next().text as '+' | '-'
      const right = this.multiplicative()
      left = { type: 'Binary', operator, left, right, range: join(left.range, right.range) }
    }
    return left
  }

  private multiplicative(): Expression {
    let left = this.unary()
    while (['*', '/', '%'].includes(this.peek().text) && this.peek().type === 'operator') {
      const operator = this.next().text as '*' | '/' | '%'
      const right = this.unary()
      left = { type: 'Binary', operator, left, right, range: join(left.range, right.range) }
    }
    return left
  }

  private unary(): Expression {
    if (this.peek().type === 'operator' && this.peek().text === '-') {
      const start = this.next()
      const operand = this.unary()
      return { type: 'Unary', operator: '-', operand, range: join(rangeOf(start), operand.range) }
    }
    return this.call()
  }

  private call(): Expression {
    const primary = this.primary()
    if (this.peek().text !== '(' || (primary.type !== 'Variable' && primary.type !== 'Builtin')) return primary
    this.next()
    const args: Expression[] = []
    if (this.peek().text !== ')') {
      do args.push(this.expression())
      while (this.matchOperator(','))
    }
    const close = this.expectOperator(')')
    return {
      type: 'Call',
      callee: primary.type === 'Builtin' ? { kind: 'builtin', name: primary.name } : { kind: 'user', name: primary.name },
      args,
      range: join(primary.range, rangeOf(close)),
    }
  }

  private primary(): Expression {
    const token = this.peek()
    switch (token.type) {
      case 'number':
        this.next()
        return { type: 'Number', value: Number(token.value), range: rangeOf(token) }
      case 'string':
        this.next()
        return { type: 'String', value: String(token.value), range: rangeOf(token) }
      case 'identifier':
        this.next()
        return { type: 'Variable', name: String(token.value), range: rangeOf(token) }
      case 'builtin':
        this.next()
        return { type: 'Builtin', name: token.value as never, range: rangeOf(token) }
      case 'keyword':
        if (token.value === 'true' || token.value === 'false') {
          this.next()
          return { type: 'Boolean', value: token.value === 'true', range: rangeOf(token) }
        }
        break
      case 'operator':
        if (token.text === '(') {
          this.next()
          const inner = this.expression()
          this.expectOperator(')')
          return inner
        }
    }
    if (token.type === 'newline' || token.type === 'eof') throw this.error('expected_expression', token)
    throw this.error('unexpected_token', token, { token: token.text })
  }

  // ---------------------------------------------------------------------------
  // Hilfsfunktionen

  private peek(offset = 0) {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!
  }

  private previous() {
    return this.tokens[Math.max(0, this.pos - 1)]!
  }

  private next() {
    const token = this.peek()
    if (token.type !== 'eof') this.pos++
    return token
  }

  private at(type: Token['type']) {
    return this.peek().type === type
  }

  private atKeyword(keyword: Keyword) {
    const token = this.peek()
    return token.type === 'keyword' && token.value === keyword
  }

  private matchOperator(op: string) {
    if (this.peek().type === 'operator' && this.peek().text === op) {
      this.next()
      return true
    }
    return false
  }

  private expect(type: Token['type'], code: string) {
    if (!this.at(type)) throw this.error(code, this.peek(), { token: this.peek().text })
    return this.next()
  }

  private expectOperator(op: string) {
    if (this.peek().type !== 'operator' || this.peek().text !== op) throw this.error('expected_operator', this.peek(), { expected: op, token: this.peek().text })
    return this.next()
  }

  private expectKeyword(keyword: Keyword, code: string) {
    if (!this.atKeyword(keyword)) throw this.error(code, this.peek(), { token: this.peek().text })
    return this.next()
  }

  private skipSeparators() {
    while (this.at('newline') || (this.peek().type === 'operator' && this.peek().text === ';')) this.next()
  }

  private expectSeparator() {
    if (this.at('newline') || this.matchOperator(';')) return
    throw this.error('expected_newline', this.peek(), { token: this.peek().text })
  }

  private error(code: string, token: Token, params: Record<string, string | number> = {}) {
    return new KlonkError(code, { token: token.text, ...params }, rangeOf(token))
  }
}

function rangeOf(token: Token): SourceRange {
  return { line: token.line, column: token.column, endLine: token.line, endColumn: Math.max(token.endColumn, token.column + 1) }
}

function span(start: Token, end: Token): SourceRange {
  return { line: start.line, column: start.column, endLine: end.line, endColumn: end.endColumn }
}

function join(a: SourceRange, b: SourceRange): SourceRange {
  return { line: a.line, column: a.column, endLine: b.endLine, endColumn: b.endColumn }
}
