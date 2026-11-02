import { BRICK_COLORS, CHARACTER_MODELS, MARK_COLORS, World, WorldError, nextCharacterName, parseWorld, type BrickColor, type CharacterModel, type MarkColor, type Position, type RobotDesign, type WorldData } from '@klonk/world'

export type EditorTool = 'brick' | 'mark' | 'block' | 'character' | 'erase'

const STORAGE_KEY = 'klonk:world'

/**
 * Zustand des Welt-Editors: Startwelt (bearbeiten) und eine Kopie zum Ausprobieren der Befehle.
 * Die Startwelt wird im Browser gespeichert; Dateien lassen sich als JSON laden und speichern.
 */
export function useWorldEditor() {
  const { t } = useI18n()
  const toast = useToast()
  const { maxCharacters } = useLicense()

  const start = shallowRef(load() ?? World.empty())
  const run = shallowRef<World | null>(null)
  const mode = ref<'edit' | 'play'>('edit')
  const world = computed(() => (mode.value === 'play' && run.value) ? run.value : start.value)

  const tool = ref<EditorTool>('brick')
  const brickColor = ref<BrickColor>('red')
  const markColor = ref<MarkColor>('yellow')
  const characterModel = ref<CharacterModel>('male')
  /** Eigenes Design für neue Figuren (Lizenz); `null` = Standardmodell */
  const characterDesign = shallowRef<RobotDesign | null>(null)
  const selectedCharacter = ref(start.value.getCharacters()[0]?.id ?? '')

  // Änderungen für Statusanzeige sichtbar machen (World ist nicht reaktiv)
  const version = ref(0)
  let unsubscribe: (() => void) | undefined
  watch(world, (w) => {
    unsubscribe?.()
    unsubscribe = w.on(() => {
      version.value++
      if (w === start.value) save(w)
    })
    version.value++
  }, { immediate: true })

  function load(): World | null {
    if (!import.meta.client) return null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? new World(parseWorld(JSON.parse(raw))) : null
    }
    catch {
      return null
    }
  }

  function save(w: World) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(w.toJSON()))
    }
    catch {
      // Speicher voll/gesperrt – Editor funktioniert trotzdem
    }
  }

  function setStart(w: World) {
    start.value = w
    run.value = null
    mode.value = 'edit'
    selectedCharacter.value = w.getCharacters()[0]?.id ?? ''
    save(w)
  }

  /** Fehler der Welt übersetzt anzeigen */
  function attempt(fn: () => void) {
    try {
      fn()
      return true
    }
    catch (error) {
      if (error instanceof WorldError) {
        toast.add({ title: t(`world.errors.${error.code}`, error.params), color: 'error', icon: 'i-lucide-octagon-alert' })
        return false
      }
      throw error
    }
  }

  // --- Bearbeiten ---------------------------------------------------------

  function applyTool(position: Position, remove: boolean) {
    const w = start.value
    attempt(() => {
      const cell = w.cell(position)
      const character = w.characterAt(position)
      switch (tool.value) {
        case 'brick':
          if (remove) w.removeBrickAt(position)
          else w.addBrickAt(position, brickColor.value)
          break
        case 'mark':
          w.setMarkAt(position, remove || cell.mark === markColor.value ? null : markColor.value)
          break
        case 'block':
          w.setBlockAt(position, !remove && !cell.block)
          break
        case 'character':
          if (character) {
            // Vorhandene Figur: Klick dreht, Rechtsklick entfernt
            if (remove) w.removeCharacter(character.id)
            else w.turnRight(character.id)
          }
          else if (!remove) {
            const id = nextCharacterName(w)
            const design = characterDesign.value
            w.addCharacter({ id, model: design?.base ?? characterModel.value, ...(design ? { design } : {}), x: position.x, z: position.z, direction: 'south' }, maxCharacters.value)
            selectedCharacter.value ||= id
          }
          break
        case 'erase':
          if (character) w.removeCharacter(character.id)
          if (cell.block) w.setBlockAt(position, false)
          while (w.cell(position).bricks.length) w.removeBrickAt(position)
          if (w.cell(position).mark) w.setMarkAt(position, null)
          break
      }
    })
    if (!w.getCharacters().some(c => c.id === selectedCharacter.value))
      selectedCharacter.value = w.getCharacters()[0]?.id ?? ''
  }

  function newWorld(width: number, depth: number, height: number) {
    setStart(new World({ version: 1, size: { width, depth, height }, cells: [], characters: [{ id: 'Klonk', model: characterModel.value, x: 0, z: 0, direction: 'south' }] }))
  }

  function exportJson() {
    return JSON.stringify(start.value.toJSON(), null, 2)
  }

  function importJson(text: string) {
    return attempt(() => {
      const data = parseWorld(JSON.parse(text)) as WorldData
      if (data.characters.length > maxCharacters.value) throw new WorldError('character_limit', { max: maxCharacters.value })
      setStart(new World(data))
    })
  }

  // --- Ausprobieren ------------------------------------------------------

  function play() {
    run.value = new World(start.value.toJSON())
    mode.value = 'play'
  }

  function edit() {
    mode.value = 'edit'
    run.value = null
  }

  function resetRun() {
    run.value?.reset(start.value.toJSON())
  }

  /** Befehl der ausgewählten Figur in der Probewelt ausführen */
  function command(name: 'step' | 'turnLeft' | 'turnRight' | 'placeBrick' | 'pickBrick' | 'setMark' | 'removeMark') {
    if (mode.value !== 'play') play()
    const w = run.value!
    const id = selectedCharacter.value
    attempt(() => {
      if (name === 'placeBrick') w.placeBrick(id, brickColor.value)
      else if (name === 'setMark') w.setMark(id, markColor.value)
      else w[name](id)
    })
  }

  /** Anzeige: Position, Blickrichtung und Sensoren der ausgewählten Figur */
  const status = computed(() => {
    void version.value
    const w = world.value
    const id = selectedCharacter.value
    if (!id || !w.getCharacters().some(c => c.id === id)) return null
    const c = w.getCharacter(id)
    return {
      x: c.x,
      z: c.z,
      direction: c.direction,
      wall: w.isWall(id),
      bricksInFront: w.bricksInFront(id),
      mark: w.cell(c).mark,
    }
  })

  const characters = computed(() => {
    void version.value
    return world.value.getCharacters().map(c => ({ ...c }))
  })

  /** Figur umbenennen – der Name ist der, über den Programme sie ansprechen */
  function renameCharacter(id: string, name: string) {
    return attempt(() => {
      start.value.renameCharacter(id, name)
      if (selectedCharacter.value === id) selectedCharacter.value = name.trim()
    })
  }

  /** Welt aus einer Datei/einem Projekt als Startwelt übernehmen */
  function loadData(data: WorldData) {
    return attempt(() => {
      if (data.characters.length > maxCharacters.value) throw new WorldError('character_limit', { max: maxCharacters.value })
      setStart(new World(data))
    })
  }

  return {
    loadData,
    world, start, mode, tool, brickColor, markColor, characterModel, characterDesign, selectedCharacter, status, characters, maxCharacters,
    applyTool, newWorld, exportJson, importJson, play, edit, resetRun, command, renameCharacter,
    BRICK_COLORS, MARK_COLORS, CHARACTER_MODELS,
  }
}
