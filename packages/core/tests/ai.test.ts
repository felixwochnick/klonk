import { describe, expect, it } from 'vitest'
import { AiUsageTracker, aiTextStream } from '../server/utils/ai'
import { aiCostMillicredits, aiSystemPrompt } from '../shared/utils/ai'

async function collect(chunks: string[], provider: 'openai' | 'anthropic' = 'openai', tracker?: AiUsageTracker) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(aiTextStream(body, provider, tracker)).text()
}

describe('KI-Assistent', () => {
  it('liest die Inhalts-Deltas aus Server-Sent Events (auch über Paketgrenzen)', async () => {
    const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
    const stream = event('Hallo') + ': keep-alive\n\n' + `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n` + event(' Welt') + 'data: [DONE]\n\n'
    // In ungünstigen Stücken (mitten in JSON und Zeilen)
    const chunks = stream.match(/[\s\S]{1,7}/g)!
    expect(await collect(chunks)).toBe('Hallo Welt')
  })

  it('liest Text und Verbrauch aus Anthropic-Events', async () => {
    const event = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
    const stream = event('message_start', { message: { usage: { input_tokens: 120, cache_read_input_tokens: 30, output_tokens: 1 } } })
      + event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      + event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Hallo' } })
      + event('ping', {})
      + event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: ' Welt' } })
      + event('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } })
      + event('message_stop', {})
    const tracker = new AiUsageTracker()
    expect(await collect(stream.match(/[\s\S]{1,11}/g)!, 'anthropic', tracker)).toBe('Hallo Welt')
    expect(tracker.usage).toEqual({ input: 150, output: 7 })
  })

  it('OpenAI: Verbrauch aus dem letzten Paket, sonst geschätzt', async () => {
    const withUsage = new AiUsageTracker(400)
    await collect([`data: ${JSON.stringify({ choices: [{ delta: { content: 'abcdefgh' } }] })}\n\n`, `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 90, completion_tokens: 3 } })}\n\ndata: [DONE]\n\n`], 'openai', withUsage)
    expect(withUsage.usage).toEqual({ input: 90, output: 3 })
    const estimated = new AiUsageTracker(400)
    await collect([`data: ${JSON.stringify({ choices: [{ delta: { content: 'abcdefgh' } }] })}\n\n`], 'openai', estimated)
    expect(estimated.usage).toEqual({ input: 100, output: 2 })
  })

  it('Kosten in Tausendstel-Credits (Preise je 1 Mio. Tokens, aufgerundet)', () => {
    // 1000 Eingabe-Tokens à 30 Credits/Mio. + 500 Ausgabe-Tokens à 120 Credits/Mio. = 0,03 + 0,06 Credits
    expect(aiCostMillicredits({ inputCredits: 30, outputCredits: 120 }, { input: 1000, output: 500 })).toBe(90)
    expect(aiCostMillicredits({ inputCredits: 1, outputCredits: 1 }, { input: 1, output: 0 })).toBe(1)
  })

  it('Systemprompt: Tutor oder volle Hilfe, Kontext am Ende', () => {
    const tutor = aiSystemPrompt({ tutor: true, locale: 'de', context: 'CODE' })
    expect(tutor).toContain('KEINE fertigen Lösungen')
    expect(tutor.endsWith('CODE')).toBe(true)
    expect(aiSystemPrompt({ tutor: false, locale: 'en' })).toContain('You may write and fix complete code')
  })
})
