import { parse, type Expression, type Statement } from '@klonk/klonk-script'

/**
 * Klonk-Script ⇒ Blöcke (Blockly-JSON, wie es `KlonkBlocks` speichert) – Gegenstück zu `generator.ts`.
 * Kommentare gehen verloren; was es als Block nicht gibt (z. B. `zurück` mitten in einer Funktion, Importe), wirft
 * `BlocksConversionError` – dann bleibt das Programm Klonk-Script.
 */
export class BlocksConversionError extends Error {
  constructor(readonly construct: string, readonly line: number) {
    super(`blocks_unsupported:${construct}`)
  }
}

type Block = { type: string, id?: string, fields?: Record<string, unknown>, inputs?: Record<string, { block: Block }>, next?: { block: Block }, extraState?: unknown, x?: number, y?: number }

const ARITHMETIC = new Set(['+', '-', '*', '/', '%'])
const COMPARE: Record<string, string> = { '==': 'EQ', '!=': 'NEQ', '<': 'LT', '<=': 'LTE', '>': 'GT', '>=': 'GTE' }
const FACING = new Set(['isFacingNorth', 'isFacingEast', 'isFacingSouth', 'isFacingWest'])
const NUMBER_SENSORS = new Set(['brickCount', 'positionX', 'positionY'])
const COLORS = new Set(['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'white', 'black'])
const LOOKS: Record<string, string> = { männlich: 'male', maennlich: 'male', male: 'male', weiblich: 'female', female: 'female', divers: 'diverse', diverse: 'diverse' }

export function scriptToBlocks(source: string): object {
  const program = parse(source)
  const variables = new Map<string, string>()
  const procedures = new Map<string, { params: string[], returns: boolean }>()
  for (const s of program.body) if (s.type === 'Definition') procedures.set(s.name, { params: s.params, returns: s.kind === 'function' })

  const variableId = (name: string) => {
    if (!variables.has(name)) variables.set(name, `var-${variables.size + 1}`)
    return variables.get(name)!
  }
  const color = (e: Expression | undefined, fallback: string) => {
    if (!e) return fallback
    if (e.type === 'Builtin' && COLORS.has(e.name)) return e.name
    throw new BlocksConversionError('color', e.range.line)
  }
  const callState = (name: string) => ({ name, params: procedures.get(name)?.params ?? [] })
  const argInputs = (args: Expression[]) => Object.fromEntries(args.map((a, i) => [`ARG${i}`, { block: expression(a) }]))

  function expression(e: Expression): Block {
    switch (e.type) {
      case 'Number': return { type: 'math_number', fields: { NUM: e.value } }
      case 'String': return { type: 'text', fields: { TEXT: e.value } }
      case 'Boolean': return { type: 'logic_boolean', fields: { BOOL: e.value ? 'TRUE' : 'FALSE' } }
      case 'Variable': return { type: 'variables_get', fields: { VAR: { id: variableId(e.name) } } }
      case 'Builtin':
        if (e.name === 'isWall') return { type: 'klonk_is_wall' }
        if (e.name === 'isBrick') return { type: 'klonk_is_brick', fields: { COLOR: 'any' } }
        if (e.name === 'isMark') return { type: 'klonk_is_mark', fields: { COLOR: 'any' } }
        if (FACING.has(e.name)) return { type: 'klonk_facing', fields: { DIR: e.name } }
        if (NUMBER_SENSORS.has(e.name)) return { type: 'klonk_number_sensor', fields: { SENSOR: e.name } }
        throw new BlocksConversionError(e.name, e.range.line)
      case 'Unary':
        if (e.operator === 'not') return { type: 'logic_negate', inputs: { BOOL: { block: expression(e.operand) } } }
        if (e.operand.type === 'Number') return { type: 'math_number', fields: { NUM: -e.operand.value } }
        return { type: 'klonk_arithmetic', fields: { OP: '-' }, inputs: { A: { block: { type: 'math_number', fields: { NUM: 0 } } }, B: { block: expression(e.operand) } } }
      case 'Binary':
        if (e.operator === 'and' || e.operator === 'or') return { type: 'logic_operation', fields: { OP: e.operator.toUpperCase() }, inputs: { A: { block: expression(e.left) }, B: { block: expression(e.right) } } }
        if (COMPARE[e.operator]) return { type: 'logic_compare', fields: { OP: COMPARE[e.operator] }, inputs: { A: { block: expression(e.left) }, B: { block: expression(e.right) } } }
        if (ARITHMETIC.has(e.operator)) return { type: 'klonk_arithmetic', fields: { OP: e.operator }, inputs: { A: { block: expression(e.left) }, B: { block: expression(e.right) } } }
        throw new BlocksConversionError(e.operator, e.range.line)
      case 'Call':
        if (e.callee.kind === 'user') return { type: 'procedures_callreturn', extraState: callState(e.callee.name), inputs: argInputs(e.args) }
        if (e.callee.name === 'isBrick') return { type: 'klonk_is_brick', fields: { COLOR: e.args[0] ? color(e.args[0], 'red') : 'any' } }
        if (e.callee.name === 'isMark') return { type: 'klonk_is_mark', fields: { COLOR: e.args[0] ? color(e.args[0], 'yellow') : 'any' } }
        if (e.callee.name === 'random') return { type: 'math_random_int', inputs: { FROM: { block: expression(e.args[0]!) }, TO: { block: expression(e.args[1]!) } } }
        if (e.args.length === 0) return expression({ type: 'Builtin', name: e.callee.name, range: e.range })
        throw new BlocksConversionError(e.callee.name, e.range.line)
    }
  }

  function command(e: Extract<Expression, { type: 'Call' }>, line: number): Block {
    if (e.callee.kind === 'user') return { type: 'procedures_callnoreturn', extraState: callState(e.callee.name), inputs: argInputs(e.args) }
    const [first] = e.args
    switch (e.callee.name) {
      case 'step': return first ? { type: 'klonk_step_n', inputs: { COUNT: { block: expression(first) } } } : { type: 'klonk_step' }
      case 'turnLeft':
      case 'turnRight': return { type: 'klonk_turn', fields: { DIR: e.callee.name } }
      case 'placeBrick': return { type: 'klonk_place', fields: { COLOR: color(first, 'red') } }
      case 'pickBrick': return { type: 'klonk_pick' }
      case 'setMark': return { type: 'klonk_mark', fields: { COLOR: color(first, 'yellow') } }
      case 'removeMark': return { type: 'klonk_remove_mark' }
      case 'print': return { type: 'klonk_print', inputs: { VALUE: { block: first ? expression(first) : { type: 'text', fields: { TEXT: '' } } } } }
      case 'wait': return { type: 'klonk_wait', inputs: { SECONDS: { block: first ? expression(first) : { type: 'math_number', fields: { NUM: 1 } } } } }
      case 'selectCharacter': return { type: 'klonk_switch', inputs: { NAME: { block: expression(first!) } } }
      case 'createCharacter': {
        const look = e.args[1]?.type === 'String' ? LOOKS[e.args[1].value.toLowerCase()] : 'male'
        if (!look || e.args.length > 2) throw new BlocksConversionError('createCharacter', line)
        return { type: 'klonk_create', fields: { LOOK: look }, inputs: { NAME: { block: expression(first!) } } }
      }
    }
    throw new BlocksConversionError(e.callee.name, line)
  }

  /** Anweisungsfolge als verkettete Blöcke (nach `stopp` folgt nichts mehr – der Block hat keinen Nachfolger) */
  function sequence(list: Statement[]): Block | undefined {
    const blocks: Block[] = []
    for (const s of list) {
      blocks.push(statement(s))
      if (s.type === 'Stop') break
    }
    for (let i = blocks.length - 2; i >= 0; i--) blocks[i]!.next = { block: blocks[i + 1]! }
    return blocks[0]
  }
  const stack = (list: Statement[]) => {
    const first = sequence(list)
    return first ? { block: first } : undefined
  }
  const withInputs = (block: Block, inputs: Record<string, { block: Block } | undefined>) => {
    const defined = Object.entries(inputs).filter((entry): entry is [string, { block: Block }] => !!entry[1])
    return defined.length ? { ...block, inputs: { ...block.inputs, ...Object.fromEntries(defined) } } : block
  }

  function statement(s: Statement): Block {
    switch (s.type) {
      case 'ExpressionStatement':
        if (s.expression.type === 'Call') return command(s.expression, s.range.line)
        if (s.expression.type === 'Builtin') return command({ type: 'Call', callee: { kind: 'builtin', name: s.expression.name }, args: [], range: s.range }, s.range.line)
        if (s.expression.type === 'Variable' && procedures.has(s.expression.name)) return { type: 'procedures_callnoreturn', extraState: callState(s.expression.name) }
        throw new BlocksConversionError('expression', s.range.line)
      case 'VarDeclaration':
      case 'Assignment': {
        // `x = x + n` ⇒ „ändere x um n“ wäre möglich, „setze“ ist eindeutiger
        return { type: 'variables_set', fields: { VAR: { id: variableId(s.name) } }, inputs: { VALUE: { block: expression(s.value) } } }
      }
      case 'RepeatTimes': return withInputs({ type: 'klonk_repeat_times', inputs: { TIMES: { block: expression(s.count) } } }, { DO: stack(s.body) })
      case 'RepeatWhile': return withInputs({ type: 'klonk_repeat_while', fields: { MODE: s.until ? 'until' : 'while' }, inputs: { COND: { block: expression(s.condition) } } }, { DO: stack(s.body) })
      case 'RepeatForever': return withInputs({ type: 'klonk_repeat_forever' }, { DO: stack(s.body) })
      case 'If': {
        const inputs: Record<string, { block: Block } | undefined> = {}
        s.branches.forEach((branch, i) => {
          inputs[`IF${i}`] = { block: expression(branch.condition) }
          inputs[`DO${i}`] = stack(branch.body)
        })
        if (s.otherwise) inputs.ELSE = stack(s.otherwise)
        const extraState = { ...(s.branches.length > 1 ? { elseIfCount: s.branches.length - 1 } : {}), ...(s.otherwise ? { hasElse: true } : {}) }
        return withInputs({ type: 'controls_if', ...(Object.keys(extraState).length ? { extraState } : {}) }, inputs)
      }
      case 'Break': return { type: 'controls_flow_statements', fields: { FLOW: 'BREAK' } }
      case 'Continue': return { type: 'controls_flow_statements', fields: { FLOW: 'CONTINUE' } }
      case 'Stop': return { type: 'klonk_stop' }
      default: throw new BlocksConversionError(s.type, s.range.line)
    }
  }

  function definition(s: Extract<Statement, { type: 'Definition' }>): Block {
    const params = s.params.map(name => ({ name, id: variableId(name) }))
    let body = s.body
    let returned: Expression | undefined
    if (s.kind === 'function') {
      // Rückgabe nur als letzte Anweisung (Block „gib zurück“); sonst bleibt es Klonk-Script
      const last = body.at(-1)
      if (last?.type !== 'Return' || !last.value) throw new BlocksConversionError('Return', s.range.line)
      returned = last.value
      body = body.slice(0, -1)
    }
    const nested = (list: Statement[]): boolean => list.some(x => x.type === 'Return' || ('body' in x && nested(x.body)) || (x.type === 'If' && (x.branches.some(b => nested(b.body)) || nested(x.otherwise ?? []))))
    if (nested(body)) throw new BlocksConversionError('Return', s.range.line)
    return withInputs({
      type: s.kind === 'function' ? 'procedures_defreturn' : 'procedures_defnoreturn',
      fields: { NAME: s.name },
      ...(params.length ? { extraState: { params } } : {}),
      ...(returned ? { inputs: { RETURN: { block: expression(returned) } } } : {}),
    }, { STACK: stack(body) })
  }

  const definitions = program.body.filter((s): s is Extract<Statement, { type: 'Definition' }> => s.type === 'Definition')
  const main = program.body.filter(s => s.type !== 'Definition')
  if (program.body.some(s => s.type === 'Import')) throw new BlocksConversionError('Import', 1)

  const top: Block[] = []
  const first = sequence(main)
  if (first) top.push(first)
  for (const d of definitions) top.push(definition(d))
  // Untereinander anordnen (Blockly schiebt Überlappungen nicht selbst auseinander)
  let y = 40
  for (const block of top) {
    block.x = 40
    block.y = y
    y += 80 + 40 * countBlocks(block)
  }
  return {
    blocks: { languageVersion: 0, blocks: top },
    ...(variables.size ? { variables: [...variables].map(([name, id]) => ({ name, id })) } : {}),
  }
}

function countBlocks(block: Block): number {
  let n = 1
  for (const input of Object.values(block.inputs ?? {})) n += countBlocks(input.block)
  if (block.next) n += countBlocks(block.next.block)
  return n
}
