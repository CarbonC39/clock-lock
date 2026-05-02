<script setup lang="ts">
import { ref, onMounted, provide, watch, nextTick } from "vue";
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

    const newW = Math.round(WIDGET_W * sf);
    const newH = Math.round(WIDGET_H * sf);
    // Anchor bottom-right corner so widget appears at current window's bottom-right
    const newX = Math.round(pos.x + size.width - newW);
    const newY = Math.round(pos.y + size.height - newH);

    // Switch Vue first so WidgetWindow renders; then resize (no RouterView flash)
    widgetMode.value = true;
    await nextTick();
    await appWindow.setAlwaysOnTop(true);
    await appWindow.setMaximizable(false);
    await appWindow.setMinSize(new LogicalSize(WIDGET_W, WIDGET_H));
    await appWindow.setSize(new PhysicalSize(newW, newH));
    await appWindow.setPosition(new PhysicalPosition(newX, newY));
  } catch (e) {
    console.error(e);
  }
}

async function restoreFromWidget() {
  try {
    const size = await appWindow.outerSize();
    const pos = await appWindow.outerPosition();

    const newW = Math.round(savedState.w);
    const newH = Math.round(savedState.h);
    // Anchor bottom-right corner
    const newX = Math.round(pos.x + size.width - newW);
    const newY = Math.round(pos.y + size.height - newH);

    // Resize first so RouterView renders into the correct large window (no squish flash)
    await appWindow.setAlwaysOnTop(false);
    await appWindow.setMaximizable(true);
    await appWindow.setSize(new PhysicalSize(newW, newH));
    await appWindow.setPosition(new PhysicalPosition(newX, newY));
    // Set minSize after resize so it never clamps the current small size
    await appWindow.setMinSize(new LogicalSize(720, 500));
    widgetMode.value = false;
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
