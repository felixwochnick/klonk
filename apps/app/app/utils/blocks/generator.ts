import { BUILTIN_INDEX, KEYWORD_INDEX, spell, type ScriptLanguage } from '@klonk/klonk-script'
import type * as BlocklyType from 'blockly/core'

type Blockly = typeof BlocklyType
type Block = BlocklyType.Block

/** Vorrang für Klammern im erzeugten Code */
const ORDER = { ATOMIC: 0, CALL: 1, UNARY: 2, MULTIPLY: 3, ADD: 4, COMPARE: 5, NOT: 6, AND: 7, OR: 8, NONE: 99 } as const

/** Markierung am Ende der ersten Zeile eines Anweisungsblocks (Kommentar, wird nach dem Erzeugen entfernt) */
const MARKER = ' #@'

export type GeneratedProgram = {
  code: string
  /** Zeile (ab 1) ⇒ Block-ID – für Hervorhebung und Haltepunkte */
  lineToBlock: Record<number, string>
}

/**
 * Erzeugt Klonk-Script aus Blöcken (in der UI-Sprache). Jede Anweisung beginnt eine eigene Zeile, sodass
 * Debugger-Zeilen eindeutig einem Block zugeordnet werden können.
 */
export function generateKlonkScript(Blockly: Blockly, workspace: BlocklyType.Workspace, lang: ScriptLanguage): GeneratedProgram {
  const k = (name: Parameters<typeof spell>[0]) => spell(name, lang)
  const gen = new Blockly.CodeGenerator('Klonk')
  gen.INDENT = '  '

  // Eigene Namen dürfen nicht mit Schlüsselwörtern oder Befehlen kollidieren (beide Sprachen)
  const reserved = [...KEYWORD_INDEX.keys(), ...BUILTIN_INDEX.keys()].join(',')
  gen.addReservedWords(reserved)
  gen.nameDB_ = new Blockly.Names(reserved)
  // Klonk-Script kennt Unicode-Namen – Umlaute behalten statt „z_C3_A4hler“, nur Leerzeichen & Co. ersetzen
  ;(gen.nameDB_ as unknown as { safeName: (name: string) => string }).safeName = (name: string) => {
    const safe = name.trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '')
    return !safe ? 'unbenannt' : /^\p{N}/u.test(safe) ? `_${safe}` : safe
  }
  gen.nameDB_.setVariableMap(workspace.getVariableMap())
  gen.nameDB_.populateVariables(workspace)
  gen.nameDB_.populateProcedures(workspace)

  const value = (block: Block, name: string, order: number, fallback = '0') => gen.valueToCode(block, name, order) || fallback
  const statements = (block: Block, name: string) => gen.statementToCode(block, name)
  const variable = (block: Block, field = 'VAR') => gen.getVariableName(block.getFieldValue(field))
  const procedure = (name: string) => gen.getProcedureName(name)

  // Folgeblöcke anhängen, erste Zeile jedes Anweisungsblocks markieren
  gen.scrub_ = (block, code, thisOnly) => {
    let own = code
    if (!block.outputConnection && own) {
      const newline = own.indexOf('\n')
      own = newline === -1 ? `${own}${MARKER}${block.id}` : `${own.slice(0, newline)}${MARKER}${block.id}${own.slice(newline)}`
    }
    const next = block.nextConnection?.targetBlock()
    return own + (thisOnly || !next ? '' : gen.blockToCode(next))
  }

  const f = gen.forBlock
  f.klonk_step = () => `${k('step')}\n`
  f.klonk_step_n = block => `${k('step')}(${value(block, 'COUNT', ORDER.NONE, '1')})\n`
  f.klonk_turn = block => `${k(block.getFieldValue('DIR'))}\n`
  f.klonk_place = block => `${k('placeBrick')}(${k(block.getFieldValue('COLOR'))})\n`
  f.klonk_pick = () => `${k('pickBrick')}\n`
  f.klonk_mark = block => `${k('setMark')}(${k(block.getFieldValue('COLOR'))})\n`
  f.klonk_remove_mark = () => `${k('removeMark')}\n`
  f.klonk_is_wall = () => [k('isWall'), ORDER.ATOMIC]
  f.klonk_is_brick = block => [block.getFieldValue('COLOR') === 'any' ? k('isBrick') : `${k('isBrick')}(${k(block.getFieldValue('COLOR'))})`, ORDER.CALL]
  f.klonk_is_mark = block => [block.getFieldValue('COLOR') === 'any' ? k('isMark') : `${k('isMark')}(${k(block.getFieldValue('COLOR'))})`, ORDER.CALL]
  f.klonk_facing = block => [k(block.getFieldValue('DIR')), ORDER.ATOMIC]
  f.klonk_number_sensor = block => [k(block.getFieldValue('SENSOR')), ORDER.ATOMIC]
  f.klonk_repeat_times = block => `${k('repeat')} ${value(block, 'TIMES', ORDER.ADD)} ${k('times')}\n${statements(block, 'DO')}${k('end')}\n`
  f.klonk_repeat_while = block => `${k('repeat')} ${k(block.getFieldValue('MODE'))} ${value(block, 'COND', ORDER.NONE, k('false'))}\n${statements(block, 'DO')}${k('end')}\n`
  f.klonk_repeat_forever = block => `${k('repeat')} ${k('forever')}\n${statements(block, 'DO')}${k('end')}\n`
  f.klonk_wait = block => `${k('wait')}(${value(block, 'SECONDS', ORDER.NONE, '1')})\n`
  f.klonk_stop = () => `${k('stop')}\n`
  // Aussehen als Text in der Sprache des Programms (erstelle("Kim", "weiblich"))
  const LOOKS = { de: { male: 'männlich', female: 'weiblich', diverse: 'divers' }, en: { male: 'male', female: 'female', diverse: 'diverse' } } as const
  f.klonk_create = block => `${k('createCharacter')}(${value(block, 'NAME', ORDER.NONE, '""')}, "${LOOKS[lang][block.getFieldValue('LOOK') as 'male']}")\n`
  f.klonk_switch = block => `${k('selectCharacter')}(${value(block, 'NAME', ORDER.NONE, '""')})\n`
  f.klonk_print = block => `${k('print')}(${value(block, 'VALUE', ORDER.NONE, '""')})\n`
  f.klonk_join = block => [`${value(block, 'A', ORDER.ADD, '""')} + ${value(block, 'B', ORDER.MULTIPLY, '""')}`, ORDER.ADD]
  f.klonk_arithmetic = (block) => {
    const op = block.getFieldValue('OP') as string
    const order = op === '+' || op === '-' ? ORDER.ADD : ORDER.MULTIPLY
    // Rechte Seite eine Stufe enger binden: a - (b - c)
    return [`${value(block, 'A', order)} ${op} ${value(block, 'B', order - 1)}`, order]
  }

  // Eingebaute Blockly-Blöcke
  f.controls_if = (block) => {
    let code = ''
    const elseIfs = (block as Block & { elseifCount_?: number }).elseifCount_ ?? 0
    for (let i = 0; i <= elseIfs; i++) {
      const condition = value(block, `IF${i}`, ORDER.NONE, k('false'))
      code += `${i === 0 ? k('if') : `${k('else')} ${k('if')}`} ${condition} ${k('then')}\n${statements(block, `DO${i}`)}`
    }
    if (block.getInput('ELSE')) code += `${k('else')}\n${statements(block, 'ELSE')}`
    return `${code}${k('end')}\n`
  }
  f.controls_flow_statements = block => `${block.getFieldValue('FLOW') === 'BREAK' ? k('break') : k('continue')}\n`
  f.logic_boolean = block => [block.getFieldValue('BOOL') === 'TRUE' ? k('true') : k('false'), ORDER.ATOMIC]
  f.logic_negate = block => [`${k('not')} ${value(block, 'BOOL', ORDER.NOT, k('true'))}`, ORDER.NOT]
  f.logic_operation = (block) => {
    const and = block.getFieldValue('OP') === 'AND'
    const order = and ? ORDER.AND : ORDER.OR
    return [`${value(block, 'A', order, k('false'))} ${and ? k('and') : k('or')} ${value(block, 'B', order, k('false'))}`, order]
  }
  f.logic_compare = (block) => {
    const ops: Record<string, string> = { EQ: '=', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' }
    return [`${value(block, 'A', ORDER.COMPARE)} ${ops[block.getFieldValue('OP')]} ${value(block, 'B', ORDER.COMPARE)}`, ORDER.COMPARE]
  }
  f.math_number = block => [String(Number(block.getFieldValue('NUM'))), Number(block.getFieldValue('NUM')) < 0 ? ORDER.UNARY : ORDER.ATOMIC]
  f.math_random_int = block => [`${k('random')}(${value(block, 'FROM', ORDER.NONE)}, ${value(block, 'TO', ORDER.NONE)})`, ORDER.CALL]
  f.text = block => [JSON.stringify(String(block.getFieldValue('TEXT'))), ORDER.ATOMIC]
  f.variables_get = block => [variable(block), ORDER.ATOMIC]
  f.variables_set = block => `${variable(block)} = ${value(block, 'VALUE', ORDER.NONE)}\n`
  f.math_change = block => `${variable(block)} = ${variable(block)} + ${value(block, 'DELTA', ORDER.ADD)}\n`

  // Eigene Anweisungen und Funktionen
  const definition = (block: Block, kind: 'procedure' | 'function') => {
    const name = procedure(block.getFieldValue('NAME'))
    const models = (block as Block & { getVarModels?: () => { getId: () => string }[] }).getVarModels?.() ?? []
    const params = models.map(model => gen.getVariableName(model.getId()))
    const header = `${k(kind)} ${name}${params.length ? `(${params.join(', ')})` : ''}`
    const ret = kind === 'function' ? `${gen.INDENT}${k('return')} ${value(block, 'RETURN', ORDER.NONE)}\n` : ''
    return `${header}\n${statements(block, 'STACK')}${ret}${k('end')}\n`
  }
  f.procedures_defnoreturn = block => definition(block, 'procedure')
  f.procedures_defreturn = block => definition(block, 'function')
  const call = (block: Block) => {
    const args = (block as Block & { arguments_?: string[] }).arguments_?.map((_, i) => value(block, `ARG${i}`, ORDER.NONE)) ?? []
    return `${procedure(block.getFieldValue('NAME'))}${args.length ? `(${args.join(', ')})` : ''}`
  }
  f.procedures_callnoreturn = block => `${call(block)}\n`
  f.procedures_callreturn = block => [call(block), ORDER.CALL]
  f.procedures_ifreturn = (block) => {
    const condition = value(block, 'CONDITION', ORDER.NONE, k('false'))
    const result = (block as Block & { hasReturnValue_?: boolean }).hasReturnValue_ ? ` ${value(block, 'VALUE', ORDER.NONE)}` : ''
    return `${k('if')} ${condition} ${k('then')}\n${gen.INDENT}${k('return')}${result}\n${k('end')}\n`
  }

  // Programm: Variablen anlegen, dann Hauptprogramm (Blöcke von oben nach unten), dann Definitionen
  const variables = workspace.getVariableMap().getAllVariables().map(v => `${k('var')} ${gen.getVariableName(v.getId())} = 0`)
  const main: string[] = []
  const definitions: string[] = []
  for (const block of workspace.getTopBlocks(true)) {
    if (block.outputConnection || !block.isEnabled()) continue
    const code = gen.blockToCode(block)
    if (typeof code !== 'string' || !code) continue
    if (block.type.startsWith('procedures_def')) definitions.push(code)
    else main.push(code)
  }
  const text = variables.length ? `${variables.join('\n')}\n\n${main.join('')}${definitions.map(d => `\n${d}`).join('')}` : `${main.join('')}${definitions.map(d => `\n${d}`).join('')}`

  // Markierungen auswerten und entfernen
  const lineToBlock: Record<number, string> = {}
  const lines = text.split('\n').map((line, index) => {
    const at = line.indexOf(MARKER)
    if (at === -1) return line
    lineToBlock[index + 1] = line.slice(at + MARKER.length)
    return line.slice(0, at)
  })
  return { code: lines.join('\n').trimEnd() + '\n', lineToBlock }
}
