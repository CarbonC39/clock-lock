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
    const [size, pos, sf] = await Promise.all([
      appWindow.outerSize(),
      appWindow.outerPosition(),
      appWindow.scaleFactor(),
    ]);
    savedState = { x: pos.x, y: pos.y, w: size.width, h: size.height, sf };

    const newW = Math.round(WIDGET_W * sf);
    const newH = Math.round(WIDGET_H * sf);
    // Shrink in place: keep the window's CENTER fixed so the widget collapses
    // toward where the window already is (anchored on position, not a corner).
    const newX = Math.round(pos.x + (size.width - newW) / 2);
    const newY = Math.round(pos.y + (size.height - newH) / 2);

    // Configure window flags up front (no visual size change yet)
    await appWindow.setMinSize(new LogicalSize(WIDGET_W, WIDGET_H));
    await Promise.all([
      appWindow.setAlwaysOnTop(true),
      appWindow.setSkipTaskbar(true),
      appWindow.setMaximizable(false),
    ]);

    // Swap to the centered widget view, then collapse the window around it.
    widgetMode.value = true;
    await nextTick();
    await appWindow.setPosition(new PhysicalPosition(newX, newY));
    await appWindow.setSize(new PhysicalSize(newW, newH));
  } catch (e) {
    console.error(e);
  }
}

async function restoreFromWidget() {
  try {
    const [size, pos] = await Promise.all([appWindow.outerSize(), appWindow.outerPosition()]);

    const newW = Math.round(savedState.w);
    const newH = Math.round(savedState.h);
    // Expand from the widget's CENTER, then clamp on-screen.
    const newX = Math.max(0, Math.round(pos.x + (size.width - newW) / 2));
    const newY = Math.max(0, Math.round(pos.y + (size.height - newH) / 2));

    await Promise.all([
      appWindow.setAlwaysOnTop(false),
      appWindow.setSkipTaskbar(false),
      appWindow.setMaximizable(true),
    ]);

    // Grow first (min size still small so it never clamps), reposition, then swap content.
    await appWindow.setPosition(new PhysicalPosition(newX, newY));
    await appWindow.setSize(new PhysicalSize(newW, newH));
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
