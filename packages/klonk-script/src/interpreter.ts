import { BRICK_COLORS, MARK_COLORS, WorldError, type BrickColor, type MarkColor, type World } from '@klonk/world'
import type { Expression, Program, Statement } from './ast'
import { KlonkError, type SourceRange } from './errors'
import { BUILTINS, type BuiltinName, type BuiltinParam } from './languages'
import { parse } from './parser'

export type Value = number | string | boolean | null

/** Roboterbefehl, wie er an die 3D-Ansicht weitergegeben wird (Methode von `World`) */
export type RobotCommand
  = | { name: 'step' | 'turnLeft' | 'turnRight' | 'pickBrick' | 'removeMark', id: string }
    | { name: 'placeBrick', id: string, color: BrickColor }
    | { name: 'setMark', id: string, color: MarkColor }

export type InterpreterHooks = {
  /** Vor jeder Anweisung – hier halten Breakpoints, Einzelschritt und Tempo an */
  checkpoint?: (range: SourceRange, variables: () => Record<string, Value>) => Promise<void> | void
  /** Nach jedem ausgeführten Roboterbefehl (z. B. an den Hauptthread senden und Animation abwarten) */
  command?: (command: RobotCommand) => Promise<void> | void
  print?: (text: string) => void
  wait?: (seconds: number) => Promise<void>
  /** Bibliotheken (`importiere`) sind Teil der Lizenz */
  allowImports?: boolean
  /** Quelltext einer importierten Datei */
  resolveImport?: (path: string) => string | undefined | Promise<string | undefined>
  random?: () => number
}

const MAX_DEPTH = 200

// Kontrollfluss über Signale (keine Fehler im eigentlichen Sinn)
class BreakSignal {
  readonly kind = 'break'
}
class ContinueSignal {
  readonly kind = 'continue'
}
class StopSignal {
  readonly kind = 'stop'
}
class ReturnSignal {
  constructor(public value: Value) {}
}

type Definition = Extract<Statement, { type: 'Definition' }>

/**
 * Führt ein Klonk-Script-Programm gegen eine {@link World} aus.
 * Asynchron, damit Debugger (Haltepunkte, Einzelschritt) und Animationen dazwischen greifen können.
 */
export class Interpreter {
  private globals = new Map<string, Value>()
  private definitions = new Map<string, Definition>()
  private scopes: Map<string, Value>[] = []
  private character: string
  private stopped = false

  constructor(
    private program: Program,
    private world: World,
    private hooks: InterpreterHooks = {},
    characterId?: string,
  ) {
    this.character = characterId ?? world.getCharacters()[0]?.id ?? ''
  }

  static fromSource(source: string, world: World, hooks?: InterpreterHooks, characterId?: string) {
    return new Interpreter(parse(source), world, hooks, characterId)
  }

  /** Programm abbrechen – greift beim nächsten Prüfpunkt */
  stop() {
    this.stopped = true
  }

  async run() {
    await this.hoist(this.program, new Set())
    try {
      await this.block(this.program.body)
    }
    catch (signal) {
      if (signal instanceof StopSignal) return
      throw signal
    }
  }

  // ---------------------------------------------------------------------------

  /** Anweisungen/Funktionen (auch aus Bibliotheken) vorab bekannt machen – Aufruf vor Definition ist erlaubt */
  private async hoist(program: Program, seen: Set<string>) {
    for (const statement of program.body) {
      if (statement.type === 'Definition') {
        if (this.definitions.has(statement.name.toLowerCase()))
          throw new KlonkError('duplicate_definition', { name: statement.name }, statement.range)
        this.definitions.set(statement.name.toLowerCase(), statement)
      }
      else if (statement.type === 'Import') {
        if (!this.hooks.allowImports) throw new KlonkError('feature_libraries', {}, statement.range)
        if (seen.has(statement.path)) continue
        seen.add(statement.path)
        const source = await this.hooks.resolveImport?.(statement.path)
        if (source === undefined) throw new KlonkError('import_not_found', { path: statement.path }, statement.range)
        let library: Program
        try {
          library = parse(source)
        }
        catch (error) {
          if (error instanceof KlonkError) throw new KlonkError('import_error', { path: statement.path, line: error.range?.line ?? 0 }, statement.range)
          throw error
        }
        await this.hoist(library, seen)
      }
    }
  }

  private async block(statements: Statement[]) {
    for (const statement of statements) {
      if (statement.type === 'Definition' || statement.type === 'Import') continue
      await this.checkpoint(statement.range)
      await this.statement(statement)
    }
  }

  private async checkpoint(range: SourceRange) {
    if (this.stopped) throw new StopSignal()
    await this.hooks.checkpoint?.(range, () => this.variables())
    if (this.stopped) throw new StopSignal()
  }

  /** Sichtbare Variablen (lokale überdecken globale) – für die Variablenansicht */
  variables(): Record<string, Value> {
    const result: Record<string, Value> = Object.fromEntries(this.globals)
    const local = this.scopes.at(-1)
    if (local) Object.assign(result, Object.fromEntries(local))
    return result
  }

