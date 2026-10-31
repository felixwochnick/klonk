<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const { logout } = useAuth()
</script>

<template>
  <div class="space-y-4 text-center">
    <UIcon
      name="i-lucide-shield-x"
      class="size-10 text-(--ui-error)"
    />
    <p>{{ t('admin.noAccess') }}</p>
    <UButton
      :label="t('auth.logout')"
      variant="outline"
      @click="logout"
    />
  </div>
</template>
