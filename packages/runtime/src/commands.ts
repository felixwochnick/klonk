import type { RobotCommand } from '@klonk/klonk-script'
import { BRICK_COLORS, MARK_COLORS, characterSchema, type BrickColor, type CharacterData, type MarkColor, type World } from '@klonk/world'

/** Befehl aus dem Worker (bzw. vom Server der gemeinsamen Welt) auf einer Welt nachspielen */
export function applyCommand(world: World, command: RobotCommand) {
  switch (command.name) {
    case 'placeBrick':
      world.placeBrick(command.id, command.color)
      break
    case 'setMark':
      world.setMark(command.id, command.color)
      break
    case 'createCharacter':
      world.addCharacter(command.character)
      break
    default:
      world[command.name](command.id)
  }
}

const SIMPLE_COMMANDS = ['step', 'turnLeft', 'turnRight', 'pickBrick', 'removeMark'] as const

/** Befehl aus einer nicht vertrauenswürdigen Quelle (Nachricht eines Clients der gemeinsamen Welt) prüfen */
export function parseRobotCommand(value: unknown): RobotCommand | null {
  if (!value || typeof value !== 'object') return null
  const { name, id, color, character } = value as Record<string, unknown>
  if (typeof id !== 'string' || !id || id.length > 64) return null
  if ((SIMPLE_COMMANDS as readonly unknown[]).includes(name)) return { name: name as typeof SIMPLE_COMMANDS[number], id }
  if (name === 'placeBrick') return (BRICK_COLORS as readonly unknown[]).includes(color) ? { name, id, color: color as BrickColor } : null
  if (name === 'setMark') return (MARK_COLORS as readonly unknown[]).includes(color) ? { name, id, color: color as MarkColor } : null
  if (name === 'createCharacter') {
    const parsed = characterSchema.safeParse(character)
    return parsed.success && parsed.data.id === id ? { name, id, character: parsed.data as CharacterData } : null
  }
  return null
}
