import type { SourceRange } from './errors'
import type { BuiltinName } from './languages'

type Node<T extends string, P> = { type: T, range: SourceRange } & P

export type Expression
  = | Node<'Number', { value: number }>
    | Node<'String', { value: string }>
    | Node<'Boolean', { value: boolean }>
    | Node<'Variable', { name: string }>
    | Node<'Builtin', { name: BuiltinName }>
    | Node<'Unary', { operator: '-' | 'not', operand: Expression }>
    | Node<'Binary', { operator: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '>' | '<=' | '>=' | 'and' | 'or', left: Expression, right: Expression }>
    | Node<'Call', { callee: { kind: 'builtin', name: BuiltinName } | { kind: 'user', name: string }, args: Expression[] }>

export type Statement
  = | Node<'ExpressionStatement', { expression: Expression }>
    | Node<'VarDeclaration', { name: string, value: Expression }>
    | Node<'Assignment', { name: string, value: Expression }>
    | Node<'RepeatTimes', { count: Expression, body: Statement[] }>
    | Node<'RepeatWhile', { condition: Expression, until: boolean, body: Statement[] }>
    | Node<'RepeatForever', { body: Statement[] }>
    | Node<'If', { branches: { condition: Expression, body: Statement[] }[], otherwise?: Statement[] }>
    | Node<'Definition', { kind: 'procedure' | 'function', name: string, params: string[], body: Statement[] }>
    | Node<'Return', { value?: Expression }>
    | Node<'Break', object>
    | Node<'Continue', object>
    | Node<'Stop', object>
    | Node<'Import', { path: string }>

export type Program = { type: 'Program', body: Statement[] }
