<script setup lang="ts">
import { ref, onMounted, onUnmounted, inject } from "vue";
import { Settings, FolderOpen, Minus, Square, X, PanelBottom, Sun, Moon } from "lucide-vue-next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useSupervisionStore } from "../stores/supervisionStore";
import { useUiStore } from "../stores/uiStore";

const workspace = useWorkspaceStore();
const settings = useSettingsStore();
const sv = useSupervisionStore();
const ui = useUiStore();
const toggleWidget = inject<() => Promise<void>>("toggleWidget");

const win = getCurrentWindow();
const isMaximized = ref(false);
let unlistenResize: (() => void) | null = null;

function syncMaximized(v: boolean) {
  isMaximized.value = v;
  document.body.classList.toggle("is-maximized", v);
}

onMounted(async () => {
  syncMaximized(await win.isMaximized());
  unlistenResize = await win.onResized(async () => {
    syncMaximized(await win.isMaximized());
  });
});

onUnmounted(() => {
  unlistenResize?.();
});

async function minimize() { await win.minimize(); }
async function toggleMaximize() { await win.toggleMaximize(); }
async function close() {
  if (settings.settings.close_behavior === "hide") {
    await win.hide();
  } else {
    await win.close();
  }
}
</script>

<template>
  <header class="topbar" :class="{ 'dnd-active': sv.dnd }">
    <!-- Full-width drag layer behind the controls -->
    <div class="drag-layer" data-tauri-drag-region />

    <!-- Left: brand + workspace -->
    <div class="topbar-left">
      <div class="brand">
        <img src="/app-icon.svg" class="brand-logo" alt="Clock Lock" />
        <span class="brand-name">Clock&nbsp;Lock</span>
      </div>

      <div class="divider-v" />

      <button class="open-btn" @click="workspace.openWorkspace()">
        <FolderOpen :size="13" />
        <span>{{ workspace.name ?? "Open Folder" }}</span>
      </button>
    </div>

    <!-- Right: focus, theme, controls -->
    <div class="topbar-right">
      <label class="dnd-switch" :class="{ active: sv.dnd }" title="Focus mode — silences check-ins">
        <input
          type="checkbox"
          class="dnd-input"
          :checked="sv.dnd"
          @change="sv.setDnd(!sv.dnd)"
        />
        <span class="dnd-track"><span class="dnd-thumb" /></span>
        <span class="dnd-label">FOCUS</span>
      </label>

      <div class="divider-v" />

      <button
        class="icon-btn"
        :title="ui.isDark ? 'Switch to light' : 'Switch to dark'"
        @click="ui.toggleTheme()"
      >
        <component :is="ui.isDark ? Sun : Moon" :size="14" />
      </button>

      <button v-if="toggleWidget" class="icon-btn" title="Widget" @click="toggleWidget">
        <PanelBottom :size="14" />
      </button>

      <button
        class="icon-btn"
        :class="{ active: ui.settingsOpen }"
        title="Settings"
        @click="ui.toggleSettings()"
      >
        <Settings :size="14" />
      </button>

      <div class="win-group">
        <button class="win-btn" title="Minimize" @click="minimize">
          <Minus :size="14" />
        </button>
        <button class="win-btn" :title="isMaximized ? 'Restore' : 'Maximize'" @click="toggleMaximize">
          <Square :size="11" />
        </button>
        <button class="win-btn win-close" title="Close" @click="close">
          <X :size="14" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 46px;
  padding: 0 8px 0 12px;
  background-color: var(--color-bg);
  flex-shrink: 0;
  position: relative;
  user-select: none;
}

.drag-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

/* ── Brand ── */
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-logo {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  flex-shrink: 0;
  -webkit-user-drag: none;
  user-select: none;
}

.brand-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
}

.divider-v {
  width: 1px;
  height: 16px;
  background: var(--color-border);
  margin: 0 4px;
}

/* ── Workspace button ── */
.open-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-sans);
  background: none;
  border: none;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition);
  max-width: 220px;
  overflow: hidden;
}
.open-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.open-btn:hover { background: var(--color-surface-hover); color: var(--color-text-primary); }

/* ── DND / Focus pill ── */
.dnd-input { position: absolute; opacity: 0; width: 0; height: 0; }

.dnd-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 4px 8px;
  border-radius: 99px;
  transition: background-color var(--transition);
}
.dnd-switch:hover { background: var(--color-surface-hover); }

.dnd-track {
  position: relative;
  width: 26px;
  height: 14px;
  border-radius: 99px;
  background: var(--color-border);
  transition: background var(--transition);
  flex-shrink: 0;
}
.dnd-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition), background var(--transition);
}
.dnd-switch.active .dnd-track { background: var(--color-accent-pink); }
.dnd-switch.active .dnd-thumb { transform: translateX(12px); background: #fff; }

.dnd-label {
  font-size: 10px;
  font-weight: 800;
  font-family: var(--font-mono);
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  transition: color var(--transition);
}
.dnd-switch.active .dnd-label { color: var(--color-accent-pink); }

/* ── App icon buttons ── */
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition), color var(--transition);
}
.icon-btn:hover { color: var(--color-text-primary); background: var(--color-surface-hover); }
.icon-btn.active { color: var(--color-accent-blue); background: color-mix(in srgb, var(--color-accent-blue) 14%, transparent); }

/* ── Window controls ── */
.win-group {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
}
.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition), color var(--transition);
}
.win-btn:hover { background-color: var(--color-surface-hover); color: var(--color-text-primary); }
.win-close:hover { background-color: var(--color-accent-red); color: #fff; }
</style>
