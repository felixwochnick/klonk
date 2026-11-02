<script setup lang="ts">
const { t } = useI18n()
const { $pwa } = useNuxtApp()
const offline = useOffline()
const { isLocal } = useLicense()
// Angemeldet: Sprache und Darstellung unter Einstellungen (Kontomenü)
const { user } = useAuth()
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <UHeader>
      <template #title>
        <KlonkLogo />
      </template>
      <UNavigationMenu
        :items="[
          { label: t('nav.projects'), icon: 'i-lucide-folder-tree', to: '/projects' },
          { label: t('nav.code'), icon: 'i-lucide-code', to: '/', exact: true },
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
        <UserMenu />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
