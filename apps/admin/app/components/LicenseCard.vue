<script setup lang="ts">
const props = defineProps<{
  title: string
  license: LicenseInfo
  usage: { used: number, max: number | null }
  hasToken: boolean
  /** Token darf hier geändert werden */
  editable: boolean
  /** Hinweis, warum nicht änderbar (z. B. per Umgebungsvariable gesetzt) */
  lockedHint?: string
}>()

const emit = defineEmits<{ save: [token: string | null] }>()

const { t, d } = useI18n()
const { public: { shopUrl } } = useRuntimeConfig()

const token = ref('')
const features = LICENSE_FEATURES.filter(f => f !== 'hosted')

const isFree = computed(() => props.license.plan === 'free')
const usagePercent = computed(() => (props.usage.max ? Math.min(100, (props.usage.used / props.usage.max) * 100) : 0))

function save() {
  emit('save', token.value.trim() || null)
  token.value = ''
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-sm text-(--ui-text-muted)">
            {{ title }}
          </p>
          <p
            class="text-xl font-bold"
            data-testid="license-plan"
          >
            {{ isFree ? t('admin.license.free') : license.plan }}
            <span
              v-if="license.licensee"
              class="font-normal text-(--ui-text-muted)"
            >· {{ license.licensee }}</span>
          </p>
        </div>
        <UBadge
          v-if="license.problem"
          :color="license.problem === 'grace' ? 'warning' : 'error'"
          variant="subtle"
          :label="t(`admin.license.problem.${license.problem}`)"
        />
        <UBadge
          v-else-if="license.expiresAt"
          color="success"
          variant="subtle"
          :label="t('admin.license.validUntil', { date: d(new Date(license.expiresAt), { dateStyle: 'medium' }) })"
        />
      </div>
    </template>

    <div class="space-y-6">
      <div>
        <div class="mb-1 flex justify-between text-sm">
          <span>{{ t('admin.license.users') }}</span>
          <span data-testid="license-usage">
            {{ usage.max === null ? t('admin.license.usersUnlimited', { used: usage.used }) : `${usage.used} / ${usage.max}` }}
          </span>
        </div>
        <UProgress
          v-if="usage.max !== null"
          :model-value="usagePercent"
          :color="usage.used >= usage.max ? 'error' : 'primary'"
        />
      </div>

      <ul class="grid gap-2 sm:grid-cols-2">
        <li
          v-for="feature in features"
          :key="feature"
          class="flex items-start gap-2 text-sm"
          :data-testid="`feature-${feature}`"
          :data-enabled="hasFeature(license, feature)"
        >
          <UIcon
            :name="hasFeature(license, feature) ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
            :class="hasFeature(license, feature) ? 'text-(--ui-success)' : 'text-(--ui-text-dimmed)'"
            class="mt-0.5 size-4 shrink-0"
          />
          <span>{{ t(`admin.license.features.${feature}`) }}</span>
        </li>
      </ul>

      <form
        v-if="editable"
        class="space-y-2"
        @submit.prevent="save"
      >
        <UFormField
          :label="t('admin.license.token')"
          :help="hasToken ? t('admin.license.tokenReplace') : t('admin.license.tokenHelp')"
        >
          <UTextarea
            v-model="token"
            name="license-token"
            :rows="3"
            autoresize
            class="w-full font-mono"
          />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton
            type="submit"
            icon="i-lucide-key-round"
            :label="t('admin.license.activate')"
            :disabled="!token.trim()"
          />
          <UButton
            v-if="hasToken"
            variant="ghost"
            color="error"
            :label="t('admin.license.remove')"
            @click="emit('save', null)"
          />
          <UButton
            v-if="shopUrl"
            variant="outline"
            color="neutral"
            :to="shopUrl"
            target="_blank"
            trailing-icon="i-lucide-external-link"
            :label="isFree ? t('admin.license.buy') : t('admin.license.manage')"
          />
        </div>
      </form>
      <p
        v-else-if="lockedHint"
        class="text-sm text-(--ui-text-muted)"
      >
        {{ lockedHint }}
      </p>
    </div>
  </UCard>
</template>
