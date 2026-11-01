<script setup lang="ts">
import type * as BlocklyType from 'blockly/core'
import { defineKlonkBlocks, klonkTheme, toolbox } from '~/utils/blocks/definitions'
import { generateKlonkScript, type GeneratedProgram } from '~/utils/blocks/generator'

// Blockprogrammierung (Blockly) – erzeugt Klonk-Script. Nur im Browser verwenden (<ClientOnly>).
const props = withDefaults(defineProps<{
  readOnly?: boolean
  /** Block, der gerade läuft */
  activeBlock?: string | null
  /** Block mit Laufzeitfehler */
  errorBlock?: string | null
}>(), { readOnly: false, activeBlock: null, errorBlock: null })

/** Gespeicherter Arbeitsbereich (Blockly-JSON) */
const model = defineModel<string>({ required: true })
const emit = defineEmits<{ program: [program: GeneratedProgram, breakpoints: string[]] }>()

const { t, locale } = useI18n()
const colorMode = useColorMode()

const container = ref<HTMLDivElement>()
const ready = ref(false)
let Blockly: typeof BlocklyType | undefined
let workspace: BlocklyType.WorkspaceSvg | undefined
let lastSaved = ''

const BREAKPOINT = 'breakpoint'

async function load() {
  const [core, , de, en] = await Promise.all([
    import('blockly/core'),
    import('blockly/blocks'),
    import('blockly/msg/de'),
    import('blockly/msg/en'),
  ])
  Blockly = core
  return { de, en }
}

let messages: Awaited<ReturnType<typeof load>> | undefined

function create() {
  const B = Blockly!
  const lang = locale.value === 'en' ? 'en' : 'de'
  B.setLocale((lang === 'en' ? messages!.en : messages!.de) as unknown as Record<string, string>)
  defineKlonkBlocks(B, lang, t)
  registerContextMenu(B)

  workspace = B.inject(container.value!, {
    toolbox: toolbox(t),
    theme: klonkTheme(B, colorMode.value === 'dark'),
    renderer: 'zelos',
    media: '/blockly-media/',
    sounds: false,
    readOnly: props.readOnly,
    trashcan: true,
    move: { scrollbars: true, drag: true, wheel: true },
    zoom: { controls: true, wheel: false, startScale: 0.8, maxScale: 2, minScale: 0.4 },
    grid: { spacing: 24, length: 2, colour: colorMode.value === 'dark' ? '#3f3f46' : '#d4d4d8', snap: true },
  })

  try {
    if (model.value) B.serialization.workspaces.load(JSON.parse(model.value), workspace)
  }
  catch {
    // Ungültiger Speicherstand – leerer Arbeitsbereich
  }
  lastSaved = model.value
  refreshBreakpoints()
  publish()

  workspace.addChangeListener((event) => {
    if (event.isUiEvent || !workspace) return
    save()
    publish()
  })
}

function save() {
  if (!Blockly || !workspace) return
  lastSaved = JSON.stringify(Blockly.serialization.workspaces.save(workspace))
  model.value = lastSaved
}

/** Erzeugten Code und Haltepunkte an die IDE melden */
function publish() {
  if (!Blockly || !workspace) return
  const program = generateKlonkScript(Blockly, workspace, locale.value === 'en' ? 'en' : 'de')
  emit('program', program, breakpointBlocks())
}

function breakpointBlocks() {
  return workspace?.getAllBlocks(false).filter(b => b.data === BREAKPOINT).map(b => b.id) ?? []
}

function refreshBreakpoints() {
  for (const block of workspace?.getAllBlocks(false) ?? []) {
    (block as BlocklyType.BlockSvg).getSvgRoot()?.classList.toggle('klonk-block-breakpoint', block.data === BREAKPOINT)
  }
}

/** Rechtsklick auf einen Anweisungsblock: Haltepunkt setzen/entfernen */
function registerContextMenu(B: typeof BlocklyType) {
  // Die Registry ist global – Eintrag einer früheren Instanz (andere Closure) ersetzen
  const registry = B.ContextMenuRegistry.registry
  if (registry.getItem('klonk_breakpoint')) registry.unregister('klonk_breakpoint')
  registry.register({
    id: 'klonk_breakpoint',
    scopeType: B.ContextMenuRegistry.ScopeType.BLOCK,
    weight: -1,
    displayText: scope => (scope.block?.data === BREAKPOINT ? t('blocks.removeBreakpoint') : t('blocks.addBreakpoint')),
    preconditionFn: scope => (scope.block && !scope.block.outputConnection ? 'enabled' : 'hidden'),
    callback: (scope) => {
      const block = scope.block
      if (!block) return
      block.data = block.data === BREAKPOINT ? null : BREAKPOINT
      refreshBreakpoints()
      save()
      publish()
    },
  })
}

function rebuild() {
  if (!workspace) return
  save()
  workspace.dispose()
  workspace = undefined
  create()
}

onMounted(async () => {
  messages = await load()
  create()
  ready.value = true
})

onBeforeUnmount(() => workspace?.dispose())

// Sprache/Farbschema: Blöcke neu beschriften (Arbeitsbereich bleibt erhalten)
watch([locale, () => colorMode.value], rebuild)
watch(() => props.readOnly, (readOnly) => {
  if (workspace) workspace.options.readOnly = readOnly
})
watch(model, (value) => {
  if (!Blockly || !workspace || value === lastSaved) return
  workspace.clear()
  try {
    if (value) Blockly.serialization.workspaces.load(JSON.parse(value), workspace)
  }
  catch {
    // ungültig – leer lassen
  }
  lastSaved = value
  refreshBreakpoints()
  publish()
})
watch(() => props.activeBlock, id => workspace?.highlightBlock(id ?? null))
watch(() => props.errorBlock, (id, previous) => {
  if (previous) (workspace?.getBlockById(previous) as BlocklyType.BlockSvg | null)?.getSvgRoot()?.classList.remove('klonk-block-error')
  if (id) (workspace?.getBlockById(id) as BlocklyType.BlockSvg | null)?.getSvgRoot()?.classList.add('klonk-block-error')
})
</script>

<template>
  <div
    ref="container"
    class="h-full w-full"
    data-testid="blocks-editor"
    :data-ready="ready"
  />
</template>

<style>
.klonk-block-breakpoint > .blocklyPath {
  stroke: #e5484d !important;
  stroke-width: 4px !important;
  stroke-dasharray: 6 3;
}
.klonk-block-error > .blocklyPath {
  stroke: #e5484d !important;
  stroke-width: 5px !important;
}
</style>
