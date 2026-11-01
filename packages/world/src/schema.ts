import { z } from 'zod'
import { WorldError } from './errors'
import { BRICK_COLORS, CHARACTER_MODELS, DIRECTIONS, MARK_COLORS, type WorldData } from './types'

const coordinate = z.number().int().min(0).max(255)

export const worldSchema = z.object({
  version: z.literal(1),
  size: z.object({
    width: z.number().int().min(1).max(64),
    depth: z.number().int().min(1).max(64),
    height: z.number().int().min(1).max(32),
  }),
  maxJump: z.number().int().min(0).max(32).optional(),
  cells: z.array(z.object({
    x: coordinate,
    z: coordinate,
    bricks: z.array(z.enum(BRICK_COLORS)).optional(),
    mark: z.enum(MARK_COLORS).nullable().optional(),
    block: z.boolean().optional(),
  })).max(64 * 64),
  characters: z.array(z.object({
    id: z.string().min(1).max(64),
    model: z.enum(CHARACTER_MODELS),
    x: coordinate,
    z: coordinate,
    direction: z.enum(DIRECTIONS),
  })).max(32),
})

/** Prüft Weltdaten (z. B. aus Dateien) und liefert eine typisierte Kopie */
export function parseWorld(data: unknown): WorldData {
  const result = worldSchema.safeParse(data)
  if (!result.success) throw new WorldError('invalid_world', { reason: result.error.issues[0]?.path.join('.') ?? '' })
  return result.data as WorldData
}
