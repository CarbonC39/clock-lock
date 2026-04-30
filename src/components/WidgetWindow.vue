<script setup lang="ts">
import { ref, computed } from "vue";
import { Maximize2, CheckSquare, MessageCircle } from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAgentStore } from "../stores/agentStore";
import AgentPet from "./AgentPet.vue";

const emit = defineEmits<{ restore: [] }>();

const workspace = useWorkspaceStore();
const agent = useAgentStore();

const tab = ref<"tasks" | "chat">("tasks");
const hover = ref(false);

// ── Tasks ──

interface TaskItem {
  lineIndex: number;
  text: string;
  checked: boolean;
}

const allTasks = computed<TaskItem[]>(() => {
  if (!workspace.homeMdContent) return [];
  const lines = workspace.homeMdContent.split("\n");
  const result: TaskItem[] = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#\s+(todo|progress)/i.test(line)) { inSection = true; continue; }
    if (/^#\s+/.test(line)) { inSection = false; continue; }
    if (inSection) {
      const m = line.match(/^-\s*\[([ x])\]\s+(.*)/);
      if (m) {
        result.push({
          lineIndex: i,
          text: m[2] || "",
          checked: m[1] === "x",
        });
      }
    }
  }
  return result;
});

const unchecked = computed(() => allTasks.value.filter((t) => !t.checked));
const completed = computed(() => allTasks.value.filter((t) => t.checked));
const newTaskText = ref("");

function toggleTask(task: TaskItem) {
  const lines = workspace.homeMdContent.split("\n");
  const line = lines[task.lineIndex];
  if (task.checked) {
    lines[task.lineIndex] = line.replace("[x]", "[ ]");
  } else {
    lines[task.lineIndex] = line.replace("[ ]", "[x]");
  }
  workspace.saveHomeMd(lines.join("\n"));
}

function addTask() {
  const text = newTaskText.value.trim();
  if (!text) return;
  let content = workspace.homeMdContent;

  // Find the last task section and append
  const lines = content.split("\n");
  let lastTaskLine = -1;
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^#\s+(todo|progress)/i.test(ln)) { inSection = true; continue; }
    if (/^#\s+/.test(ln)) { inSection = false; continue; }
    if (inSection && /^-\s*\[[ x]\]/.test(ln)) {
      lastTaskLine = i;
    }
  }

  if (lastTaskLine >= 0) {
    lines.splice(lastTaskLine + 1, 0, `- [ ] ${text}`);
    content = lines.join("\n");
  } else {
    // No task section yet — append to bottom
    content = content.trimEnd() + `\n\n# Progress\n\n- [ ] ${text}\n`;
  }

  workspace.saveHomeMd(content);
  newTaskText.value = "";
}

// ── Chat ──

const recentMessages = computed(() => {
  return agent.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => !m.error && !m.isStreaming && m.content.trim())
    .slice(-8);
});

