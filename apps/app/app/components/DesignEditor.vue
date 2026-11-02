<script setup lang="ts">
import { ACCESSORIES, CHARACTER_MODELS, DEFAULT_DESIGNS, World, parseDesign, type RobotDesign } from '@klonk/world'

// Visueller Editor für Roboter-Designs (`*.klonkdesign.json`): Grundform, Farben, Zubehör, Live-Vorschau in 3D.
// Eigene Designs sind lizenzpflichtig (Feature `models`) – ohne Lizenz nur ansehen.
const source = defineModel<string>({ required: true })

const { t } = useI18n()
const { can } = useLicense()
const licensed = computed(() => can('models'))

/** Aktueller Stand; ungültige Dateien zeigen einen Hinweis und starten vom Standard */
const invalid = ref(false)
function read(): RobotDesign {
  try {
    invalid.value = false
    return parseDesign(JSON.parse(source.value))
  }
  catch {
    invalid.value = true
    return structuredClone(DEFAULT_DESIGNS.male)
  }
}
const design = ref<RobotDesign>(read())
watch(source, (value) => {
  // Nur übernehmen, wenn die Datei von außen geändert wurde
  if (value !== serialize(design.value)) design.value = read()
})
const serialize = (value: RobotDesign) => `${JSON.stringify(value, null, 2)}\n`
function update(change: (draft: RobotDesign) => void) {
  if (!licensed.value) return
  const next = structuredClone(toRaw(design.value))
  change(next)
  design.value = next
  invalid.value = false
  source.value = serialize(next)
}

const baseItems = computed(() => CHARACTER_MODELS.map(m => ({ label: t(`world.characters.${m}`), value: m })))
const accessoryItems = computed(() => ACCESSORIES.map(a => ({ label: t(`design.accessories.${a}`), value: a })))
const COLOR_PARTS = ['skin', 'shirt', 'pants', 'hair', 'eyes'] as const

/** Grundform wechseln übernimmt deren Standardfarben nur, wenn noch nichts angepasst wurde */
function setBase(base: RobotDesign['base']) {
  update((d) => {
    const untouched = JSON.stringify(d.colors) === JSON.stringify(DEFAULT_DESIGNS[d.base].colors)
    d.base = base
    if (untouched) d.colors = { ...DEFAULT_DESIGNS[base].colors, accessory: d.colors.accessory }
  })
}

// Vorschau: eine Figur auf einem Feld
const preview = computed(() => new World({
  version: 1,
  size: { width: 1, depth: 1, height: 1 },
  cells: [],
  characters: [{ id: 'preview', model: design.value.base, design: toRaw(design.value), x: 0, z: 0, direction: 'south' }],
}))
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col lg:flex-row"
    data-testid="design-editor"
  >
    <div class="flex w-full shrink-0 flex-col gap-4 overflow-y-auto p-4 lg:w-80">
      <UAlert
        v-if="!licensed"
        color="warning"
        variant="subtle"
        icon="i-lucide-badge-check"
        :title="t('design.licenseTitle')"
        :description="t('design.licenseHint')"
        data-testid="design-license"
      />
      <UAlert
        v-if="invalid"
        color="error"
        variant="subtle"
        icon="i-lucide-file-warning"
        :title="t('design.invalid')"
      />
      <UFormField :label="t('design.name')">
        <UInput
          :model-value="design.name ?? ''"
          :disabled="!licensed"
          class="w-full"
          data-testid="design-name"
          @update:model-value="value => update(d => { d.name = String(value) || undefined })"
        />
      </UFormField>
      <UFormField :label="t('design.base')">
        <USelect
          :model-value="design.base"
          :items="baseItems"
          :disabled="!licensed"
          class="w-full"
          data-testid="design-base"
          @update:model-value="value => setBase(value as RobotDesign['base'])"
        />
      </UFormField>

      <div>
        <p class="mb-2 text-sm font-medium">
          {{ t('design.colors') }}
        </p>
        <div class="grid grid-cols-2 gap-2">
          <label
            v-for="part in COLOR_PARTS"
            :key="part"
            class="flex items-center gap-2 rounded-md border border-(--ui-border) px-2 py-1.5 text-sm"
            :class="licensed ? 'cursor-pointer' : 'opacity-60'"
          >
            <input
              type="color"
              :value="design.colors[part]"
              :disabled="!licensed"
              class="size-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              :data-testid="`design-color-${part}`"
              @input="(event: Event) => update(d => { d.colors[part] = (event.target as HTMLInputElement).value })"
            >
            {{ t(`design.parts.${part}`) }}
          </label>
        </div>
      </div>

      <UFormField :label="t('design.accessory')">
        <div class="flex items-center gap-2">
          <USelect
            :model-value="design.accessory ?? 'none'"
            :items="accessoryItems"
            :disabled="!licensed"
            class="flex-1"
            data-testid="design-accessory"
            @update:model-value="value => update(d => { d.accessory = value as RobotDesign['accessory'] })"
          />
          <input
            v-if="(design.accessory ?? 'none') !== 'none'"
            type="color"
            :value="design.colors.accessory ?? (design.accessory === 'crown' ? '#f2cd37' : '#3a3a3a')"
            :disabled="!licensed"
            :aria-label="t('design.parts.accessory')"
            class="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
            data-testid="design-color-accessory"
            @input="(event: Event) => update(d => { d.colors.accessory = (event.target as HTMLInputElement).value })"
          >
        </div>
      </UFormField>

      <p class="text-xs text-(--ui-text-muted)">
        {{ t('design.usage') }}
      </p>
    </div>

    <div class="relative min-h-72 flex-1 border-t border-(--ui-border) bg-(--ui-bg-muted) lg:border-t-0 lg:border-l">
      <ClientOnly>
        <KlonkWorld
          :world="preview"
          :show-names="false"
        />
      </ClientOnly>
    </div>
  </div>
</template>
