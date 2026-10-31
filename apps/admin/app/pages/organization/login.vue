<script setup lang="ts">
definePageMeta({ requiresAdmin: true })

const { t } = useI18n()
useSeoMeta({ title: () => t('admin.nav.login') })

const toast = useToast()
const apiError = useApiError()

const { data } = await useFetch('/api/admin/organization/auth')

const list = (v?: string[]) => (v ?? []).join('\n')
const parseList = (v: string) => v.split('\n').map(s => s.trim()).filter(Boolean)

const form = reactive({
  localEnabled: data.value?.localEnabled ?? true,
  oidcEnabled: data.value?.oidcEnabled ?? false,
  ldapEnabled: data.value?.ldapEnabled ?? false,
})

const oidcForm = reactive({
  issuer: data.value?.oidc?.issuer ?? '',
  clientId: data.value?.oidc?.clientId ?? '',
  clientSecret: '',
  scopes: data.value?.oidc?.scopes ?? 'openid profile email',
  usernameClaim: data.value?.oidc?.usernameClaim ?? 'preferred_username',
  roleClaim: data.value?.oidc?.roleClaim ?? '',
  teacherValues: list(data.value?.oidc?.teacherValues),
  adminValues: list(data.value?.oidc?.adminValues),
})

const ldapForm = ref({
  url: data.value?.ldap?.url ?? 'ldaps://',
  bindDn: data.value?.ldap?.bindDn ?? '',
  bindPassword: '',
  baseDn: data.value?.ldap?.baseDn ?? '',
  userFilter: data.value?.ldap?.userFilter ?? '(uid={{username}})',
  usernameAttribute: data.value?.ldap?.usernameAttribute ?? 'uid',
  displayNameAttribute: data.value?.ldap?.displayNameAttribute ?? 'cn',
  teacherGroups: list(data.value?.ldap?.teacherGroups),
  adminGroups: list(data.value?.ldap?.adminGroups),
  startTls: data.value?.ldap?.startTls ?? false,
})

const hasClientSecret = computed(() => data.value?.oidc?.hasClientSecret)
const hasBindPassword = computed(() => data.value?.ldap?.hasBindPassword)
const callbackUrl = computed(() => `${useRequestURL().origin}/auth/oidc/callback`)

// OIDC/LDAP werden nur gespeichert, wenn sie ausgefüllt sind
const oidcFilled = computed(() => !!oidcForm.issuer && !!oidcForm.clientId)
const ldapFilled = computed(() => !!ldapForm.value.url && !!ldapForm.value.baseDn && ldapForm.value.url !== 'ldaps://')

function body() {
  return {
    localEnabled: form.localEnabled,
    oidcEnabled: form.oidcEnabled,
    oidc: oidcFilled.value
      ? {
          ...oidcForm,
          roleClaim: oidcForm.roleClaim || undefined,
          teacherValues: parseList(oidcForm.teacherValues),
          adminValues: parseList(oidcForm.adminValues),
        }
      : null,
    ldapEnabled: form.ldapEnabled,
    ldap: ldapFilled.value
      ? {
          ...ldapForm.value,
          teacherGroups: parseList(ldapForm.value.teacherGroups),
          adminGroups: parseList(ldapForm.value.adminGroups),
        }
      : null,
  }
}

