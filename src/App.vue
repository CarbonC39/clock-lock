<script setup lang="ts">
import { ref, onMounted, provide, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize, PhysicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { useUiStore } from "./stores/uiStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useSettingsStore } from "./stores/settingsStore";
import WidgetWindow from "./components/WidgetWindow.vue";

const ui = useUiStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();

const widgetMode = ref(false);
const appWindow = getCurrentWindow();

watch(widgetMode, (val) => {
  if (val) {
    document.body.classList.add("is-widget");
  } else {
    document.body.classList.remove("is-widget");
  }
}, { immediate: true });

let savedState = { x: 0, y: 0, w: 1200, h: 760, sf: 1 };

const WIDGET_W = 260;
const WIDGET_H = 220;

async function toggleWidget() {
  if (widgetMode.value) {
    await restoreFromWidget();
  } else {
    await enterWidgetMode();
  }
}

async function enterWidgetMode() {
  try {
    const size = await appWindow.outerSize();
    const pos = await appWindow.outerPosition();
    const sf = await appWindow.scaleFactor();
    savedState = { x: pos.x, y: pos.y, w: size.width, h: size.height, sf };

    // New physical dimensions
    const newW = WIDGET_W * sf;
    const newH = WIDGET_H * sf;
    
    // Position to keep bottom-right anchored:
    // newX + newW = oldX + oldW  =>  newX = oldX + oldW - newW
    const newX = pos.x + size.width - newW;
    const newY = pos.y + size.height - newH;

    widgetMode.value = true;
    await appWindow.setAlwaysOnTop(true);
    await appWindow.setMaximizable(false);
    await appWindow.setMinSize(new LogicalSize(WIDGET_W, WIDGET_H));
    
    // Apply size then immediately fix position
    await appWindow.setSize(new PhysicalSize(Math.round(newW), Math.round(newH)));
    await appWindow.setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)));
  } catch (e) {
    console.error(e);
  }
}

async function restoreFromWidget() {
  try {
    const size = await appWindow.outerSize();
    const pos = await appWindow.outerPosition();
    
    // Position to keep bottom-right anchored:
    // newX + savedW = curX + curW  =>  newX = curX + curW - savedW
    const newX = pos.x + size.width - savedState.w;
    const newY = pos.y + size.height - savedState.h;

    widgetMode.value = false;
    await appWindow.setAlwaysOnTop(false);
    await appWindow.setMaximizable(true);
    await appWindow.setMinSize(new LogicalSize(720, 500));
    
    // Apply size then immediately fix position
    await appWindow.setSize(new PhysicalSize(Math.round(savedState.w), Math.round(savedState.h)));
    await appWindow.setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)));
  } catch (e) {
    console.error(e);
  }
}

provide("toggleWidget", toggleWidget);

onMounted(async () => {
  ui.initTheme();
  await settings.load();
  if (settings.settings.startup_mode === "minimized") {
    appWindow.minimize().catch(() => {});
  }
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
