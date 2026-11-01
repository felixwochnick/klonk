<script setup lang="ts">
import type * as BlocklyType from 'blockly/core'
import { CATEGORY_COLORS, defineKlonkBlocks, klonkTheme, toolbox } from '~/utils/blocks/definitions'
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

  setupToolbox(workspace)

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

/** Auswahl bleibt beim Herausziehen offen (wie Scratch), Kategorien bekommen ihre Farbe als CSS-Variable */
function setupToolbox(ws: BlocklyType.WorkspaceSvg) {
  const box = ws.getToolbox() as BlocklyType.Toolbox | null
  if (!box) return
  (box.getFlyout() as BlocklyType.Flyout | null)?.setAutoClose(false)
  for (const item of box.getToolboxItems()) {
    const colour = CATEGORY_COLORS[item.getId() as keyof typeof CATEGORY_COLORS]
    if (colour) (item as BlocklyType.ToolboxCategory).getDiv()?.style.setProperty('--klonk-category', colour)
  }
  box.selectItemByPosition(0)
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
/* Blockly im Nuxt-UI-Design (global: Menüs/Dropdowns hängen direkt am <body>) */
.blocklySvg {
  background-color: var(--ui-bg) !important;
}
.blocklyToolbox {
  background-color: var(--ui-bg) !important;
  border-inline-end: 1px solid var(--ui-border);
  padding: 8px 6px !important;
}
.blocklyToolboxCategoryContainer {
  margin: 0 0 2px !important;
}
.blocklyToolboxCategory {
  height: auto !important;
  padding: 6px 12px 6px 8px !important;
  border: none !important;
  border-radius: calc(var(--ui-radius) * 1.5);
  background-color: transparent !important;
  transition: background-color 0.15s;
}
.blocklyToolboxCategory:not(.blocklyToolboxSelected):hover {
  background-color: var(--ui-bg-elevated) !important;
}
.blocklyToolboxSelected {
  background-color: color-mix(in oklab, var(--klonk-category) 16%, transparent) !important;
}
.blocklyTreeRowContentContainer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.blocklyToolboxCategoryIcon {
  visibility: visible !important;
  width: 12px !important;
  height: 12px !important;
  flex-shrink: 0;
  border-radius: 9999px;
  background: var(--klonk-category, var(--ui-text-dimmed)) !important;
}
.blocklyToolboxCategoryLabel {
  padding: 0 !important;
  font: 600 14px var(--font-sans) !important;
  color: var(--ui-text) !important;
}
.blocklyToolboxSelected .blocklyToolboxCategoryLabel {
  color: var(--ui-text-highlighted) !important;
}
.blocklyFlyoutBackground {
  fill: var(--ui-bg-muted) !important;
  fill-opacity: 1 !important;
}
.blocklyFlyoutButtonBackground {
  fill: var(--ui-primary) !important;
  stroke: none !important;
}
.blocklyFlyoutButton .blocklyText {
  fill: var(--ui-bg) !important;
  font-family: var(--font-sans) !important;
  font-weight: 600 !important;
}
.blocklyFlyoutButtonShadow {
  display: none;
}
.blocklyFlyoutLabelText {
  fill: var(--ui-text-muted) !important;
}
.blocklyScrollbarHandle {
  fill: var(--ui-border-accented) !important;
}
.blocklyFlyoutScrollbar .blocklyScrollbarHandle {
  fill: var(--ui-border) !important;
}

/* Kontextmenü, Dropdowns, Tooltips */
.blocklyWidgetDiv .blocklyMenu,
.blocklyDropDownDiv {
  background-color: var(--ui-bg) !important;
  border: 1px solid var(--ui-border) !important;
  border-radius: calc(var(--ui-radius) * 1.5) !important;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1) !important;
  padding: 4px !important;
  font-family: var(--font-sans) !important;
}
.blocklyDropDownDiv .blocklyMenu {
  padding: 0 !important;
}
.blocklyDropDownArrow {
  background-color: var(--ui-bg) !important;
  border-color: var(--ui-border) !important;
}
.blocklyMenuItem {
  border-radius: var(--ui-radius);
  color: var(--ui-text) !important;
  font-size: 14px !important;
}
.blocklyDropDownDiv .blocklyMenuItemContent,
.blocklyWidgetDiv .blocklyMenuItemContent {
  color: var(--ui-text) !important;
  font-family: var(--font-sans) !important;
}
.blocklyMenuItemHighlight {
  background-color: var(--ui-bg-elevated) !important;
}
.blocklyMenuItemDisabled .blocklyMenuItemContent {
  color: var(--ui-text-dimmed) !important;
}
.blocklyMenuSeparator {
  border-color: var(--ui-border) !important;
}
.blocklyTooltipDiv {
  background-color: var(--ui-bg) !important;
  color: var(--ui-text-highlighted) !important;
  border: 1px solid var(--ui-border) !important;
  border-radius: var(--ui-radius);
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important;
  padding: 4px 8px !important;
  opacity: 1 !important;
  font: 13px var(--font-sans) !important;
}

/* Haltepunkte, Fehler */
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