  private async statement(s: Statement): Promise<void> {
    switch (s.type) {
      case 'ExpressionStatement':
        await this.evaluate(s.expression)
        return
      case 'VarDeclaration': {
        const scope = this.scopes.at(-1) ?? this.globals
        scope.set(s.name, await this.evaluate(s.value))
        return
      }
      case 'Assignment': {
        const scope = this.lookupScope(s.name)
        if (!scope) throw new KlonkError('undeclared_variable', { name: s.name }, s.range)
        scope.set(s.name, await this.evaluate(s.value))
        return
      }
      case 'RepeatTimes': {
        const count = await this.evaluate(s.count)
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 0)
          throw new KlonkError('expected_count', { value: show(count) }, s.count.range)
        for (let i = 0; i < count; i++) {
          if (await this.loopBody(s.body)) break
        }
        return
      }
      case 'RepeatWhile':
        for (;;) {
          await this.checkpoint(s.condition.range)
          const condition = this.truthy(await this.evaluate(s.condition), s.condition.range)
          if (condition === s.until) break
          if (await this.loopBody(s.body)) break
        }
        return
      case 'RepeatForever':
        for (;;) {
          await this.checkpoint(s.range)
          if (await this.loopBody(s.body)) break
        }
        return
      case 'If':
        for (const branch of s.branches) {
          if (this.truthy(await this.evaluate(branch.condition), branch.condition.range)) {
            await this.block(branch.body)
            return
          }
        }
        if (s.otherwise) await this.block(s.otherwise)
        return
      case 'Return':
        throw new ReturnSignal(s.value ? await this.evaluate(s.value) : null)
      case 'Break':
        throw new BreakSignal()
      case 'Continue':
        throw new ContinueSignal()
      case 'Stop':
        throw new StopSignal()
      case 'Definition':
      case 'Import':
        return
    }
  }

  /** Schleifenkörper; `true` = abbrechen */
  private async loopBody(body: Statement[]) {
    try {
      await this.block(body)
    }
    catch (signal) {
      if (signal instanceof BreakSignal) return true
      if (signal instanceof ContinueSignal) return false
      throw signal
    }
    return false
  }

  private lookupScope(name: string) {
    const local = this.scopes.at(-1)
    if (local?.has(name)) return local
    if (this.globals.has(name)) return this.globals
    return undefined
  }

  private truthy(value: Value, range: SourceRange) {
    if (typeof value !== 'boolean') throw new KlonkError('expected_boolean', { value: show(value) }, range)
    return value
  }

  // ---------------------------------------------------------------------------
  // Ausdrücke

  private async evaluate(e: Expression): Promise<Value> {
    switch (e.type) {
      case 'Number':
      case 'String':
      case 'Boolean':
        return e.value
      case 'Variable': {
        const scope = this.lookupScope(e.name)
        if (scope) return scope.get(e.name)!
        // Name einer eigenen Anweisung/Funktion ohne Klammern im Ausdruck
        if (this.definitions.has(e.name.toLowerCase())) return this.callUser(e.name, [], e.range)
        throw new KlonkError('unknown_name', { name: e.name }, e.range)
      }
      case 'Builtin':
        return this.callBuiltin(e.name, [], e.range)
      case 'Unary': {
        const value = await this.evaluate(e.operand)
        if (e.operator === 'not') return !this.truthy(value, e.operand.range)
        return -this.number(value, e.operand.range)
      }
      case 'Binary':
        return this.binary(e)
      case 'Call': {
        const args: Value[] = []
        for (const arg of e.args) args.push(await this.evaluate(arg))
        return e.callee.kind === 'builtin'
          ? this.callBuiltin(e.callee.name, args, e.range)
          : this.callUser(e.callee.name, args, e.range)
      }
    }
  }

  private async binary(e: Extract<Expression, { type: 'Binary' }>): Promise<Value> {
    // Logik mit Kurzschluss
    if (e.operator === 'and') return this.truthy(await this.evaluate(e.left), e.left.range) && this.truthy(await this.evaluate(e.right), e.right.range)
    if (e.operator === 'or') return this.truthy(await this.evaluate(e.left), e.left.range) || this.truthy(await this.evaluate(e.right), e.right.range)

    const left = await this.evaluate(e.left)
    const right = await this.evaluate(e.right)
    switch (e.operator) {
      case '==': return left === right
      case '!=': return left !== right
      case '+':
        if (typeof left === 'string' || typeof right === 'string') return show(left) + show(right)
        return this.number(left, e.left.range) + this.number(right, e.right.range)
      case '-': return this.number(left, e.left.range) - this.number(right, e.right.range)
      case '*': return this.number(left, e.left.range) * this.number(right, e.right.range)
      case '/': {
        const divisor = this.number(right, e.right.range)
        if (divisor === 0) throw new KlonkError('division_by_zero', {}, e.range)
        return this.number(left, e.left.range) / divisor
      }
      case '%': {
        const divisor = this.number(right, e.right.range)
        if (divisor === 0) throw new KlonkError('division_by_zero', {}, e.range)
        return this.number(left, e.left.range) % divisor
      }
      case '<': return this.number(left, e.left.range) < this.number(right, e.right.range)
      case '>': return this.number(left, e.left.range) > this.number(right, e.right.range)
      case '<=': return this.number(left, e.left.range) <= this.number(right, e.right.range)
      case '>=': return this.number(left, e.left.range) >= this.number(right, e.right.range)
    }
  }

  private number(value: Value, range: SourceRange) {
    if (typeof value !== 'number') throw new KlonkError('expected_number', { value: show(value) }, range)
    return value
  }

  private async callUser(name: string, args: Value[], range: SourceRange): Promise<Value> {
    const definition = this.definitions.get(name.toLowerCase())
    if (!definition) throw new KlonkError(this.lookupScope(name) ? 'not_callable' : 'unknown_name', { name }, range)
    if (args.length !== definition.params.length)
      throw new KlonkError('wrong_argument_count', { name: definition.name, expected: definition.params.length, actual: args.length }, range)
    if (this.scopes.length >= MAX_DEPTH) throw new KlonkError('stack_overflow', { name: definition.name }, range)

    this.scopes.push(new Map(definition.params.map((p, i) => [p, args[i]!])))
    try {
      await this.block(definition.body)
      return null
    }
    catch (signal) {
      if (signal instanceof ReturnSignal) return signal.value
      throw signal
    }
    finally {
      this.scopes.pop()
    }
  }

  private async callBuiltin(name: BuiltinName, args: Value[], range: SourceRange): Promise<Value> {
    const builtin = BUILTINS[name]
    const params: BuiltinParam[] = 'params' in builtin ? builtin.params : []
    const required = params.filter(p => !p.optional).length
    if (args.length < required || args.length > params.length) {
      const spelled = builtin.names.de[0]!
      throw new KlonkError('wrong_argument_count', { name: spelled, expected: params.length, actual: args.length }, range)
    }

    const id = this.character
    const world = this.world
    try {
      switch (name) {
        case 'step': {
          const count = args.length ? this.number(args[0]!, range) : 1
          if (!Number.isInteger(count) || count < 0) throw new KlonkError('expected_count', { value: show(count) }, range)
          for (let i = 0; i < count; i++) {
            if (i > 0) await this.checkpoint(range)
            world.step(id)
            await this.hooks.command?.({ name: 'step', id })
          }
          return null
        }
        case 'turnLeft':
        case 'turnRight':
        case 'pickBrick':
        case 'removeMark':
          world[name](id)
          await this.hooks.command?.({ name, id })
          return null
        case 'placeBrick': {
          const color = args.length ? this.color(args[0]!, BRICK_COLORS, range) : 'red'
          world.placeBrick(id, color)
          await this.hooks.command?.({ name, id, color })
          return null
        }
        case 'setMark': {
          const color = args.length ? this.color(args[0]!, MARK_COLORS, range) : 'yellow'
          world.setMark(id, color)
          await this.hooks.command?.({ name, id, color })
          return null
        }
        case 'selectCharacter': {
          this.character = world.findCharacter(String(args[0])).id
          return null
        }
        case 'isWall': return world.isWall(id)
        case 'isBrick': return world.isBrick(id, args.length ? this.color(args[0]!, BRICK_COLORS, range) : undefined)
        case 'isMark': return world.isMark(id, args.length ? this.color(args[0]!, MARK_COLORS, range) : undefined)
        case 'isFacingNorth': return world.getCharacter(id).direction === 'north'
        case 'isFacingEast': return world.getCharacter(id).direction === 'east'
        case 'isFacingSouth': return world.getCharacter(id).direction === 'south'
        case 'isFacingWest': return world.getCharacter(id).direction === 'west'
        case 'brickCount': return world.bricksInFront(id)
        case 'positionX': return world.getCharacter(id).x + 1
        case 'positionY': return world.getCharacter(id).z + 1
        case 'print':
          this.hooks.print?.(show(args[0] ?? ''))
          return null
        case 'wait': {
          const seconds = args.length ? this.number(args[0]!, range) : 1
          await this.hooks.wait?.(Math.max(0, Math.min(seconds, 60)))
          return null
        }
        case 'random': {
          const min = Math.ceil(this.number(args[0]!, range))
          const max = Math.floor(this.number(args[1]!, range))
          if (max < min) throw new KlonkError('invalid_range', { from: min, to: max }, range)
          return min + Math.floor((this.hooks.random ?? Math.random)() * (max - min + 1))
        }
        default:
          // Farbkonstanten
          return name
      }
    }
    catch (error) {
      if (error instanceof WorldError) throw new KlonkError('world', { worldCode: error.code, ...error.params }, range)
      throw error
    }
  }

  private color<T extends string>(value: Value, allowed: readonly T[], range: SourceRange): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) throw new KlonkError('invalid_color', { value: show(value) }, range)
    return value as T
  }
}

/** Darstellung von Werten in der Ausgabe */
export function show(value: Value): string {
  if (value === null) return '–'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6)
  return String(value)
}
