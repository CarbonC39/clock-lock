<script setup lang="ts">
import { ref, computed } from "vue";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAgentStore } from "../stores/agentStore";
import AgentPet from "./AgentPet.vue";

const emit = defineEmits<{ restore: [] }>();

const workspace = useWorkspaceStore();
const agent = useAgentStore();

const mode = ref<"todo" | "status">("todo");

const topTodo = computed(() => {
  if (!workspace.homeMdContent) return "Open a workspace";
  const lines = workspace.homeMdContent.split("\n");
  let inSection = false;
  for (const line of lines) {
    if (/^#\s+(todo|progress)/i.test(line)) {
      inSection = true;
      continue;
    }
    if (/^#\s+/.test(line)) { inSection = false; continue; }
    if (inSection) {
      const m = line.match(/^-\s*\[ \]\s+(.+)/);
      if (m) return m[1].trim();
    }
  }
  return "No pending tasks";
});

const statusText = computed(() => {
  if (!workspace.path) return "Open a workspace";
  if (agent.isBusy) return "Thinking…";
  if (agent.state === "happy") return "Ready";
  return "Idle";
});

const petState = computed<"idle" | "thinking" | "happy" | "sleepy" | "excited">(() => {
  if (!workspace.path) return "sleepy";
  if (agent.isBusy) return "thinking";
  if (agent.state === "happy") return "happy";
  return "idle";
});

function cycleMode(e: MouseEvent) {
  e.stopPropagation();
  mode.value = mode.value === "todo" ? "status" : "todo";
}

function onRestore() {
  emit("restore");
}
</script>

<template>
  <div class="widget-root" @click="onRestore">
    <div class="widget-inner">
      <div class="pet-col">
        <AgentPet :state="petState" size="sm" />
      </div>
      <div class="content-col" @click.stop="cycleMode">
        <div v-if="mode === 'todo'" class="widget-todo">{{ topTodo }}</div>
        <div v-else class="widget-status">{{ statusText }}</div>
      </div>
      <div class="mode-dot" :class="mode">
        <span class="dot" /><span class="dot" />
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
  background: var(--color-bg);
  cursor: pointer;
}

.widget-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  min-width: 220px;
  max-width: 340px;
  transition: border-color var(--transition);
}

.widget-inner:hover {
  border-color: var(--color-accent-purple);
}

.pet-col {
  flex-shrink: 0;
}

.content-col {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  cursor: pointer;
  padding: 2px 0;
}

.widget-todo {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.widget-status {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-muted);
  white-space: nowrap;
  font-style: italic;
}

/* ── Mode dots ── */
.mode-dot {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex-shrink: 0;
  padding: 2px;
}

.dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-border);
  transition: background-color var(--transition);
}

.mode-dot.todo .dot:first-child { background: var(--color-accent-blue); }
.mode-dot.status .dot:last-child { background: var(--color-accent-blue); }
</style>
