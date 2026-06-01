<script setup lang="ts">
import { ref, onMounted, onUnmounted, inject } from "vue";
import { Settings, FolderOpen, Minus, Square, X, PanelBottom, Sun, Moon } from "lucide-vue-next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useSupervisionStore } from "../stores/supervisionStore";
import { useAgentStore } from "../stores/agentStore";
import { useUiStore } from "../stores/uiStore";
import AgentPet from "./AgentPet.vue";

const workspace = useWorkspaceStore();
const settings = useSettingsStore();
const sv = useSupervisionStore();
const agent = useAgentStore();
const ui = useUiStore();
const toggleWidget = inject<() => Promise<void>>("toggleWidget");

const win = getCurrentWindow();
const isMaximized = ref(false);
const liveTime = ref("");
let unlistenResize: (() => void) | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

function updateClock() {
  liveTime.value = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

onMounted(async () => {
  isMaximized.value = await win.isMaximized();
  unlistenResize = await win.onResized(async () => {
    isMaximized.value = await win.isMaximized();
  });
  updateClock();
  clockTimer = setInterval(updateClock, 15_000);
});

onUnmounted(() => {
  unlistenResize?.();
  if (clockTimer) clearInterval(clockTimer);
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
        <span class="brand-dot" />
        <span class="brand-name">Clock&nbsp;Lock</span>
      </div>

      <div class="divider-v" />

      <button class="open-btn" @click="workspace.openWorkspace()">
        <FolderOpen :size="13" />
        <span>{{ workspace.name ?? "Open Folder" }}</span>
      </button>
    </div>

    <!-- Center: the presiding face (click-through so the center stays draggable) -->
    <div class="topbar-face">
      <AgentPet :state="agent.state" size="xl" />
    </div>

    <!-- Right: focus toggle, clock, controls -->
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

      <span class="live-clock">{{ liveTime }}</span>

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

      <div class="win-divider" />

      <button class="win-btn win-min" title="Minimize" @click="minimize">
        <Minus :size="11" />
      </button>
      <button class="win-btn win-max" :title="isMaximized ? 'Restore' : 'Maximize'" @click="toggleMaximize">
        <Square :size="10" />
      </button>
      <button class="win-btn win-close" title="Close" @click="close">
        <X :size="11" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 46px;
  padding: 0 0 0 12px;
  background-color: var(--color-topbar-bg);
  border-bottom: 1px solid var(--color-topbar-border);
  flex-shrink: 0;
  position: relative;
  user-select: none;
}

.drag-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.topbar::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--color-accent-blue), var(--color-accent-purple), var(--color-accent-pink));
  opacity: 0.55;
  transition: background 0.3s ease, opacity 0.3s ease;
}
.topbar.dnd-active::after {
  background: var(--color-accent-red);
  opacity: 0.85;
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
.topbar-right { padding-right: 0; }

/* ── Centered face ── */
.topbar-face {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}

/* ── Brand ── */
.brand {
  display: flex;
  align-items: center;
  gap: 7px;
}

.brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-pink));
  flex-shrink: 0;
  box-shadow: 0 0 6px color-mix(in srgb, var(--color-accent-blue) 50%, transparent);
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
  max-width: 200px;
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
.dnd-switch.active .dnd-track { background: var(--color-accent-red); }
.dnd-switch.active .dnd-thumb { transform: translateX(12px); background: #fff; }

.dnd-label {
  font-size: 10px;
  font-weight: 800;
  font-family: var(--font-mono);
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  transition: color var(--transition);
}
.dnd-switch.active .dnd-label { color: var(--color-accent-red); }

/* ── Live clock ── */
.live-clock {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.04em;
  padding: 0 4px;
  font-variant-numeric: tabular-nums;
}

/* ── App icon buttons ── */
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition), color var(--transition);
}
.icon-btn:hover { color: var(--color-text-primary); background: var(--color-surface-hover); }
.icon-btn.active { color: var(--color-accent-blue); background: color-mix(in srgb, var(--color-accent-blue) 12%, transparent); }

.win-divider {
  width: 1px;
  height: 18px;
  background: var(--color-border);
  margin: 0 4px 0 2px;
}

/* ── Window control buttons ── */
.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 46px;
  border: none;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition);
  border-radius: 0;
}
.win-btn:hover { background-color: var(--color-surface-hover); color: var(--color-text-primary); }
.win-close:hover { background-color: #c0392b; color: #fff; }
</style>