const statusText = computed(() => {
  if (!workspace.path) return "No workspace";
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
</script>

<template>
  <div
    class="widget-root"
    data-tauri-drag-region
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <!-- Tab bar -->
    <div class="widget-tabs">
      <button class="tab-btn" :class="{ active: tab === 'tasks' }" @click="tab = 'tasks'">
        <CheckSquare :size="12" />
        <span>Tasks</span>
      </button>
      <button class="tab-btn" :class="{ active: tab === 'chat' }" @click="tab = 'chat'">
        <MessageCircle :size="12" />
        <span>Chat</span>
      </button>
      <div class="tab-spacer" />
      <Transition name="btn-fade">
        <button v-if="hover" class="restore-btn" title="Restore" @click="emit('restore')">
          <Maximize2 :size="13" />
        </button>
      </Transition>
    </div>

    <!-- ── Tasks tab ── -->
    <div v-if="tab === 'tasks'" class="widget-body scrollable">
      <!-- Unchecked -->
      <div v-if="unchecked.length" class="task-group">
        <div class="task-item" v-for="t in unchecked" :key="t.lineIndex">
          <button class="task-cb" @click="toggleTask(t)">
            <span v-if="false" /> <!-- never checked here -->
          </button>
          <span class="task-label">{{ t.text || "…" }}</span>
        </div>
      </div>

      <!-- Completed -->
      <div v-if="completed.length" class="task-group done-group">
        <div class="task-item done" v-for="t in completed" :key="'d' + t.lineIndex">
          <button class="task-cb on" @click="toggleTask(t)">
            <span class="check-mark" />
          </button>
          <span class="task-label">{{ t.text || "…" }}</span>
        </div>
      </div>

      <!-- Empty -->
      <div v-if="!allTasks.length" class="empty-hint">No tasks yet</div>

      <!-- Add task -->
      <div class="add-row">
        <input
          v-model="newTaskText"
          class="add-input"
          placeholder="+ New task"
          @keydown.enter="addTask()"
          @keydown.stop
        />
      </div>
    </div>

    <!-- ── Chat tab ── -->
    <div v-else class="widget-body scrollable chat-tab">
      <div class="chat-status">
        <AgentPet :state="petState" size="sm" />
        <span class="status-label">{{ statusText }}</span>
      </div>

      <div v-if="!recentMessages.length" class="empty-hint">No messages yet</div>

      <div v-for="m in recentMessages" :key="m.id" class="chat-line" :class="m.role">
        <span class="chat-role">{{ m.role === "user" ? "You" : "Agent" }}</span>
        <span class="chat-text">{{ m.content.slice(0, 150) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.widget-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

/* ── Tabs ── */
.widget-tabs {
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 4px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  flex-shrink: 0;
  gap: 2px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
  -webkit-app-region: no-drag;
}
.tab-btn:hover { color: var(--color-text-primary); background: var(--color-surface-hover); }
.tab-btn.active { color: var(--color-accent-blue); }

.tab-spacer { flex: 1; }

.restore-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition);
  -webkit-app-region: no-drag;
}
.restore-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
  border-color: var(--color-text-muted);
}

.btn-fade-enter-active,
.btn-fade-leave-active { transition: opacity 0.12s ease; }
.btn-fade-enter-from,
.btn-fade-leave-to { opacity: 0; }

/* ── Body ── */
.widget-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.scrollable {
  overflow-y: auto;
  padding: 8px;
}

/* ── Tasks ── */
.task-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.done-group {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--color-border);
}

.task-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
  font-size: 12px;
}
.task-item:hover { background: color-mix(in srgb, var(--color-accent-blue) 4%, transparent); }
.task-item.done .task-label {
  text-decoration: line-through;
  color: var(--color-text-muted);
}

.task-cb {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1.5px solid var(--color-border);
  border-radius: 3px;
  cursor: pointer;
  padding: 0;
  transition: all var(--transition);
  -webkit-app-region: no-drag;
}
.task-cb:hover { border-color: var(--color-accent-blue); }
.task-cb.on {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
}
.check-mark {
  display: block;
  width: 4px;
  height: 7px;
  border: solid #fff;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg) translate(-1px, -1px);
}

.task-label {
  flex: 1;
  color: var(--color-text-secondary);
  line-height: 1.45;
  word-break: break-word;
}

/* Add task */
.add-row {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--color-border);
}

.add-input {
  width: 100%;
  padding: 4px 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: 12px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color var(--transition);
  -webkit-app-region: no-drag;
}
.add-input:focus { border-color: var(--color-accent-blue); }
.add-input::placeholder { color: var(--color-text-muted); font-size: 11px; }

/* ── Chat ── */
.chat-tab { gap: 6px; }

.chat-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  margin-bottom: 4px;
}

.status-label {
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
}

.chat-line {
  font-size: 11px;
  line-height: 1.5;
  display: flex;
  gap: 6px;
}

.chat-role {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--color-text-muted);
  opacity: 0.7;
  min-width: 32px;
}

.chat-line.user .chat-role { color: var(--color-accent-blue); }
.chat-line.assistant .chat-role { color: var(--color-accent-purple); }

.chat-text {
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Empty ── */
.empty-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 16px 0;
  font-style: italic;
}
</style>
