<template>
  <div class="min-h-dvh flex flex-col items-center justify-center gap-6 p-4 bg-(--ui-bg-muted)">
    <div class="flex items-center gap-3">
      <KlonkLogo class="text-2xl" />
      <slot name="badge" />
    </div>
    <UCard class="w-full max-w-sm">
      <slot />
    </UCard>
    <div class="flex items-center gap-2">
      <LocaleSwitch />
      <UColorModeButton />
    </div>
  </div>
</template>
