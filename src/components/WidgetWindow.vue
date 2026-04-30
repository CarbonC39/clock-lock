<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { Maximize2, CheckSquare, MessageCircle, SendHorizonal } from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAgentStore } from "../stores/agentStore";
import AgentPet from "./AgentPet.vue";

const emit = defineEmits<{ restore: [] }>();

const workspace = useWorkspaceStore();
const agent = useAgentStore();

const tab = ref<"tasks" | "chat">("tasks");
const hover = ref(false);
const chatInput = ref("");
const chatEl = ref<HTMLDivElement>();

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
    const ln = lines[i];
    if (/^#\s+(todo|progress)/i.test(ln)) { inSection = true; continue; }
    if (/^#\s+/.test(ln)) { inSection = false; continue; }
    if (inSection) {
      const m = ln.match(/^-\s*\[([ x])\]\s+(.*)/);
      if (m) result.push({ lineIndex: i, text: m[2] || "", checked: m[1] === "x" });
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
  lines[task.lineIndex] = task.checked
    ? line.replace("[x]", "[ ]")
    : line.replace("[ ]", "[x]");
  workspace.saveHomeMd(lines.join("\n"));
}

function addTask() {
  const text = newTaskText.value.trim();
  if (!text) return;
  let content = workspace.homeMdContent;
  const lines = content.split("\n");
  let lastTaskLine = -1;
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^#\s+(todo|progress)/i.test(ln)) { inSection = true; continue; }
    if (/^#\s+/.test(ln)) { inSection = false; continue; }
    if (inSection && /^-\s*\[[ x]\]/.test(ln)) lastTaskLine = i;
  }
  if (lastTaskLine >= 0) {
    lines.splice(lastTaskLine + 1, 0, `- [ ] ${text}`);
  } else {
    content = content.trimEnd() + `\n\n# Progress\n\n- [ ] ${text}\n`;
    workspace.saveHomeMd(content);
    newTaskText.value = "";
    return;
  }
  workspace.saveHomeMd(lines.join("\n"));
  newTaskText.value = "";
}

// ── Chat ──

const petState = computed<"idle" | "thinking" | "happy" | "sleepy" | "excited">(() => {
  if (!workspace.path) return "sleepy";
  if (agent.isBusy) return "thinking";
  if (agent.state === "happy") return "happy";
  return "idle";
});

const statusText = computed(() => {
  if (!workspace.path) return "No workspace";
  if (agent.isBusy) return "Thinking…";
  if (agent.state === "happy") return "Ready";
  return "Idle";
});

const displayMessages = computed(() =>
  agent.messages.filter(
    (m) => m.role === "user" || m.role === "assistant"
  ).slice(-20)
);

function scrollChat() {
  nextTick(() => {
    if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight;
  });
}

watch(() => agent.messages.length, scrollChat);
watch(
  () => agent.messages[agent.messages.length - 1]?.content,
  scrollChat
);

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text || agent.isBusy) return;
  chatInput.value = "";
  await agent.sendMessage(text);
}

function onChatKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
}
</script>

