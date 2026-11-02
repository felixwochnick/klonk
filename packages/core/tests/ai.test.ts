import { describe, expect, it } from 'vitest'
import { completionTextStream } from '../server/utils/ai'
import { aiSystemPrompt } from '../shared/utils/ai'

async function collect(chunks: string[]) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(completionTextStream(body)).text()
}

describe('KI-Assistent', () => {
  it('liest die Inhalts-Deltas aus Server-Sent Events (auch über Paketgrenzen)', async () => {
    const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
    const stream = event('Hallo') + ': keep-alive\n\n' + `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n` + event(' Welt') + 'data: [DONE]\n\n'
    // In ungünstigen Stücken (mitten in JSON und Zeilen)
    const chunks = stream.match(/[\s\S]{1,7}/g)!
    expect(await collect(chunks)).toBe('Hallo Welt')
  })

  it('Systemprompt: Tutor oder volle Hilfe, Kontext am Ende', () => {
    const tutor = aiSystemPrompt({ tutor: true, locale: 'de', context: 'CODE' })
    expect(tutor).toContain('KEINE fertigen Lösungen')
    expect(tutor.endsWith('CODE')).toBe(true)
    expect(aiSystemPrompt({ tutor: false, locale: 'en' })).toContain('You may write and fix complete code')
  })
})
