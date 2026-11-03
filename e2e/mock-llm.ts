import { createServer, type Server } from 'node:http'

// Nachgebauter Anbieter für die KI-Tests: OpenAI-kompatibel (/v1/chat/completions) und Anthropic (/v1/messages).
// Antwortet gestreamt mit einem festen Text samt Codeblock, meldet einen festen Verbrauch und merkt sich die
// Anfragen (Systemprompt, Modell, Parameter prüfen).

type MockRequest = {
  path: string
  model: string
  system?: string
  messages: { role: string, content: string }[]
  stream_options?: { include_usage?: boolean }
}
export type MockLlm = { url: string, requests: MockRequest[], close: () => Promise<void> }

/** Verbrauch, den der Anbieter je Antwort meldet */
export const MOCK_USAGE = { input: 1000, output: 50 }

export const MOCK_ANSWER = 'Hier ist ein Tipp: Nutze `step()` in einer **Schleife**.\n\n```js\nimport { Klonk } from \'klonk\'\nconst klonk = new Klonk()\nklonk.step(2)\n```\nViel Erfolg!'

export function startMockLlm(port = 3014): Promise<MockLlm> {
  const requests: MockLlm['requests'] = []
  const server: Server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', async () => {
      const anthropic = req.url?.endsWith('/messages')
      if (req.method !== 'POST' || (!anthropic && !req.url?.endsWith('/chat/completions'))) {
        res.writeHead(404).end()
        return
      }
      const key = anthropic ? req.headers['x-api-key'] : req.headers.authorization?.replace(/^Bearer /, '')
      if (key !== 'test-key') {
        res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"unauthorized"}')
        return
      }
      const request = { ...JSON.parse(body), path: req.url }
      requests.push(request)
      const pieces = MOCK_ANSWER.match(/[\s\S]{1,12}/g)!

      if (anthropic) {
        if (!request.stream) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ model: request.model, content: [{ type: 'text', text: 'OK' }] }))
          return
        }
        const send = (type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        send('message_start', { message: { usage: { input_tokens: MOCK_USAGE.input, output_tokens: 1 } } })
        for (const text of pieces) {
          send('content_block_delta', { index: 0, delta: { type: 'text_delta', text } })
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        send('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: MOCK_USAGE.output } })
        send('message_stop', {})
        res.end()
        return
      }
      if (!request.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ model: request.model, choices: [{ message: { role: 'assistant', content: 'OK' } }] }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      // In Stücken senden – wie ein echtes Modell
      for (const piece of pieces) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      if (request.stream_options?.include_usage)
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: MOCK_USAGE.input, completion_tokens: MOCK_USAGE.output } })}\n\n`)
      res.end('data: [DONE]\n\n')
    })
  })
  return new Promise((resolve) => {
    server.listen(port, () => resolve({
      url: `http://localhost:${port}/v1`,
      requests,
      close: () => new Promise(done => server.close(() => done())),
    }))
  })
}

// Direkt gestartet: als eigenständiger Testserver (manuelles Ausprobieren)
if (import.meta.url === `file://${process.argv[1]}`) {
  const llm = await startMockLlm(Number(process.env.PORT ?? 3014))
  console.log(`Mock-LLM unter ${llm.url} (API-Schlüssel test-key)`)
}
