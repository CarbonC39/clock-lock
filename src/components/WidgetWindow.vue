<script setup lang="ts">
import { ref, computed } from "vue";
import { Maximize2, SendHorizonal } from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAgentStore } from "../stores/agentStore";
import AgentPet from "./AgentPet.vue";

const emit = defineEmits<{ restore: [] }>();

const workspace = useWorkspaceStore();
const agent = useAgentStore();

const quickInput = ref("");

const petState = computed<"idle" | "thinking" | "happy" | "sleepy" | "excited">(() => {
  if (!workspace.path) return "sleepy";
  if (agent.state === "excited") return "excited";
  if (agent.isBusy) return "thinking";
  if (agent.state === "happy") return "happy";
  return "idle";
});

const statusLine = computed(() => {
  if (!workspace.path) return "Open a workspace";
  if (agent.isBusy) return "Thinking…";
  const map: Record<string, string> = {
    happy: "Done! ✨",
    excited: "Let's go!",
    sleepy: "Zzz…",
    idle: "Ready",
  };
  return map[agent.state] ?? "Ready";
});

const firstTodo = computed(() => {
  if (!workspace.homeMdContent) return null;
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
  return null;
});

async function sendQuick() {
  const text = quickInput.value.trim();
  if (!text || agent.isBusy) return;
  quickInput.value = "";
  await agent.sendMessage(text);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendQuick();
  }
}
</script>

<template>
  <!-- Shell: fills the whole window; dark body bg shows as the "casing" -->
  <div class="widget-shell">
    <!-- Screen: the rounded display inset inside the casing -->
    <div class="widget-screen" data-tauri-drag-region>

      <!-- Pet row: companion is the star -->
      <div class="pet-row">
        <AgentPet :state="petState" size="md" />
        <span class="status-text">{{ statusLine }}</span>
        <button class="icon-btn restore-btn" title="Restore" @click="emit('restore')">
          <Maximize2 :size="11" />
        </button>
      </div>

      <!-- Task pill -->
      <div class="task-pill" :class="{ empty: !firstTodo }">
        <span v-if="firstTodo" class="task-dot" />
        <span class="task-text">
          {{ firstTodo ?? (workspace.path ? "All done ✓" : "No workspace") }}
        </span>
      </div>

      <!-- Input row -->
      <div class="input-row">
        <input
          v-model="quickInput"
          class="quick-input"
          placeholder="Ask…"
          :disabled="agent.isBusy"
          @keydown="onKeydown"
        />
        <button
          class="icon-btn send-btn"
          :disabled="agent.isBusy || !quickInput.trim()"
          title="Send"
          @click="sendQuick"
        >
          <SendHorizonal :size="11" />
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
/*
  .widget-shell  — fills the full window; body bg (#1e1e2e) shows as the
                   dark device "casing" through the 6px padding gap.
  .widget-screen — the rounded "display" inside the casing.
*/

.widget-shell {
  width: 100%;
  height: 100%;
  display: flex;
  padding: 6px;
  box-sizing: border-box;
  user-select: none;
  background: transparent;
}

.widget-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 10px 8px;
  background: color-mix(in srgb, var(--color-surface) 96%, var(--color-accent-blue) 4%);
  border: 1.5px solid color-mix(in srgb, var(--color-accent-blue) 30%, var(--color-border));
  border-radius: 16px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 0 16px color-mix(in srgb, var(--color-accent-blue) 14%, transparent);
  overflow: hidden;
  -webkit-app-region: drag;
}

/* ── Pet row ── */
.pet-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
}

.status-text {
  flex: 1;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--color-accent-blue);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Task pill ── */
.task-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: color-mix(in srgb, var(--color-accent-blue) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-blue) 16%, transparent);
  border-radius: 10px;
  flex-shrink: 0;
  overflow: hidden;
}

.task-pill.empty {
  background: none;
  border-color: transparent;
  padding: 3px 2px;
}

.task-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-accent-blue);
  flex-shrink: 0;
  box-shadow: 0 0 5px var(--color-accent-blue);
  animation: dot-pulse 2.5s ease-in-out infinite;
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.7); }
}

.task-text {
  font-size: 11px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.task-pill.empty .task-text {
  color: var(--color-text-muted);
  font-style: italic;
}

/* ── Input row ── */
.input-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.quick-input {
  flex: 1;
  height: 25px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--color-bg) 70%, transparent);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-text-primary);
  font-size: 11px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
  -webkit-app-region: no-drag;
}
.quick-input:focus {
  border-color: var(--color-accent-blue);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent-blue) 15%, transparent);
}
.quick-input::placeholder { color: var(--color-text-muted); }
.quick-input:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── Icon buttons ── */
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  background: none;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition), opacity var(--transition);
  -webkit-app-region: no-drag;
}

.restore-btn { color: var(--color-text-muted); opacity: 0.55; }
.restore-btn:hover {
  background: color-mix(in srgb, var(--color-accent-blue) 12%, transparent);
  color: var(--color-accent-blue);
  opacity: 1;
}

.send-btn { color: var(--color-accent-blue); opacity: 0.75; }
.send-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent-blue) 14%, transparent);
  opacity: 1;
}
.send-btn:disabled { opacity: 0.2; cursor: not-allowed; }
</style>
