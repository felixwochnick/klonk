import * as Y from 'yjs'
import type { editor as MonacoEditor, IDisposable } from 'monaco-editor'
import type { Monaco } from '~/utils/monaco'
import type { LiveProjectSession } from './project-session'

/** Namen und Farben der Cursor anderer Personen (eine Regel je Yjs-Client, Text per CSS-Inhalt) */
let styleElement: HTMLStyleElement | undefined
const cursorRules = new Map<number, string>()
function cursorStyle(clientId: number, name: string, color: string) {
  const rule = `.klonk-live-sel-${clientId}{background:${color}33}`
    + `.klonk-live-cur-${clientId}{border-left:2px solid ${color};margin-left:-1px}`
    + `.klonk-live-cur-${clientId}::after{content:${JSON.stringify(name)};position:absolute;transform:translateY(-100%);background:${color};color:#fff;font-size:11px;line-height:14px;padding:0 4px;border-radius:3px;white-space:nowrap;pointer-events:none;z-index:10}`
  if (cursorRules.get(clientId) === rule) return
  cursorRules.set(clientId, rule)
  styleElement ??= document.head.appendChild(document.createElement('style'))
  styleElement.textContent = [...cursorRules.values()].join('\n')
}

/**
 * Verbindet ein Monaco-Modell mit einem Y.Text: eigene Eingaben gehen ins gemeinsame Dokument, Änderungen der anderen
 * ins Modell (ohne Rückgängig-Verlauf). Dazu Cursor und Auswahl der anderen Personen in derselben Datei.
 */
