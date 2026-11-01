<script setup lang="ts">
// Persönliche Einstellungen (im Browser gespeichert): Sprache und Hell/Dunkel
const { t, locale, locales, setLocale } = useI18n()
const colorMode = useColorMode()

const languageItems = computed(() => locales.value.map(l => ({ label: l.name, value: l.code })))
const colorModeItems = computed(() => [
  { label: t('settings.system'), value: 'system', icon: 'i-lucide-monitor' },
  { label: t('settings.light'), value: 'light', icon: 'i-lucide-sun' },
  { label: t('settings.dark'), value: 'dark', icon: 'i-lucide-moon' },
])
</script>

<template>
  <div class="space-y-6">
    <UFormField :label="t('settings.language')">
      <USelect
        :model-value="locale"
        :items="languageItems"
        icon="i-lucide-languages"
        class="w-56"
        data-testid="settings-language"
        @update:model-value="setLocale($event as typeof locale)"
      />
    </UFormField>
    <UFormField :label="t('settings.colorMode')">
      <URadioGroup
        v-model="colorMode.preference"
        :items="colorModeItems"
        orientation="horizontal"
        variant="card"
        data-testid="settings-color-mode"
      />
    </UFormField>
  </div>
</template>
