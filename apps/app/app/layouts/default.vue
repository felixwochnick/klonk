<template>
  <div class="min-h-dvh flex flex-col">
    <UHeader title="Klonk">
      <template #right>
        <LocaleSwitch />
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
