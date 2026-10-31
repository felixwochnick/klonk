<template>
  <span class="inline-flex items-center gap-2 font-extrabold tracking-tight">
    <span
      class="grid size-7 grid-cols-2 gap-0.5 rounded-md bg-brick-red p-1"
      aria-hidden="true"
    >
      <span
        v-for="i in 4"
        :key="i"
        class="rounded-full bg-white/35"
      />
    </span>
    <slot>Klonk</slot>
  </span>
</template>
