import { createServer, type Server } from 'node:http'

// Nachgebauter OpenAI-kompatibler Endpunkt (/v1/chat/completions) für die KI-Tests: antwortet gestreamt
// mit einem festen Text samt Codeblock und merkt sich die Anfragen (Systemprompt prüfen).

export type MockLlm = { url: string, requests: { model: string, messages: { role: string, content: string }[] }[], close: () => Promise<void> }

export const MOCK_ANSWER = 'Hier ist ein Tipp: Nutze `step()` in einer **Schleife**.\n\n```js\nimport { Klonk } from \'klonk\'\nconst klonk = new Klonk()\nklonk.step(2)\n```\nViel Erfolg!'

export function startMockLlm(port = 3014): Promise<MockLlm> {
  const requests: MockLlm['requests'] = []
  const server: Server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', async () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
        res.writeHead(404).end()
        return
      }
      if (req.headers.authorization !== 'Bearer test-key') {
        res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"unauthorized"}')
        return
      }
      const request = JSON.parse(body)
      requests.push(request)
      if (!request.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ model: request.model, choices: [{ message: { role: 'assistant', content: 'OK' } }] }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      // In Stücken senden – wie ein echtes Modell
      for (const piece of MOCK_ANSWER.match(/[\s\S]{1,12}/g)!) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
        await new Promise(resolve => setTimeout(resolve, 10))
      }
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
