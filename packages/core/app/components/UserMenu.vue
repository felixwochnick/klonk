<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

// collapsed: eingeklappte Seitenleiste der Verwaltung ⇒ nur das Symbol; block: volle Breite mit gekürztem Namen
const props = defineProps<{ collapsed?: boolean, block?: boolean }>()

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
    :content="{ align: props.collapsed ? 'start' : 'center', side: props.block ? 'top' : 'bottom' }"
    :class="props.block && !props.collapsed ? 'w-full min-w-0' : ''"
  >
    <UButton
      variant="ghost"
      color="neutral"
      icon="i-lucide-circle-user"
      :label="props.collapsed ? undefined : user.displayName"
      :aria-label="user.displayName"
      :square="props.collapsed"
      :block="props.block && !props.collapsed"
      :class="props.block && !props.collapsed ? 'justify-start' : ''"
      :ui="{ label: 'truncate' }"
      data-testid="user-menu"
    />
  </UDropdownMenu>
</template>
