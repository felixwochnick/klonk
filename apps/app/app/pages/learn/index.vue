<script setup lang="ts">
import { LEARN_MODULES } from '@klonk/learn'

const { t, locale } = useI18n()
useSeoMeta({ title: () => t('learn.title') })

const learn = useLearn()
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))
const status = computed(() => learn.status.value)
const moduleNumber = (id: string) => LEARN_MODULES.findIndex(m => m.id === id) + 1
// Module freigegeben, aber kein erlaubter Speicherort nutzbar (z. B. nur Cloud ohne Abo)
const noStorage = computed(() => !!learn.modules.value.length && learn.modules.value.every(m => !learn.canStart(m.id)))
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-6 max-w-3xl">
      <h1 class="text-2xl font-bold">
        {{ t('learn.title') }}
      </h1>
      <p class="mt-2 text-(--ui-text-muted)">
        {{ t('learn.intro') }}
      </p>
    </div>

    <div
      v-if="learn.loading.value"
      class="py-12 text-center text-(--ui-text-muted)"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin"
      />
    </div>

    <template v-else-if="status">
      <UAlert
        v-if="noStorage"
        color="warning"
        variant="subtle"
        icon="i-lucide-cloud-off"
        :title="t('learn.noStorage')"
        :description="t('learn.noStorageHint')"
        class="mb-6"
        data-testid="learn-no-storage"
      />

      <!-- Gruppenleitung: Freigabe und Lernstand -->
      <section
        v-if="status.groups.length"
        class="mb-8"
        data-testid="learn-groups"
      >
        <h2 class="mb-3 text-lg font-semibold">
          {{ t('learn.myGroups') }}
        </h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UCard
            v-for="group in status.groups"
            :key="group.id"
            :data-testid="`learn-group-${group.name}`"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-semibold">
                  {{ group.name }}
                </h3>
                <p class="mt-1 text-sm text-(--ui-text-muted)">
                  {{ t('learn.groupSummary', { members: group.members, modules: group.modules.length }) }}
                </p>
              </div>
              <UIcon
                name="i-lucide-users"
                class="size-5 shrink-0 text-(--ui-text-muted)"
              />
            </div>
            <template #footer>
              <UButton
                :to="`/learn/groups/${group.id}`"
                :label="t('learn.openProgress')"
                trailing-icon="i-lucide-arrow-right"
                variant="soft"
                block
              />
            </template>
          </UCard>
        </div>
      </section>

      <UAlert
        v-if="!learn.modules.value.length"
        color="info"
        variant="subtle"
        icon="i-lucide-lock"
        :title="t('learn.noModules')"
        :description="t('learn.noModulesHint')"
        data-testid="learn-no-modules"
      />

      <template v-else-if="learn.modules.value.length">
        <h2
          v-if="status.groups.length"
          class="mb-3 text-lg font-semibold"
        >
          {{ t('learn.modules') }}
        </h2>
        <div
          class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="learn-modules"
        >
          <UCard
            v-for="module in learn.modules.value"
            :key="module.id"
            :data-testid="`learn-module-${module.id}`"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
                  {{ t('learn.moduleNumber', { n: moduleNumber(module.id) }) }}
                </p>
                <h2 class="mt-1 font-semibold">
                  {{ module.title[lang] }}
                </h2>
              </div>
              <UIcon
                v-if="learn.solvedCount(module) === module.tasks.length"
                name="i-lucide-circle-check"
                class="size-6 shrink-0 text-(--ui-success)"
                :aria-label="t('learn.completed')"
              />
            </div>
            <p class="mt-2 text-sm text-(--ui-text-muted)">
              {{ module.summary[lang] }}
            </p>
            <div class="mt-4">
              <div class="mb-1 flex justify-between text-xs text-(--ui-text-muted)">
                <span>{{ t('learn.progress', { solved: learn.solvedCount(module), total: module.tasks.length }) }}</span>
              </div>
              <UProgress
                :model-value="learn.solvedCount(module)"
                :max="module.tasks.length"
                size="sm"
              />
            </div>
            <template #footer>
              <UButton
                :to="`/learn/${module.id}`"
                :label="learn.progress(module.id) ? t('learn.continue') : t('learn.start')"
                trailing-icon="i-lucide-arrow-right"
                variant="soft"
                block
              />
            </template>
          </UCard>
        </div>

        <p class="mt-8 text-xs text-(--ui-text-muted)">
          {{ status.restricted ? t('learn.storageHintGroup') : t('learn.storageHint') }}
        </p>
      </template>
    </template>
  </UContainer>
</template>
