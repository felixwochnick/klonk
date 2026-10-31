<script setup lang="ts">
const emit = defineEmits<{ success: [] }>()

const { t } = useI18n()
const { user, fetch: refreshSession } = useUserSession()
const apiError = useApiError()

const currentPassword = ref('')
const newPassword = ref('')
const repeatPassword = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

async function submit() {
  error.value = null
  if (newPassword.value !== repeatPassword.value) {
    error.value = t('auth.changePassword.mismatch')
    return
  }
  loading.value = true
  try {
    await $fetch('/api/auth/password', {
      method: 'POST',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value },
    })
    await refreshSession()
    emit('success')
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <form
    class="space-y-4"
    @submit.prevent="submit"
  >
    <h1 class="text-xl font-bold">
      {{ t('auth.changePassword.title') }}
    </h1>
    <p
      v-if="user?.mustChangePassword"
      class="text-sm text-(--ui-text-muted)"
    >
      {{ t('auth.changePassword.required') }}
    </p>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="error"
    />

    <UFormField :label="t('auth.changePassword.current')">
      <UInput
        v-model="currentPassword"
        type="password"
        name="current-password"
        autocomplete="current-password"
        class="w-full"
        required
      />
    </UFormField>
    <UFormField
      :label="t('auth.changePassword.new')"
      :help="t('auth.changePassword.rules')"
    >
      <UInput
        v-model="newPassword"
        type="password"
        name="new-password"
        autocomplete="new-password"
        minlength="8"
        class="w-full"
        required
      />
    </UFormField>
    <UFormField :label="t('auth.changePassword.repeat')">
      <UInput
        v-model="repeatPassword"
        type="password"
        name="repeat-password"
        autocomplete="new-password"
        class="w-full"
        required
      />
    </UFormField>
    <UButton
      type="submit"
      block
      :loading="loading"
      :label="t('auth.changePassword.submit')"
    />
  </form>
</template>