export class MonacoBinding {
  private applying = false
  private disposables: IDisposable[] = []
  private decorations: MonacoEditor.IEditorDecorationsCollection
  private readonly observer = (event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === this) return
    this.applyRemote(event)
  }

  private readonly renderCursors = () => this.cursors()
  /** Eigene Auswahl vor Änderungen anderer – danach wiederherstellen, damit der Cursor nicht mitwandert */
  private saved: { anchor: Y.RelativePosition, head: Y.RelativePosition } | null = null
  private readonly beforeTransaction = () => {
    this.saved = null
    const selection = this.editor.getSelection()
    if (!selection || this.editor.getModel() !== this.model || this.model.getValue().length !== this.text.length) return
    const offset = (line: number, column: number) => this.model.getOffsetAt({ lineNumber: line, column })
    // assoc -1: am Zeichen links davon festmachen – fügt jemand genau an der eigenen Stelle ein, bleibt der Cursor davor
    this.saved = {
      anchor: Y.createRelativePositionFromTypeIndex(this.text, offset(selection.selectionStartLineNumber, selection.selectionStartColumn), -1),
      head: Y.createRelativePositionFromTypeIndex(this.text, offset(selection.positionLineNumber, selection.positionColumn), -1),
    }
  }

  constructor(
    private monaco: Monaco,
    private editor: MonacoEditor.IStandaloneCodeEditor,
    private model: MonacoEditor.ITextModel,
    private text: Y.Text,
    private session: LiveProjectSession,
    private path: string,
  ) {
    this.decorations = editor.createDecorationsCollection()
    // Offsets wie in Yjs: Zeilenende immer \n
    model.setEOL(monaco.editor.EndOfLineSequence.LF)
    const shared = text.toString()
    if (model.getValue() !== shared) this.silently(() => model.setValue(shared))

    text.observe(this.observer)
    text.doc!.on('beforeAllTransactions', this.beforeTransaction)
    this.disposables.push(model.onDidChangeContent((event) => {
      if (this.applying) return
      text.doc!.transact(() => {
        // Änderungen eines Ereignisses beziehen sich auf den Stand davor ⇒ von hinten nach vorn übernehmen
        for (const change of [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset)) {
          if (change.rangeLength) text.delete(change.rangeOffset, change.rangeLength)
          if (change.text) text.insert(change.rangeOffset, change.text)
        }
      }, this)
    }))
    this.disposables.push(editor.onDidChangeCursorSelection(() => this.publishSelection()))
    session.awareness.on('change', this.renderCursors)
    this.publishSelection()
    this.cursors()
  }

  private silently(fn: () => void) {
    this.applying = true
    try {
      fn()
    }
    finally {
      this.applying = false
    }
  }

  private applyRemote(event: Y.YTextEvent) {
    this.silently(() => {
      let index = 0
      for (const op of event.delta) {
        if (op.retain !== undefined) index += op.retain
        else if (op.delete !== undefined) {
          const start = this.model.getPositionAt(index)
          const end = this.model.getPositionAt(index + op.delete)
          this.model.applyEdits([{ range: new this.monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), text: '' }])
        }
        else if (typeof op.insert === 'string') {
          const at = this.model.getPositionAt(index)
          this.model.applyEdits([{ range: new this.monaco.Range(at.lineNumber, at.column, at.lineNumber, at.column), text: op.insert }])
          index += op.insert.length
        }
      }
      this.restoreSelection()
    })
    this.cursors()
  }

  private restoreSelection() {
    const saved = this.saved
    const doc = this.text.doc
    if (!saved || !doc || this.editor.getModel() !== this.model) return
    const at = (relative: Y.RelativePosition) => {
      const position = Y.createAbsolutePositionFromRelativePosition(relative, doc)
      return position && position.type === this.text ? this.model.getPositionAt(position.index) : null
    }
    const anchor = at(saved.anchor)
    const head = at(saved.head)
    if (anchor && head) this.editor.setSelection(new this.monaco.Selection(anchor.lineNumber, anchor.column, head.lineNumber, head.column))
  }

  /** Eigene Auswahl als relative Positionen (bleiben bei Änderungen der anderen an der richtigen Stelle) */
  private publishSelection() {
    const selection = this.editor.getSelection()
    if (!selection || this.editor.getModel() !== this.model) return
    const offset = (line: number, column: number) => this.model.getOffsetAt({ lineNumber: line, column })
    const anchor = Y.createRelativePositionFromTypeIndex(this.text, offset(selection.selectionStartLineNumber, selection.selectionStartColumn))
    const head = Y.createRelativePositionFromTypeIndex(this.text, offset(selection.positionLineNumber, selection.positionColumn))
    this.session.setPresence(this.path, { anchor: Y.relativePositionToJSON(anchor), head: Y.relativePositionToJSON(head) })
  }

  private cursors() {
    const doc = this.text.doc
    if (!doc) return
    const items: MonacoEditor.IModelDeltaDecoration[] = []
    for (const peer of this.session.peers()) {
      if (peer.path !== this.path || !peer.selection) continue
      const absolute = (json: unknown) => {
        const position = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), doc)
        return position && position.type === this.text ? position.index : null
      }
      const anchor = absolute(peer.selection.anchor)
      const head = absolute(peer.selection.head)
      if (anchor === null || head === null) continue
      cursorStyle(peer.clientId, peer.user.name, peer.user.color)
      const start = this.model.getPositionAt(Math.min(anchor, head))
      const end = this.model.getPositionAt(Math.max(anchor, head))
      const at = this.model.getPositionAt(head)
      if (anchor !== head) {
        items.push({ range: new this.monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), options: { className: `klonk-live-sel-${peer.clientId}` } })
      }
      items.push({
        range: new this.monaco.Range(at.lineNumber, at.column, at.lineNumber, at.column),
        options: { beforeContentClassName: `klonk-live-cur-${peer.clientId}`, hoverMessage: { value: peer.user.name }, stickiness: this.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
      })
    }
    this.decorations.set(items)
  }

  dispose() {
    this.text.unobserve(this.observer)
    this.text.doc?.off('beforeAllTransactions', this.beforeTransaction)
    this.session.awareness.off('change', this.renderCursors)
    for (const disposable of this.disposables) disposable.dispose()
    this.decorations.clear()
  }
}