async function save() {
  try {
    await $fetch('/api/admin/organization/auth', { method: 'PUT', body: body() })
    toast.add({ title: t('admin.saved'), color: 'success' })
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}

const testing = ref<'oidc' | 'ldap' | null>(null)
async function test(kind: 'oidc' | 'ldap') {
  testing.value = kind
  try {
    const result = await $fetch<{ ok: boolean, message?: string }>(`/api/admin/organization/test-${kind}`, {
      method: 'POST',
      body: body(),
    })
    toast.add(result.ok
      ? { title: t('admin.login.testOk'), description: result.message, color: 'success' }
      : { title: t('admin.login.testFailed'), description: result.message, color: 'error' })
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
  finally {
    testing.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="login-settings">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.login')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            :label="t('admin.save')"
            icon="i-lucide-save"
            @click="save"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-3xl space-y-6">
        <p class="text-(--ui-text-muted)">
          {{ t('admin.login.description') }}
        </p>

        <!-- Lokale Konten -->
        <UCard>
          <USwitch
            v-model="form.localEnabled"
            :label="t('admin.login.local')"
            :description="t('admin.login.localDescription')"
          />
        </UCard>

        <!-- OIDC -->
        <UCard>
          <template #header>
            <USwitch
              v-model="form.oidcEnabled"
              :label="t('admin.login.oidc')"
              :description="t('admin.login.oidcDescription')"
            />
          </template>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('admin.login.callbackUrl')"
              :help="t('admin.login.callbackUrlHelp')"
              class="sm:col-span-2"
            >
              <UInput
                :model-value="callbackUrl"
                readonly
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Issuer URL"
              class="sm:col-span-2"
            >
              <UInput
                v-model="oidcForm.issuer"
                placeholder="https://login.microsoftonline.com/<tenant>/v2.0"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Client ID">
              <UInput
                v-model="oidcForm.clientId"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Client Secret"
              :help="hasClientSecret ? t('admin.login.secretKept') : undefined"
            >
              <UInput
                v-model="oidcForm.clientSecret"
                type="password"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('admin.login.scopes')">
              <UInput
                v-model="oidcForm.scopes"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('admin.login.usernameClaim')">
              <UInput
                v-model="oidcForm.usernameClaim"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.login.roleClaim')"
              :help="t('admin.login.roleClaimHelp')"
              class="sm:col-span-2"
            >
              <UInput
                v-model="oidcForm.roleClaim"
                placeholder="groups"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('admin.login.teacherValues')">
              <UTextarea
                v-model="oidcForm.teacherValues"
                :rows="2"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('admin.login.adminValues')">
              <UTextarea
                v-model="oidcForm.adminValues"
                :rows="2"
                class="w-full"
              />
            </UFormField>
          </div>
          <template #footer>
            <UButton
              variant="outline"
              icon="i-lucide-plug-zap"
              :label="t('admin.login.test')"
              :loading="testing === 'oidc'"
              :disabled="!oidcFilled"
              @click="test('oidc')"
            />
          </template>
        </UCard>

        <!-- LDAP -->
        <UCard>
          <template #header>
            <USwitch
              v-model="form.ldapEnabled"
              :label="t('admin.login.ldap')"
              :description="t('admin.login.ldapDescription')"
            />
          </template>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Server URL"
              class="sm:col-span-2"
            >
              <UInput
                v-model="ldapForm.url"
                placeholder="ldaps://ldap.meine-schule.de:636"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Bind DN">
              <UInput
                v-model="ldapForm.bindDn"
                placeholder="cn=klonk,ou=services,dc=schule,dc=de"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.login.bindPassword')"
              :help="hasBindPassword ? t('admin.login.secretKept') : undefined"
            >
              <UInput
                v-model="ldapForm.bindPassword"
                type="password"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Base DN">
              <UInput
                v-model="ldapForm.baseDn"
                placeholder="ou=users,dc=schule,dc=de"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.login.userFilter')"
              :help="t('admin.login.userFilterHelp')"
            >
              <UInput
                v-model="ldapForm.userFilter"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('admin.login.usernameAttribute')">
              <UInput
                v-model="ldapForm.usernameAttribute"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('admin.login.displayNameAttribute')">
              <UInput
                v-model="ldapForm.displayNameAttribute"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.login.teacherGroups')"
              :help="t('admin.login.groupsHelp')"
            >
              <UTextarea
                v-model="ldapForm.teacherGroups"
                :rows="2"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.login.adminGroups')"
              :help="t('admin.login.groupsHelp')"
            >
              <UTextarea
                v-model="ldapForm.adminGroups"
                :rows="2"
                class="w-full"
              />
            </UFormField>
            <USwitch
              v-model="ldapForm.startTls"
              label="StartTLS"
            />
          </div>
          <template #footer>
            <UButton
              variant="outline"
              icon="i-lucide-plug-zap"
              :label="t('admin.login.test')"
              :loading="testing === 'ldap'"
              :disabled="!ldapFilled"
              @click="test('ldap')"
            />
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
