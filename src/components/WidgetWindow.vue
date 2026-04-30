<script setup lang="ts">
import { ref, computed } from "vue";
import { Maximize2 } from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAgentStore } from "../stores/agentStore";
import AgentPet from "./AgentPet.vue";

const emit = defineEmits<{ restore: [] }>();

const workspace = useWorkspaceStore();
const agent = useAgentStore();

const mode = ref<"todo" | "status">("todo");
const hover = ref(false);

const topTodo = computed(() => {
  if (!workspace.homeMdContent) return "Open a workspace";
  const lines = workspace.homeMdContent.split("\n");
  let inSection = false;
  for (const line of lines) {
    if (/^#\s+(todo|progress)/i.test(line)) { inSection = true; continue; }
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

function cycleMode() {
  mode.value = mode.value === "todo" ? "status" : "todo";
}
</script>

<template>
  <div
    class="widget-root"
    data-tauri-drag-region
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <div class="widget-body">
      <div class="widget-left" @click="cycleMode">
        <AgentPet :state="petState" size="sm" />
      </div>

      <div class="widget-center" @click="cycleMode">
        <div v-if="mode === 'todo'" class="widget-todo">{{ topTodo }}</div>
        <div v-else class="widget-status">{{ statusText }}</div>
      </div>

      <div class="widget-right">
        <Transition name="btn-fade">
          <button
            v-if="hover"
            class="restore-btn"
            title="Restore"
            @click="emit('restore')"
          >
            <Maximize2 :size="13" />
          </button>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.widget-root {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  background: var(--color-bg);
  -webkit-app-region: drag;
}

.widget-body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.widget-left {
  flex-shrink: 0;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.widget-center {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  cursor: pointer;
  -webkit-app-region: no-drag;
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

.widget-right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

.restore-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition);
}
.restore-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
  border-color: var(--color-text-muted);
}

/* ── Transitions ── */
.btn-fade-enter-active,
.btn-fade-leave-active { transition: opacity 0.12s ease; }
.btn-fade-enter-from,
.btn-fade-leave-to { opacity: 0; }
</style>
