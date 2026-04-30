<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAgentStore } from "../stores/agentStore";
import { useSettingsStore } from "../stores/settingsStore";
import AgentPet from "../components/AgentPet.vue";

const workspace = useWorkspaceStore();
const agent = useAgentStore();
const settings = useSettingsStore();
const appWindow = getCurrentWindow();

const topTodo = ref("");
const statusText = ref("Open a workspace");
const petState = ref<"idle" | "thinking" | "happy" | "sleepy" | "excited">("sleepy");

// Drag support
function onDragStart(e: MouseEvent) {
  e.preventDefault();
  appWindow.startDragging();
}

// Click to bring main window to focus
async function focusMain() {
  await invoke("toggle_widget").catch(() => {});
  // Toggle twice = show main + hide widget, then re-show widget
  await invoke("toggle_widget").catch(() => {});
}

// ── Parse top todo from home.md ──
function extractTopTodo(md: string): string {
  const lines = md.split("\n");
  let inTodoSection = false;
  for (const line of lines) {
    if (/^#\s+(todo|progress)/i.test(line)) {
      inTodoSection = true;
      continue;
    }
    if (/^#\s+/.test(line)) {
      inTodoSection = false;
      continue;
    }
    if (inTodoSection) {
      const todo = line.match(/^-\s*\[ \]\s+(.+)/);
      if (todo) {
        return todo[1].trim();
      }
    }
  }
  return "";
}

function refreshTodo() {
  if (workspace.homeMdContent) {
    const todo = extractTopTodo(workspace.homeMdContent);
    topTodo.value = todo || "No pending tasks";
  } else {
    topTodo.value = "";
  }
}

// ── Status text ──
function refreshStatus() {
  if (!workspace.path) {
    statusText.value = "Open a workspace";
    petState.value = "sleepy";
  } else if (agent.isBusy) {
    statusText.value = "Thinking…";
    petState.value = "thinking";
  } else if (agent.state === "happy") {
    statusText.value = "Ready";
    petState.value = "happy";
  } else {
    statusText.value = "Idle";
    petState.value = "idle";
  }
}

// ── Cross-window sync ──
let unlistens: (() => void)[] = [];

onMounted(async () => {
  // Load settings
  settings.load();

  // Listen for state updates from main window
  const u1 = await listen("widget-sync", (e: { payload: unknown }) => {
    const data = e.payload as Record<string, unknown>;
    if (data.workspacePath) workspace.path = data.workspacePath as string;
    if (data.homeMdContent !== undefined)
      workspace.homeMdContent = data.homeMdContent as string;
    if (data.agentState !== undefined)
      agent.state = data.agentState as typeof agent.state;
    if (data.agentBusy !== undefined) agent.isBusy = data.agentBusy as boolean;
    refreshTodo();
    refreshStatus();
  });
  unlistens.push(u1);

  // Initial sync — request state from main window
  // (main window emits on widget-sync when widget opens)
  refreshTodo();
  refreshStatus();

  // Periodic refresh
  const interval = setInterval(() => {
    refreshTodo();
    refreshStatus();
  }, 3000);
  unlistens.push(() => clearInterval(interval));
});

onUnmounted(() => {
  unlistens.forEach((fn) => fn());
});
</script>

<template>
  <div class="widget-root" @mousedown="onDragStart" @click="focusMain">
    <div class="widget-inner">
      <div class="pet-col">
        <AgentPet :state="petState" size="sm" />
      </div>
      <div class="content-col">
        <div class="widget-todo">{{ topTodo || "No pending tasks" }}</div>
        <div class="widget-status">{{ statusText }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.widget-root {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: move;
}

.widget-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: color-mix(in srgb, var(--color-sidebar-bg, #181825) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-purple) 25%, transparent);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  min-width: 200px;
  max-width: 310px;
}

.widget-inner:hover {
  border-color: color-mix(in srgb, var(--color-accent-purple) 45%, transparent);
}

.pet-col {
  flex-shrink: 0;
}

.content-col {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.widget-todo {
  font-size: 13px;
  font-weight: 600;
  color: #cdd6f4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.widget-status {
  font-size: 11px;
  color: #6c7086;
  line-height: 1.3;
  white-space: nowrap;
}
</style>
