<script setup lang="ts">
const { t } = useI18n()
const { $pwa } = useNuxtApp()
const offline = useOffline()
const { isLocal } = useLicense()
// Angemeldet: Sprache und Darstellung unter Einstellungen (Kontomenü)
const { user } = useAuth()

// Optionaler Vollbildmodus: Kopfzeile weg, Seiten rechnen mit Kopfzeilenhöhe 0
const fullscreen = useAppFullscreen()
fullscreen.listen()
useHead({ htmlAttrs: { class: computed(() => (fullscreen.active.value ? 'klonk-fullscreen' : '')) } })
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <UHeader v-if="!fullscreen.active.value">
      <template #title>
        <KlonkLogo />
      </template>
      <UNavigationMenu
        :items="[
          { label: t('nav.projects'), icon: 'i-lucide-folder-tree', to: '/projects' },
          { label: t('nav.code'), icon: 'i-lucide-code', to: '/', exact: true },
          { label: t('nav.learn'), icon: 'i-lucide-graduation-cap', to: '/learn' },
          { label: t('nav.wardrobe'), icon: 'i-lucide-shirt', to: '/designs' },
          { label: t('nav.world'), icon: 'i-lucide-boxes', to: '/world' },
        ]"
      />

      <template #right>
        <UButton
          v-if="$pwa?.showInstallPrompt"
          icon="i-lucide-download"
          variant="ghost"
          color="neutral"
          :label="t('pwa.install')"
          class="hidden sm:inline-flex"
          @click="$pwa.install()"
        />
        <UTooltip
          v-if="isLocal"
          :text="t('license.localHint')"
        >
          <UBadge
            icon="i-lucide-flask-conical"
            :label="t('license.local')"
            color="info"
            variant="subtle"
            data-testid="local-badge"
          />
        </UTooltip>
        <UBadge
          v-if="offline"
          icon="i-lucide-wifi-off"
          :label="t('pwa.offline')"
          color="warning"
          variant="subtle"
          data-testid="offline-badge"
        />
        <template v-if="!user">
          <LocaleSwitch />
          <UColorModeButton />
        </template>
        <UTooltip :text="t('fullscreen.enter')">
          <UButton
            icon="i-lucide-maximize"
            variant="ghost"
            color="neutral"
            :aria-label="t('fullscreen.enter')"
            data-testid="fullscreen"
            @click="fullscreen.enter()"
          />
        </UTooltip>
        <UserMenu />
      </template>
    </UHeader>

    <!-- Im Vollbild: dezenter Knopf zum Verlassen -->
    <UTooltip
      v-if="fullscreen.active.value"
      :text="t('fullscreen.exit')"
    >
      <UButton
        icon="i-lucide-minimize"
        color="neutral"
        variant="subtle"
        class="fixed right-3 bottom-3 z-50 shadow-md"
        :aria-label="t('fullscreen.exit')"
        data-testid="fullscreen-exit"
        @click="fullscreen.exit()"
      />
    </UTooltip>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>

<style>
/* Vollbild: Seitenhöhen rechnen mit calc(100dvh - Kopfzeile) */
html.klonk-fullscreen {
  --ui-header-height: 0px;
}
</style>
