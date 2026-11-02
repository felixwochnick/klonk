import { CreateMLCEngine, type MLCEngine } from '@mlc-ai/web-llm'

// KI-Assistent im Browser (WebLLM, WebGPU): das ganze Paket (~6 MB) lebt nur in diesem Worker.
// Protokoll: load ⇒ progress…/ready | error; chat ⇒ token…/done | error; stop bricht die Antwort ab.

export type WebLlmRequest
  = | { type: 'load', model: string }
    | { type: 'chat', id: number, messages: { role: 'system' | 'user' | 'assistant', content: string }[] }
    | { type: 'stop' }

export type WebLlmResponse
  = | { type: 'progress', text: string, progress: number }
    | { type: 'ready' }
    | { type: 'token', id: number, text: string }
    | { type: 'done', id: number }
    | { type: 'error', id?: number, message: string }

let engine: Promise<MLCEngine> | undefined
const post = (message: WebLlmResponse) => self.postMessage(message)

self.onmessage = async ({ data }: MessageEvent<WebLlmRequest>) => {
  if (data.type === 'load') {
    engine ??= CreateMLCEngine(data.model, {
      initProgressCallback: report => post({ type: 'progress', text: report.text, progress: report.progress }),
    })
    try {
      await engine
      post({ type: 'ready' })
    }
    catch (error) {
      engine = undefined
      post({ type: 'error', message: (error as Error).message })
    }
  }
  else if (data.type === 'chat') {
    try {
      const llm = await engine!
      const chunks = await llm.chat.completions.create({ messages: data.messages, stream: true })
      for await (const chunk of chunks) {
        const text = chunk.choices[0]?.delta.content
        if (text) post({ type: 'token', id: data.id, text })
      }
      post({ type: 'done', id: data.id })
    }
    catch (error) {
      post({ type: 'error', id: data.id, message: (error as Error).message })
    }
  }
  else if (data.type === 'stop') {
    void engine?.then(llm => llm.interruptGenerate())
  }
}
