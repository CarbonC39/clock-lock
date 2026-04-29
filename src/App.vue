<script setup lang="ts">
import { onMounted } from "vue";
import { useUiStore } from "./stores/uiStore";

const ui = useUiStore();
onMounted(() => ui.initTheme());
</script>

<template>
  <RouterView />
</template>
