import { spell, type ScriptLanguage } from '@klonk/klonk-script'
import type * as BlocklyType from 'blockly/core'

type Blockly = typeof BlocklyType
type T = (key: string) => string

/** Farben der Kategorien (Klemmbaustein-Palette) */
export const CATEGORY_COLORS = {
  movement: '#0055bf',
  bricks: '#c91a09',
  sensors: '#237841',
  control: '#f2a900',
  logic: '#5a8f29',
  math: '#7b2d8e',
  text: '#3f6fa0',
  variables: '#d36e00',
  procedures: '#a2386b',
} as const

const BRICK_COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'white', 'black'] as const
const MARK_COLORS = ['yellow', 'red', 'blue', 'green'] as const

/**
 * Definiert die Klonk-Blöcke. Beschriftungen kommen aus denselben Tabellen wie Klonk-Script
 * (`wiederhole 3 mal` / `repeat 3 times`), zusätzliche Wörter aus der i18n.
 */
export function defineKlonkBlocks(Blockly: Blockly, lang: ScriptLanguage, t: T) {
  const k = (name: Parameters<typeof spell>[0]) => spell(name, lang)
  const colors = (list: readonly string[]) => list.map(c => [t(`world.colors.${c}`), c] as [string, string])

  Blockly.common.defineBlocksWithJsonArray([
    // Bewegung
    { type: 'klonk_step', message0: k('step'), previousStatement: null, nextStatement: null, style: 'movement_blocks', tooltip: t('blocks.tooltips.step') },
    {
      type: 'klonk_step_n',
      message0: `${k('step')} %1 ×`,
      args0: [{ type: 'input_value', name: 'COUNT', check: 'Number' }],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      style: 'movement_blocks',
      tooltip: t('blocks.tooltips.step'),
    },
    {
      type: 'klonk_turn',
      message0: '%1',
      args0: [{ type: 'field_dropdown', name: 'DIR', options: [[`${k('turnLeft')} ↺`, 'turnLeft'], [`${k('turnRight')} ↻`, 'turnRight']] }],
      previousStatement: null,
      nextStatement: null,
      style: 'movement_blocks',
      tooltip: t('blocks.tooltips.turn'),
    },

    // Ziegel & Marken
    {
      type: 'klonk_place',
      message0: `${k('placeBrick')} %1`,
      args0: [{ type: 'field_dropdown', name: 'COLOR', options: colors(BRICK_COLORS) }],
      previousStatement: null,
      nextStatement: null,
      style: 'bricks_blocks',
      tooltip: t('blocks.tooltips.place'),
    },
    { type: 'klonk_pick', message0: k('pickBrick'), previousStatement: null, nextStatement: null, style: 'bricks_blocks', tooltip: t('blocks.tooltips.pick') },
    {
      type: 'klonk_mark',
      message0: `${k('setMark')} %1`,
      args0: [{ type: 'field_dropdown', name: 'COLOR', options: colors(MARK_COLORS) }],
      previousStatement: null,
      nextStatement: null,
      style: 'bricks_blocks',
      tooltip: t('blocks.tooltips.mark'),
    },
    { type: 'klonk_remove_mark', message0: k('removeMark'), previousStatement: null, nextStatement: null, style: 'bricks_blocks', tooltip: t('blocks.tooltips.removeMark') },

    // Sensoren
    { type: 'klonk_is_wall', message0: k('isWall'), output: 'Boolean', style: 'sensors_blocks', tooltip: t('blocks.tooltips.isWall') },
    {
      type: 'klonk_is_brick',
      message0: `${k('isBrick')} %1`,
      args0: [{ type: 'field_dropdown', name: 'COLOR', options: [[t('blocks.anyColor'), 'any'], ...colors(BRICK_COLORS)] }],
      output: 'Boolean',
      style: 'sensors_blocks',
      tooltip: t('blocks.tooltips.isBrick'),
    },
    {
      type: 'klonk_is_mark',
      message0: `${k('isMark')} %1`,
      args0: [{ type: 'field_dropdown', name: 'COLOR', options: [[t('blocks.anyColor'), 'any'], ...colors(MARK_COLORS)] }],
      output: 'Boolean',
      style: 'sensors_blocks',
      tooltip: t('blocks.tooltips.isMark'),
    },
    {
      type: 'klonk_facing',
      message0: '%1',
      args0: [{ type: 'field_dropdown', name: 'DIR', options: [[k('isFacingNorth'), 'isFacingNorth'], [k('isFacingEast'), 'isFacingEast'], [k('isFacingSouth'), 'isFacingSouth'], [k('isFacingWest'), 'isFacingWest']] }],
      output: 'Boolean',
      style: 'sensors_blocks',
      tooltip: t('blocks.tooltips.facing'),
    },
    {
      type: 'klonk_number_sensor',
      message0: '%1',
      args0: [{ type: 'field_dropdown', name: 'SENSOR', options: [[k('brickCount'), 'brickCount'], [k('positionX'), 'positionX'], [k('positionY'), 'positionY']] }],
      output: 'Number',
      style: 'sensors_blocks',
      tooltip: t('blocks.tooltips.numberSensor'),
    },

    // Steuerung
    {
      type: 'klonk_repeat_times',
      message0: `${k('repeat')} %1 ${k('times')}`,
      args0: [{ type: 'input_value', name: 'TIMES', check: 'Number' }],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      style: 'control_blocks',
      tooltip: t('blocks.tooltips.repeatTimes'),
    },
    {
      type: 'klonk_repeat_while',
      message0: `${k('repeat')} %1 %2`,
      args0: [
        { type: 'field_dropdown', name: 'MODE', options: [[k('while'), 'while'], [k('until'), 'until']] },
        { type: 'input_value', name: 'COND', check: 'Boolean' },
      ],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      style: 'control_blocks',
      tooltip: t('blocks.tooltips.repeatWhile'),
    },
    {
      type: 'klonk_repeat_forever',
      message0: `${k('repeat')} ${k('forever')}`,
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      style: 'control_blocks',
      tooltip: t('blocks.tooltips.repeatForever'),
    },
    {
      type: 'klonk_wait',
      message0: `${k('wait')} %1 s`,
      args0: [{ type: 'input_value', name: 'SECONDS', check: 'Number' }],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      style: 'control_blocks',
      tooltip: t('blocks.tooltips.wait'),
    },
    { type: 'klonk_stop', message0: k('stop'), previousStatement: null, style: 'control_blocks', tooltip: t('blocks.tooltips.stop') },

    // Mathe & Text
    {
      type: 'klonk_arithmetic',
      message0: '%1 %2 %3',
      args0: [
        { type: 'input_value', name: 'A', check: 'Number' },
        { type: 'field_dropdown', name: 'OP', options: [['+', '+'], ['−', '-'], ['×', '*'], ['÷', '/'], ['mod', '%']] },
        { type: 'input_value', name: 'B', check: 'Number' },
      ],
      inputsInline: true,
      output: 'Number',
      style: 'math_blocks',
    },
    {
      type: 'klonk_print',
      message0: `${k('print')} %1`,
      args0: [{ type: 'input_value', name: 'VALUE' }],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      style: 'text_blocks',
      tooltip: t('blocks.tooltips.print'),
    },
    {
      type: 'klonk_join',
      message0: '%1 + %2',
      args0: [{ type: 'input_value', name: 'A' }, { type: 'input_value', name: 'B' }],
      inputsInline: true,
      output: 'String',
      style: 'text_blocks',
      tooltip: t('blocks.tooltips.join'),
    },
  ])
}

