<script setup lang="ts">
const emit = defineEmits<{ success: [] }>()

const { t } = useI18n()
const { fetch: refreshSession } = useUserSession()
const apiError = useApiError()

const identifier = ref('')
const password = ref('')
const lookup = ref<LoginLookup | null>(null)
const route = useRoute()
// Fehler aus der SSO-Rückleitung (/login?error=…)
const error = ref<string | null>(typeof route.query.error === 'string' ? t(`errors.${route.query.error}`) : null)
const loading = ref(false)

const hasPassword = computed(() => lookup.value?.methods.some(m => m === 'password' || m === 'ldap'))
const hasOidc = computed(() => lookup.value?.methods.includes('oidc'))

async function submitIdentifier() {
  error.value = null
  loading.value = true
  try {
    lookup.value = await $fetch<LoginLookup>('/api/auth/lookup', {
      method: 'POST',
      body: { identifier: identifier.value },
    })
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    loading.value = false
  }
}

async function submitPassword() {
  error.value = null
  loading.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { identifier: identifier.value, password: password.value },
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

function loginWithOidc() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  return navigateTo(`/auth/oidc/${lookup.value!.organizationId}?redirect=${encodeURIComponent(redirect)}`, { external: true })
}

function reset() {
  lookup.value = null
  password.value = ''
  error.value = null
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold">
      {{ t('auth.login.title') }}
    </h1>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="error"
    />

    <form
      v-if="!lookup"
      class="space-y-4"
      @submit.prevent="submitIdentifier"
    >
      <UFormField
        :label="t('auth.login.identifier')"
        :help="t('auth.login.identifierHelp')"
      >
        <UInput
          v-model="identifier"
          name="identifier"
          autocomplete="username"
          placeholder="max@meine-schule.de"
          class="w-full"
          autofocus
          required
        />
      </UFormField>
      <UButton
        type="submit"
        block
        :loading="loading"
        :label="t('auth.login.next')"
      />
    </form>

    <div
      v-else
      class="space-y-4"
    >
      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="truncate">
          <span class="font-semibold">{{ identifier }}</span>
          <span class="block text-(--ui-text-muted)">{{ lookup.organizationName }}</span>
        </span>
        <UButton
          variant="link"
          size="sm"
          :label="t('auth.login.change')"
          @click="reset"
        />
      </div>

      <form
        v-if="hasPassword"
        class="space-y-4"
        @submit.prevent="submitPassword"
      >
        <UFormField :label="t('auth.login.password')">
          <UInput
            v-model="password"
            type="password"
            name="password"
            autocomplete="current-password"
            class="w-full"
            autofocus
            required
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="loading"
          :label="t('auth.login.submit')"
        />
      </form>

      <USeparator
        v-if="hasPassword && hasOidc"
        :label="t('auth.login.or')"
      />

      <UButton
        v-if="hasOidc"
        block
        variant="outline"
        icon="i-lucide-key-round"
        :label="t('auth.login.sso', { name: lookup.organizationName })"
        @click="loginWithOidc"
      />
    </div>

    <slot name="footer" />
  </div>
</template>
