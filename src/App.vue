<script setup lang="ts">
import { onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "./stores/uiStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useSettingsStore } from "./stores/settingsStore";

const ui = useUiStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();

onMounted(async () => {
  ui.initTheme();
  settings.load();
  if (ui.autoRestoreWorkspace) {
    const last = await invoke<string | null>("get_last_workspace").catch(() => null);
    if (last) workspace.loadWorkspace(last).catch(console.warn);
  }
});
</script>

<template>
  <RouterView />
</template>
