<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAgentStore } from "../stores/agentStore";
import AgentPet from "./AgentPet.vue";

const emit = defineEmits<{ restore: [] }>();

const workspace = useWorkspaceStore();
const agent = useAgentStore();

const topTodo = ref("");
const statusText = ref("Loading…");
const petState = ref<"idle" | "thinking" | "happy" | "sleepy" | "excited">("idle");

function extractTopTodo(md: string): string {
  const lines = md.split("\n");
  let inSection = false;
  for (const line of lines) {
    if (/^#\s+(todo|progress)/i.test(line)) {
      inSection = true;
      continue;
    }
    if (/^#\s+/.test(line)) {
      inSection = false;
      continue;
    }
    if (inSection) {
      const todo = line.match(/^-\s*\[ \]\s+(.+)/);
      if (todo) return todo[1].trim();
    }
  }
  return "";
}

function refresh() {
  if (workspace.homeMdContent) {
    topTodo.value = extractTopTodo(workspace.homeMdContent) || "No pending tasks";
  }
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

watch(() => agent.state, refresh);
watch(() => agent.isBusy, refresh);
watch(() => workspace.homeMdContent, refresh);

onMounted(refresh);

// Click restores main layout
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
  background: var(--color-bg);
  cursor: pointer;
}

.widget-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  min-width: 240px;
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
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.3;
  white-space: nowrap;
}
</style>
