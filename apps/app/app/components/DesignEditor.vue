<script setup lang="ts">
import { ACCESSORIES, ACCESSORY_COLORS, CHARACTER_MODELS, DEFAULT_DESIGNS, SKINS, SKIN_COLORS, SKIN_PRESETS, World, parseDesign, type Accessory, type RobotDesign, type Skin } from '@klonk/world'

// Visueller Editor für Roboter-Designs (`*.klonkdesign.json`): Grundform, Kleidung (Skin), Farben, Zubehör, Live-Vorschau in 3D.
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

const SKIN_ICONS: Record<Skin, string> = {
  none: 'i-lucide-shirt',
  worker: 'i-lucide-hard-hat',
  doctor: 'i-lucide-stethoscope',
  chef: 'i-lucide-chef-hat',
  police: 'i-lucide-shield',
  firefighter: 'i-lucide-flame',
  astronaut: 'i-lucide-rocket',
  knight: 'i-lucide-sword',
  pirate: 'i-lucide-skull',
  farmer: 'i-lucide-wheat',
}
const skin = computed<Skin>(() => design.value.skin ?? 'none')
const accessory = computed<Accessory>(() => design.value.accessory ?? 'none')
const outfitColor = computed(() => (skin.value === 'none' ? '#000000' : design.value.colors.outfit ?? SKIN_COLORS[skin.value]))
const accessoryColor = computed(() => (accessory.value === 'none' ? '#000000' : design.value.colors.accessory ?? ACCESSORY_COLORS[accessory.value]))

/** Skin wählen: übernimmt passende Farben für Oberteil/Hose und das typische Zubehör (danach frei änderbar) */
function setSkin(value: Skin) {
  update((d) => {
    delete d.colors.outfit
    if (value === 'none') {
      delete d.skin
      return
    }
    const preset = SKIN_PRESETS[value]
    d.skin = value
    d.colors.shirt = preset.shirt
    d.colors.pants = preset.pants
    d.accessory = preset.accessory
    delete d.colors.accessory
  })
}

/** Anderes Zubehör startet mit seiner Standardfarbe */
function setAccessory(value: Accessory) {
  update((d) => {
    d.accessory = value
    delete d.colors.accessory
  })
}

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
          {{ t('design.skin') }}
        </p>
        <div class="grid grid-cols-2 gap-1.5">
          <UButton
            v-for="value in SKINS"
            :key="value"
            :icon="SKIN_ICONS[value]"
            :label="t(`design.skins.${value}`)"
            :variant="skin === value ? 'soft' : 'outline'"
            :color="skin === value ? 'primary' : 'neutral'"
            :disabled="!licensed"
            :aria-pressed="skin === value"
            size="sm"
            class="justify-start"
            :data-testid="`design-skin-${value}`"
            @click="setSkin(value)"
          />
        </div>
        <label
          v-if="skin !== 'none'"
          class="mt-2 flex items-center gap-2 rounded-md border border-(--ui-border) px-2 py-1.5 text-sm"
          :class="licensed ? 'cursor-pointer' : 'opacity-60'"
        >
          <input
            type="color"
            :value="outfitColor"
            :disabled="!licensed"
            class="size-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
            data-testid="design-color-outfit"
            @input="(event: Event) => update(d => { d.colors.outfit = (event.target as HTMLInputElement).value })"
          >
          {{ t('design.parts.outfit') }}
        </label>
      </div>

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
            :model-value="accessory"
            :items="accessoryItems"
            :disabled="!licensed"
            class="flex-1"
            data-testid="design-accessory"
            @update:model-value="value => setAccessory(value as Accessory)"
          />
          <input
            v-if="accessory !== 'none'"
            type="color"
            :value="accessoryColor"
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