<template>
  <div
    class="widget-root"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <!-- ── Drag-only tab bar ── -->
    <div class="widget-tabs" data-tauri-drag-region>
      <button class="tab-btn" :class="{ active: tab === 'tasks' }" @click="tab = 'tasks'">
        <CheckSquare :size="13" />
        <span>Tasks</span>
      </button>
      <button class="tab-btn" :class="{ active: tab === 'chat' }" @click="tab = 'chat'">
        <MessageCircle :size="13" />
        <span>Chat</span>
      </button>
      <div class="tab-spacer" />
      <Transition name="btn-fade">
        <button v-if="hover" class="restore-btn" title="Restore" @click="emit('restore')">
          <Maximize2 :size="14" />
        </button>
      </Transition>
    </div>

    <!-- ═══ Tasks tab ═══ -->
    <div v-if="tab === 'tasks'" class="widget-body">
      <div class="task-scroll">
        <div v-if="unchecked.length" class="task-group">
          <div class="task-row" v-for="t in unchecked" :key="t.lineIndex">
            <button class="task-cb" @click="toggleTask(t)" />
            <span class="task-label">{{ t.text || "…" }}</span>
          </div>
        </div>

        <div v-if="completed.length" class="task-group done-group">
          <div class="task-row done" v-for="t in completed" :key="'d' + t.lineIndex">
            <button class="task-cb on" @click="toggleTask(t)">
              <span class="check-mark" />
            </button>
            <span class="task-label">{{ t.text || "…" }}</span>
          </div>
        </div>

        <div v-if="!allTasks.length" class="empty-hint">No tasks yet</div>
      </div>

      <div class="add-row">
        <input
          v-model="newTaskText"
          class="add-input"
          placeholder="New task…"
          @keydown.enter="addTask()"
          @keydown.stop
        />
      </div>
    </div>

    <!-- ═══ Chat tab ═══ -->
    <div v-else class="widget-body">
      <div class="chat-header">
        <AgentPet :state="petState" size="sm" />
        <span class="status-label">{{ statusText }}</span>
      </div>

      <div ref="chatEl" class="chat-scroll">
        <div v-if="!displayMessages.length" class="empty-hint">
          Open a workspace and send a message
        </div>
        <div
          v-for="m in displayMessages"
          :key="m.id"
          class="chat-msg"
          :class="m.role"
        >
          <div class="msg-text">
            {{ m.content || (m.isStreaming ? "···" : "") }}
          </div>
          <span v-if="m.isStreaming" class="stream-cursor">▌</span>
        </div>
      </div>

      <div class="chat-input-row" :class="{ busy: agent.isBusy }">
        <input
          v-model="chatInput"
          class="chat-text-input"
          placeholder="Message…"
          :disabled="agent.isBusy"
          @keydown="onChatKeydown"
        />
        <button
          class="chat-send-btn"
          :disabled="agent.isBusy || !chatInput.trim()"
          @click="sendChat"
        >
          <SendHorizonal :size="13" />
        </button>
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
  font-size: 13px;
}

/* ── Tab bar (drag region) ── */
.widget-tabs {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 4px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  flex-shrink: 0;
  gap: 2px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
}
.tab-btn:hover { color: var(--color-text-primary); background: var(--color-surface-hover); }
.tab-btn.active { color: var(--color-accent-blue); }

.tab-spacer { flex: 1; }

.restore-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
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

.btn-fade-enter-active, .btn-fade-leave-active { transition: opacity 0.12s ease; }
.btn-fade-enter-from, .btn-fade-leave-to { opacity: 0; }

/* ── Body ── */
.widget-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Tasks ── */
.task-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.task-group { display: flex; flex-direction: column; gap: 1px; }

.done-group {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--color-border);
}

.task-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 4px;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
}
.task-row:hover { background: color-mix(in srgb, var(--color-accent-blue) 4%, transparent); }
.task-row.done .task-label { text-decoration: line-through; color: var(--color-text-muted); }

.task-cb {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  background: transparent;
  border: 1.5px solid var(--color-border);
  border-radius: 3px;
  cursor: pointer;
  padding: 0;
  transition: all var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
}
.task-cb:hover { border-color: var(--color-accent-blue); }
.task-cb.on { background: var(--color-accent-blue); border-color: var(--color-accent-blue); }
.check-mark {
  display: block;
  width: 4px; height: 8px;
  border: solid #fff;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg) translate(-1px, -1px);
}

.task-label { flex: 1; color: var(--color-text-secondary); line-height: 1.5; word-break: break-word; }

.add-row {
  padding: 6px 8px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.add-input {
  width: 100%;
  padding: 5px 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color var(--transition);
}
.add-input:focus { border-color: var(--color-accent-blue); }
.add-input::placeholder { color: var(--color-text-muted); font-size: 12px; }

/* ── Chat ── */
.chat-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--color-surface);
}

.status-label { font-size: 12px; color: var(--color-text-muted); font-style: italic; }

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-msg {
  max-width: 88%;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.chat-msg.user {
  align-self: flex-end;
  background: var(--color-accent-blue);
  color: #fff;
}

.chat-msg.assistant {
  align-self: flex-start;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.msg-text { white-space: pre-wrap; }

.stream-cursor {
  align-self: flex-start;
  color: var(--color-accent-blue);
  font-weight: 400;
  margin-left: 4px;
  animation: blink 0.9s step-end infinite;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

.chat-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  flex-shrink: 0;
}
.chat-input-row.busy { opacity: 0.6; }

.chat-text-input {
  flex: 1;
  padding: 5px 8px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color var(--transition);
}
.chat-text-input:focus { border-color: var(--color-accent-blue); }
.chat-text-input::placeholder { color: var(--color-text-muted); font-size: 12px; }

.chat-send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-accent-blue);
  cursor: pointer;
  transition: all var(--transition);
}
.chat-send-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--color-accent-blue) 8%, transparent); }
.chat-send-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Empty ── */
.empty-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 20px 0;
  font-style: italic;
}
</style>
