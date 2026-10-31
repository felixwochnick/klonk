<template>
  <div class="min-h-dvh flex flex-col">
    <UHeader>
      <template #title>
        <KlonkLogo />
      </template>
      <template #right>
        <LocaleSwitch />
        <UColorModeButton />
        <UserMenu />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