/** Werkzeugkasten (Kategorien) */
export function toolbox(t: T) {
  const num = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } })
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: t('blocks.categories.movement'),
        categorystyle: 'movement_category', toolboxitemid: 'movement',
        contents: [
          { kind: 'block', type: 'klonk_step' },
          { kind: 'block', type: 'klonk_step_n', inputs: { COUNT: num(2) } },
          { kind: 'block', type: 'klonk_turn' },
          { kind: 'block', type: 'klonk_turn', fields: { DIR: 'turnRight' } },
        ],
      },
      {
        kind: 'category',
        name: t('blocks.categories.bricks'),
        categorystyle: 'bricks_category', toolboxitemid: 'bricks',
        contents: ['klonk_place', 'klonk_pick', 'klonk_mark', 'klonk_remove_mark'].map(type => ({ kind: 'block', type })),
      },
      {
        kind: 'category',
        name: t('blocks.categories.sensors'),
        categorystyle: 'sensors_category', toolboxitemid: 'sensors',
        contents: ['klonk_is_wall', 'klonk_is_brick', 'klonk_is_mark', 'klonk_facing', 'klonk_number_sensor'].map(type => ({ kind: 'block', type })),
      },
      {
        kind: 'category',
        name: t('blocks.categories.control'),
        categorystyle: 'control_category', toolboxitemid: 'control',
        contents: [
          { kind: 'block', type: 'klonk_repeat_times', inputs: { TIMES: num(4) } },
          { kind: 'block', type: 'klonk_repeat_while', inputs: { COND: { block: { type: 'logic_negate', inputs: { BOOL: { block: { type: 'klonk_is_wall' } } } } } } },
          { kind: 'block', type: 'klonk_repeat_forever' },
          { kind: 'block', type: 'controls_if' },
          { kind: 'block', type: 'controls_if', extraState: { hasElse: true } },
          { kind: 'block', type: 'controls_flow_statements' },
          { kind: 'block', type: 'klonk_wait', inputs: { SECONDS: num(1) } },
          { kind: 'block', type: 'klonk_stop' },
        ],
      },
      {
        kind: 'category',
        name: t('blocks.categories.logic'),
        categorystyle: 'logic_category', toolboxitemid: 'logic',
        contents: ['logic_negate', 'logic_operation', 'logic_compare', 'logic_boolean'].map(type => ({ kind: 'block', type })),
      },
      {
        kind: 'category',
        name: t('blocks.categories.math'),
        categorystyle: 'math_category', toolboxitemid: 'math',
        contents: [
          { kind: 'block', type: 'math_number' },
          { kind: 'block', type: 'klonk_arithmetic', inputs: { A: num(1), B: num(1) } },
          { kind: 'block', type: 'math_random_int', inputs: { FROM: num(1), TO: num(6) } },
        ],
      },
      {
        kind: 'category',
        name: t('blocks.categories.text'),
        categorystyle: 'text_category', toolboxitemid: 'text',
        contents: [
          { kind: 'block', type: 'klonk_print', inputs: { VALUE: { shadow: { type: 'text', fields: { TEXT: t('blocks.hello') } } } } },
          { kind: 'block', type: 'text' },
          { kind: 'block', type: 'klonk_join' },
        ],
      },
      { kind: 'category', name: t('blocks.categories.variables'), categorystyle: 'variable_category', toolboxitemid: 'variables', custom: 'VARIABLE' },
      { kind: 'category', name: t('blocks.categories.procedures'), categorystyle: 'procedure_category', toolboxitemid: 'procedures', custom: 'PROCEDURE' },
    ],
  }
}

