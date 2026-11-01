<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { user, logout } = useAuth()
const { changePasswordUrl } = useAuthUrls()
const route = useRoute()

const items = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.displayName, description: user.value?.organizationName ?? user.value?.email ?? undefined, type: 'label' }],
  // Nur Konten mit eigenem Passwort (SSO-Konten ändern es beim Identity-Provider)
  ...(user.value?.hasPassword
    ? [[{ label: t('auth.changePassword.title'), icon: 'i-lucide-key-round', to: changePasswordUrl(route.fullPath), external: true }]]
    : []),
  [{ label: t('settings.title'), icon: 'i-lucide-settings', to: '/settings' }],
  [{ label: t('auth.logout'), icon: 'i-lucide-log-out', onSelect: logout }],
])
</script>

<template>
  <UDropdownMenu
    v-if="user"
    :items="items"
  >
    <UButton
      variant="ghost"
      color="neutral"
      icon="i-lucide-circle-user"
      :label="user.displayName"
      data-testid="user-menu"
    />
  </UDropdownMenu>
</template>
