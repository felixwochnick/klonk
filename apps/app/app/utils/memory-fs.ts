/**
 * Ordner im Arbeitsspeicher mit der Schnittstelle von `FileSystemDirectoryHandle` – Ersatz für den Browser-Speicher
 * (OPFS), wo der Browser ihn nicht hergibt (z. B. privates Fenster in Firefox, Seite ohne sichere Verbindung).
 * Bildet nur ab, was `Project` braucht; der Inhalt ist mit dem Neuladen der Seite weg.
 */

const notFound = (name: string) => new DOMException(`"${name}" not found`, 'NotFoundError')
const wrongKind = (name: string) => new DOMException(`"${name}" has a different kind`, 'TypeMismatchError')

class MemoryFile {
  readonly kind = 'file'
  private blob = new Blob([])
  private lastModified = Date.now()

  constructor(readonly name: string) {}

  async getFile() {
    return new File([this.blob], this.name, { lastModified: this.lastModified })
  }

  /** Wie OPFS: Inhalt erst mit `close()` übernehmen */
  async createWritable() {
    const parts: BlobPart[] = []
    return {
      write: async (data: BlobPart) => {
        parts.push(data)
      },
      close: async () => {
        this.blob = new Blob(parts)
        this.lastModified = Date.now()
      },
      abort: async () => {},
    }
  }

  async isSameEntry(other: unknown) {
    return other === this
  }
}

class MemoryDirectory {
  readonly kind = 'directory'
  private readonly children = new Map<string, MemoryDirectory | MemoryFile>()

  constructor(readonly name: string) {}

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    return this.child(name, MemoryDirectory, !!options.create)
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}) {
    return this.child(name, MemoryFile, !!options.create)
  }

  async removeEntry(name: string, options: { recursive?: boolean } = {}) {
    const entry = this.children.get(name)
    if (!entry) throw notFound(name)
    if (entry instanceof MemoryDirectory && entry.children.size && !options.recursive) {
      throw new DOMException(`"${name}" is not empty`, 'InvalidModificationError')
    }
    this.children.delete(name)
  }

  async* entries(): AsyncGenerator<[string, MemoryDirectory | MemoryFile]> {
    // Kopie: Einträge dürfen während des Durchlaufs entfernt werden
    for (const entry of [...this.children]) yield entry
  }

  async* keys() {
    for await (const [name] of this.entries()) yield name
  }

  async* values() {
    for await (const [, entry] of this.entries()) yield entry
  }

  [Symbol.asyncIterator]() {
    return this.entries()
  }

  async isSameEntry(other: unknown) {
    return other === this
  }

  private child<T extends MemoryDirectory | MemoryFile>(name: string, type: new (name: string) => T, create: boolean): T {
    const entry = this.children.get(name)
    if (entry instanceof type) return entry
    if (entry) throw wrongKind(name)
    if (!create) throw notFound(name)
    const created = new type(name)
    this.children.set(name, created)
    return created
  }
}

/** Neuer, leerer Ordner im Arbeitsspeicher */
export function createMemoryDirectory(name = ''): FileSystemDirectoryHandle {
  return new MemoryDirectory(name) as unknown as FileSystemDirectoryHandle
}