/** Theme mit Klemmbaustein-Farben, hell und dunkel */
export function klonkTheme(Blockly: Blockly, dark: boolean) {
  const style = (color: string) => ({ colourPrimary: color, colourSecondary: mix(color, '#ffffff', 0.35), colourTertiary: mix(color, '#000000', 0.25) })
  const categoryStyles = Object.fromEntries(Object.entries(CATEGORY_COLORS).map(([name, colour]) => [
    name === 'variables' ? 'variable_category' : name === 'procedures' ? 'procedure_category' : `${name}_category`,
    { colour },
  ]))
  return Blockly.Theme.defineTheme(dark ? 'klonk-dark' : 'klonk-light', {
    name: dark ? 'klonk-dark' : 'klonk-light',
    base: Blockly.Themes.Classic,
    blockStyles: {
      movement_blocks: style(CATEGORY_COLORS.movement),
      bricks_blocks: style(CATEGORY_COLORS.bricks),
      sensors_blocks: style(CATEGORY_COLORS.sensors),
      control_blocks: style(CATEGORY_COLORS.control),
      loop_blocks: style(CATEGORY_COLORS.control),
      logic_blocks: style(CATEGORY_COLORS.logic),
      math_blocks: style(CATEGORY_COLORS.math),
      text_blocks: style(CATEGORY_COLORS.text),
      variable_blocks: style(CATEGORY_COLORS.variables),
      procedure_blocks: style(CATEGORY_COLORS.procedures),
    },
    categoryStyles,
    componentStyles: dark
      ? {
          workspaceBackgroundColour: '#18181b',
          toolboxBackgroundColour: '#27272a',
          toolboxForegroundColour: '#f4f4f5',
          flyoutBackgroundColour: '#27272a',
          flyoutForegroundColour: '#f4f4f5',
          flyoutOpacity: 0.95,
          scrollbarColour: '#52525b',
          insertionMarkerColour: '#ffffff',
        }
      : {
          workspaceBackgroundColour: '#fafafa',
          toolboxBackgroundColour: '#f4f4f5',
          flyoutBackgroundColour: '#e4e4e7',
          flyoutOpacity: 0.95,
        },
    fontStyle: { family: 'Nunito, sans-serif', weight: '600', size: 12 },
    startHats: false,
  })
}

/** Zwei Farben mischen (Blockly akzeptiert nur #rrggbb) */
function mix(a: string, b: string, amount: number) {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2].map(i => Math.round(channel(a, i) * (1 - amount) + channel(b, i) * amount).toString(16).padStart(2, '0')).join('')}`
}
