<script setup lang="ts">
import type { WorldViewMode } from '~/composables/useWorldView'

// Umschalter 3D-Ansicht ⇄ Draufsicht (gilt für alle Weltansichten)
const { t } = useI18n()
const { mode, webgl, set } = useWorldView()

const options = computed(() => [
  { value: '3d' as WorldViewMode, label: t('world.view.sceneShort'), hint: webgl.value ? t('world.view.scene') : t('world.view.noWebgl'), disabled: !webgl.value },
  { value: '2d' as WorldViewMode, label: t('world.view.planShort'), hint: t('world.view.plan'), disabled: false },
])
</script>

<template>
  <UFieldGroup
    size="xs"
    role="radiogroup"
    :aria-label="t('world.view.label')"
    data-testid="world-view-toggle"
    :data-mode="mode"
  >
    <UTooltip
      v-for="option in options"
      :key="option.value"
      :text="option.hint"
    >
      <UButton
        role="radio"
        :aria-checked="mode === option.value"
        :aria-label="option.hint"
        :label="option.label"
        :disabled="option.disabled"
        :color="mode === option.value ? 'primary' : 'neutral'"
        :variant="mode === option.value ? 'solid' : 'outline'"
        :data-testid="`world-view-${option.value}`"
        class="tabular-nums"
        @click="set(option.value)"
      />
    </UTooltip>
  </UFieldGroup>
</template>
