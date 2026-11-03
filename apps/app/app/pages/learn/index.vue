<script setup lang="ts">
const { t, locale } = useI18n()
useSeoMeta({ title: () => t('learn.title') })

const learn = useLearn()
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))
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
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="learn-modules"
    >
      <UCard
        v-for="(module, i) in learn.modules"
        :key="module.id"
        :data-testid="`learn-module-${module.id}`"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
              {{ t('learn.moduleNumber', { n: i + 1 }) }}
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
            :label="learn.solvedCount(module) ? t('learn.continue') : t('learn.start')"
            trailing-icon="i-lucide-arrow-right"
            variant="soft"
            block
          />
        </template>
      </UCard>
    </div>

    <p class="mt-8 text-xs text-(--ui-text-muted)">
      {{ t('learn.storageHint') }}
    </p>
  </UContainer>
</template>
