<script setup lang="ts">
// Alte Adresse des Lernstands einer Gruppe – liegt jetzt unter Unterricht
definePageMeta({ redirect: to => `/teaching/groups/${String(to.params.id)}` })
</script>

<template>
  <div />
</template>
