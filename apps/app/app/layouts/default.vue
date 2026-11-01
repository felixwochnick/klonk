<script setup lang="ts">
const { t } = useI18n()
const { $pwa } = useNuxtApp()
const offline = useOffline()
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <UHeader>
      <template #title>
        <KlonkLogo />
      </template>
      <UNavigationMenu
        :items="[
          { label: t('nav.code'), icon: 'i-lucide-code', to: '/', exact: true },
          { label: t('nav.world'), icon: 'i-lucide-boxes', to: '/world' },
          { label: t('nav.projects'), icon: 'i-lucide-folder-tree', to: '/projects' },
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
        <UBadge
          v-if="offline"
          icon="i-lucide-wifi-off"
          :label="t('pwa.offline')"
          color="warning"
          variant="subtle"
          data-testid="offline-badge"
        />
        <LocaleSwitch />
        <UColorModeButton />
        <UserMenu />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
