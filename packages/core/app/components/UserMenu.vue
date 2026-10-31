<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { user, logout } = useAuth()

const items = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.displayName, description: user.value?.organizationName ?? user.value?.email ?? undefined, type: 'label' }],
  [{ label: t('auth.changePassword.title'), icon: 'i-lucide-key-round', to: '/change-password' }],
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
