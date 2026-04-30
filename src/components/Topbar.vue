<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { Settings, FolderOpen, Minus, Square, X, PanelBottom } from "lucide-vue-next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../stores/workspaceStore";

const router = useRouter();
const workspace = useWorkspaceStore();

const win = getCurrentWindow();
const isMaximized = ref(false);
const widgetVisible = ref(false);
let unlistenResize: (() => void) | null = null;

onMounted(async () => {
  isMaximized.value = await win.isMaximized();
  unlistenResize = await win.onResized(async () => {
    isMaximized.value = await win.isMaximized();
  });
  widgetVisible.value = await invoke<boolean>("is_widget_visible").catch(() => false);
});

onUnmounted(() => {
  unlistenResize?.();
});

async function minimize() { await win.minimize(); }
async function toggleMaximize() { await win.toggleMaximize(); }
async function close() { await win.close(); }

async function toggleWidget() {
  widgetVisible.value = await invoke<boolean>("toggle_widget").catch(() => false);
}
</script>

<template>
  <header class="topbar">
    <!-- Left: brand + workspace -->
    <div class="topbar-left">
      <div class="brand">
        <span class="brand-dot" />
        <span class="brand-name">Clock Lock</span>
      </div>

      <div class="divider-v" />

      <button class="open-btn" @click="workspace.openWorkspace()">
        <FolderOpen :size="13" />
        <span>{{ workspace.name ?? "Open Folder" }}</span>
      </button>
    </div>

    <!-- Center: drag region -->
    <div class="drag-fill" data-tauri-drag-region />

    <!-- Right: app controls + window controls -->
    <div class="topbar-right">
      <button class="icon-btn" title="Widget" @click="toggleWidget">
        <PanelBottom :size="14" :class="{ 'widget-on': widgetVisible }" />
      </button>

      <button class="icon-btn" title="Settings" @click="router.push('/settings')">
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
  height: 40px;
  padding: 0 0 0 10px;
  background-color: var(--color-topbar-bg);
  border-bottom: 1px solid var(--color-topbar-border);
  flex-shrink: 0;
  position: relative;
  user-select: none;
}

[data-theme="light"] .topbar::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--color-accent-blue);
  opacity: 0.5;
}

.drag-fill {
  flex: 1;
  height: 100%;
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
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
}

.brand-name {
  font-size: 13px;
  font-weight: 700;
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
  padding: 3px 9px;
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

.open-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.open-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
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

.icon-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-surface-hover);
}

.widget-on { color: var(--color-accent-purple) !important; }

/* ── Window divider ── */
.win-divider {
  width: 1px;
  height: 16px;
  background: var(--color-border);
  margin: 0 2px;
}

/* ── Window control buttons ── */
.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 40px;
  border: none;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition);
  border-radius: 0;
}

.win-btn:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.win-close:hover {
  background-color: #c0392b;
  color: var(--color-bg);
}
</style>
