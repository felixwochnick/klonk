<script setup lang="ts">
definePageMeta({ public: true, layout: 'auth' })

const { t } = useI18n()
useSeoMeta({ title: () => t('admin.setup.title') })

const { fetch: refreshSession } = useUserSession()
const apiError = useApiError()

const form = reactive({
  organizationType: 'school' as OrganizationType,
  organizationName: '',
  domain: '',
  username: 'admin',
  displayName: '',
  password: '',
})
const error = ref<string | null>(null)
const loading = ref(false)

const typeItems = computed(() => [
  { label: t('admin.organizationType.school'), value: 'school' },
  { label: t('admin.organizationType.company'), value: 'company' },
])

async function submit() {
  error.value = null
  loading.value = true
  try {
    await $fetch('/api/setup', { method: 'POST', body: form })
    useState('setup-done').value = true
    await refreshSession()
    await navigateTo('/')
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
    <div>
      <h1 class="text-xl font-bold">
        {{ t('admin.setup.title') }}
      </h1>
      <p class="text-sm text-(--ui-text-muted)">
        {{ t('admin.setup.description') }}
      </p>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error"
    />

    <UFormField :label="t('admin.organization.type')">
      <URadioGroup
        v-model="form.organizationType"
        :items="typeItems"
        orientation="horizontal"
      />
    </UFormField>
    <UFormField :label="t('admin.organization.name')">
      <UInput
        v-model="form.organizationName"
        name="organizationName"
        class="w-full"
        required
      />
    </UFormField>
    <UFormField
      :label="t('admin.organization.domain')"
      :help="t('admin.organization.domainHelp')"
    >
      <UInput
        v-model="form.domain"
        name="domain"
        placeholder="meine-schule.de"
        class="w-full"
        required
      />
    </UFormField>

    <USeparator :label="t('admin.setup.adminAccount')" />

    <UFormField :label="t('admin.users.displayName')">
      <UInput
        v-model="form.displayName"
        name="displayName"
        class="w-full"
        required
      />
    </UFormField>
    <UFormField :label="t('admin.users.username')">
      <UInput
        v-model="form.username"
        name="username"
        class="w-full"
        required
      >
        <template #trailing>
          <span class="text-xs text-(--ui-text-muted)">@{{ form.domain || 'domain' }}</span>
        </template>
      </UInput>
    </UFormField>
    <UFormField
      :label="t('auth.login.password')"
      :help="t('auth.changePassword.rules')"
    >
      <UInput
        v-model="form.password"
        type="password"
        name="password"
        autocomplete="new-password"
        minlength="8"
        class="w-full"
        required
      />
    </UFormField>

    <UButton
      type="submit"
      block
      :loading="loading"
      :label="t('admin.setup.submit')"
    />
  </form>
</template>
