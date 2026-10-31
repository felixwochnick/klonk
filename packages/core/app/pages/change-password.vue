<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
useSeoMeta({ title: () => t('auth.changePassword.title') })
</script>

<template>
  <AuthChangePasswordForm @success="navigateTo('/')" />
</template>
