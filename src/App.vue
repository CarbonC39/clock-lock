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

    // Pivot on the window's CENTER: the widget lands centered over where the big
    // window was, instead of snapping to its top-left corner.
    const targetX = Math.round(pos.x + (size.width - newW) / 2);
    const targetY = Math.round(pos.y + (size.height - newH) / 2);

    if (await appWindow.isMaximized()) await appWindow.unmaximize();

    await appWindow.setMinSize(new LogicalSize(WIDGET_W, WIDGET_H));
    await Promise.all([
      appWindow.setAlwaysOnTop(true),
      appWindow.setSkipTaskbar(true),
      appWindow.setMaximizable(false),
    ]);

    // Order matters: shrink FIRST (anchored at the old top-left, so the window is
    // now small but still fully inside the old rect), THEN move to the centered
    // target. Because the window is already small when we reposition, the target
    // is guaranteed inside the screen and the WM can't clamp it off-screen.
    // Resize before swapping content so a full-window sized pet never flashes.
    await appWindow.setSize(new PhysicalSize(newW, newH));
    await appWindow.setPosition(new PhysicalPosition(targetX, targetY));
    widgetMode.value = true;
    await nextTick();
  } catch (e) {
    console.error(e);
  }
}

async function restoreFromWidget() {
  try {
    await Promise.all([
      appWindow.setAlwaysOnTop(false),
      appWindow.setSkipTaskbar(false),
      appWindow.setMaximizable(true),
    ]);

    // Return to the exact rect the window had before shrinking: move first (the
    // window is still small, so this never clamps), swap content, then grow into
    // the saved size from the saved top-left.
    await appWindow.setPosition(new PhysicalPosition(savedState.x, savedState.y));
    widgetMode.value = false;
    await nextTick();
    await appWindow.setSize(new PhysicalSize(Math.round(savedState.w), Math.round(savedState.h)));
    await appWindow.setMinSize(new LogicalSize(720, 500));
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
