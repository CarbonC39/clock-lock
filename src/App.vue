<script setup lang="ts">
import { ref, onMounted, provide } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useUiStore } from "./stores/uiStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useSettingsStore } from "./stores/settingsStore";
import WidgetWindow from "./components/WidgetWindow.vue";

const ui = useUiStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();

const widgetMode = ref(false);
const appWindow = getCurrentWindow();

let savedSize = { w: 1200, h: 760 };

const WIDGET_W = 240;
const WIDGET_H = 400;

async function toggleWidget() {
  if (widgetMode.value) {
    await restoreFromWidget();
  } else {
    await enterWidgetMode();
  }
}

async function enterWidgetMode() {
  try {
    const f = await appWindow.outerSize();
    savedSize = { w: f.width, h: f.height };
  } catch { /* ignore */ }

  widgetMode.value = true;
  await appWindow.setAlwaysOnTop(true);
  await appWindow.setResizable(false);
  await appWindow.setMinSize(new LogicalSize(WIDGET_W, WIDGET_H));
  await appWindow.setSize(new LogicalSize(WIDGET_W, WIDGET_H));
}

async function restoreFromWidget() {
  widgetMode.value = false;
  await appWindow.setAlwaysOnTop(false);
  await appWindow.setResizable(true);
  await appWindow.setMinSize(new LogicalSize(720, 500));
  await appWindow.setSize(new LogicalSize(savedSize.w, savedSize.h));
}

provide("toggleWidget", toggleWidget);

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
  <WidgetWindow v-if="widgetMode" @restore="restoreFromWidget" />
  <RouterView v-else />
</template>
