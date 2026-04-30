<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import {
  Maximize2,
  ListTodo,
  MessageCircle,
  SendHorizonal,
  ArrowLeft,
} from "lucide-vue-next";
import { marked } from "marked";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAgentStore } from "../stores/agentStore";
import AgentPet from "./AgentPet.vue";

marked.setOptions({ gfm: true, breaks: true });

const emit = defineEmits<{ restore: [] }>();

const workspace = useWorkspaceStore();
const agent = useAgentStore();

const view = ref<"companion" | "tasks" | "chat">("companion");
const newTaskText = ref("");
const chatInput = ref("");
const chatEl = ref<HTMLDivElement>();

// ── Pet state ──

const petState = computed<
  "idle" | "thinking" | "happy" | "sleepy" | "excited"
>(() => {
  if (!workspace.path) return "sleepy";
  if (agent.isBusy) return "thinking";
  if (agent.state === "happy") return "happy";
  return "idle";
});

const statusQuotes: Record<string, string[]> = {
  idle: ["Ready to help", "What's up?", "Standing by", "At your service"],
  thinking: ["Let me look…", "Reading docs…", "Processing…", "Hmm…"],
  happy: ["Done! ✨", "Nailed it!", "Looking good!", "Nice work!"],
  sleepy: ["Zzz… tap me?", "Taking a nap…", "So quiet…", "Wake me up?"],
  excited: ["Ooh, interesting!", "Let's go!", "Love this!", "Exciting!"],
};

const statusLine = computed(() => {
  const quotes = statusQuotes[agent.state] ?? statusQuotes.idle;
  if (!workspace.path) return "Open a workspace first";
  if (agent.isBusy) return quotes[0];
  // Pick deterministically from state + minute to avoid flicker
  const idx = (petState.value.charCodeAt(0) + Math.floor(Date.now() / 60000)) % quotes.length;
  return quotes[Math.abs(idx)];
});

// ── Task preview ──

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

const remainingCount = computed(() => {
  if (!workspace.homeMdContent) return 0;
  let count = 0;
  const lines = workspace.homeMdContent.split("\n");
  let inSection = false;
  for (const line of lines) {
    if (/^#\s+(todo|progress)/i.test(line)) { inSection = true; continue; }
    if (/^#\s+/.test(line)) { inSection = false; continue; }
    if (inSection && /^-\s*\[ \]/.test(line)) count++;
  }
  return count;
});

// ── Task list ──

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
      if (m)
        result.push({ lineIndex: i, text: m[2] || "", checked: m[1] === "x" });
    }
  }
  return result;
});

const unchecked = computed(() => allTasks.value.filter((t) => !t.checked));
const completed = computed(() => allTasks.value.filter((t) => t.checked));

async function toggleTask(task: TaskItem) {
  const lines = workspace.homeMdContent.split("\n");
  const line = lines[task.lineIndex];
  lines[task.lineIndex] = task.checked
    ? line.replace("[x]", "[ ]")
    : line.replace("[ ]", "[x]");
  await workspace.saveHomeMd(lines.join("\n"));
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

function renderMd(src: string): string {
  if (!src.trim()) return "";
  return marked.parse(src) as string;
}

const displayMessages = computed(() =>
  agent.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-20)
);

function scrollChat() {
  nextTick(() => {
    if (!chatEl.value) return;
    const el = chatEl.value;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) el.scrollTop = el.scrollHeight;
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
  <div class="widget-root" data-tauri-drag-region @dblclick.prevent>
    <!-- ═══════ Companion view ═══════ -->
    <div v-if="view === 'companion'" class="view-companion">
      <div class="companion-pet">
        <Transition name="pet-fade" mode="out-in">
          <AgentPet :key="petState" :state="petState" size="lg" />
        </Transition>
      </div>
      <p class="companion-status">{{ statusLine }}</p>

      <div v-if="firstTodo" class="companion-todo">
        <span class="todo-dot" />
        <span class="todo-text">{{ firstTodo }}</span>
        <span v-if="remainingCount > 1" class="todo-extra">
          +{{ remainingCount - 1 }} more
        </span>
      </div>
      <p v-else-if="workspace.path" class="companion-todo muted">
        Everything done 🎉
      </p>

      <div class="companion-actions">
        <button class="action-btn" title="Tasks" @click="view = 'tasks'">
          <ListTodo :size="15" />
        </button>
        <button class="action-btn" title="Chat" @click="view = 'chat'">
          <MessageCircle :size="15" />
        </button>
        <button class="action-btn" title="Restore" @click="emit('restore')">
          <Maximize2 :size="14" />
        </button>
      </div>
    </div>

    <!-- ═══════ Tasks view ═══════ -->
    <div v-else-if="view === 'tasks'" class="view-expanded">
      <div class="expanded-header">
        <AgentPet :state="petState" size="sm" />
        <span class="expanded-title">Tasks</span>
        <button class="back-btn" @click="view = 'companion'">
          <ArrowLeft :size="12" />
        </button>
      </div>

      <div class="task-scroll">
        <!-- Active tasks -->
        <div v-if="unchecked.length" class="task-group">
          <div
            v-for="t in unchecked"
            :key="t.lineIndex"
            class="task-row"
          >
            <button class="task-cb" @click="toggleTask(t)" />
            <span class="task-label">{{ t.text || "…" }}</span>
          </div>
        </div>

        <!-- Completed -->
        <template v-if="completed.length">
          <div class="task-section-label">Completed</div>
          <div class="task-group">
            <div
              v-for="t in completed"
              :key="'d' + t.lineIndex"
              class="task-row done"
            >
              <button class="task-cb on" @click="toggleTask(t)">
                <span class="check-mark" />
              </button>
              <span class="task-label">{{ t.text || "…" }}</span>
            </div>
          </div>
        </template>

        <div v-if="!allTasks.length" class="empty-hint">No tasks yet</div>
      </div>

      <div class="add-row">
        <input
          v-model="newTaskText"
          class="add-input"
          placeholder="Add a task…"
          @keydown.enter="addTask()"
          @keydown.stop
        />
      </div>
    </div>

    <!-- ═══════ Chat view ═══════ -->
    <div v-else class="view-expanded">
      <div class="expanded-header">
        <AgentPet :state="petState" size="sm" />
        <span class="expanded-title">Chat</span>
        <button class="back-btn" @click="view = 'companion'">
          <ArrowLeft :size="12" />
        </button>
      </div>

      <div ref="chatEl" class="chat-scroll">
        <div v-if="!displayMessages.length" class="empty-hint">
          Ask me anything about your project
        </div>
        <div
          v-for="m in displayMessages"
          :key="m.id"
          class="chat-msg"
          :class="m.role"
        >
          <span
            v-if="m.isStreaming"
            class="msg-text"
          >{{ m.content || "···" }}<span class="stream-cursor">▌</span></span>
          <span
            v-else
            class="msg-text md-body"
            v-html="renderMd(m.content)"
          />
        </div>
      </div>

      <div class="chat-input-row" :class="{ busy: agent.isBusy }">
        <input
          v-model="chatInput"
          class="chat-input-box"
          placeholder="Message…"
          :disabled="agent.isBusy"
          @keydown="onChatKeydown"
        />
        <button
          class="chat-send"
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
  user-select: none;
  -webkit-app-region: drag;
}

/* Interactive elements override */
.action-btn,
.back-btn,
.task-cb,
.chat-send,
.add-input,
.chat-input-box {
  -webkit-app-region: no-drag;
}

/* ═══════ Companion view ═══════ */
.view-companion {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  gap: 10px;
}

.companion-pet {
  padding: 8px;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.companion-status {
  font-size: 12px;
  color: var(--color-text-muted);
  font-style: italic;
  margin: 0;
  text-align: center;
  min-height: 18px;
}

.companion-todo {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--color-accent-blue) 6%, transparent);
  border-radius: 20px;
  max-width: 100%;
}
.companion-todo.muted { background: none; color: var(--color-text-muted); font-style: italic; }

.todo-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent-blue);
  flex-shrink: 0;
}

.todo-text {
  font-size: 12px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-extra {
  font-size: 11px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.companion-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: none;
  border: none;
  border-radius: 50%;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition);
}
.action-btn:hover {
  color: var(--color-accent-purple);
  background: color-mix(in srgb, var(--color-accent-purple) 10%, transparent);
}

/* ═══════ Expanded views (tasks / chat) ═══════ */
.view-expanded {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.expanded-header {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 8px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--color-surface) 60%, var(--color-bg));
}

.expanded-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition);
}
.back-btn:hover { background: var(--color-surface-hover); color: var(--color-text-primary); }

/* ── Tasks ── */
.task-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.task-group { display: flex; flex-direction: column; }

.task-section-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  padding: 10px 4px 4px;
  margin-top: 4px;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 4px;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
}
.task-row:hover { background: color-mix(in srgb, var(--color-accent-blue) 4%, transparent); }
.task-row.done .task-label { text-decoration: line-through; color: var(--color-text-muted); }

.task-cb {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1.5px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  transition: all var(--transition);
}
.task-cb:hover { border-color: var(--color-accent-blue); }
.task-cb.on {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
}
.check-mark {
  display: block;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg) translate(-1px, -1px);
}

.task-label { flex: 1; color: var(--color-text-secondary); line-height: 1.5; word-break: break-word; }

.add-row {
  padding: 6px 8px;
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
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.chat-msg.user {
  align-self: flex-end;
  background: color-mix(in srgb, var(--color-accent-blue) 18%, transparent);
  color: var(--color-text-primary);
}

.chat-msg.assistant {
  align-self: flex-start;
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.msg-text { white-space: pre-wrap; }

.md-body :deep(p) { margin: 0; }
.md-body :deep(p + p) { margin-top: 0.3em; }
.md-body :deep(code) {
  font-size: 0.88em;
  background: color-mix(in srgb, var(--color-accent-pink) 8%, transparent);
  padding: 0.05em 0.3em;
  border-radius: 3px;
}
.md-body :deep(pre) { font-size: 0.85em; margin: 0.2em 0; overflow-x: auto; }
.md-body :deep(pre code) { background: none; padding: 0; }
.md-body :deep(ul), .md-body :deep(ol) { padding-left: 1.2em; margin: 0.1em 0; }

.stream-cursor {
  display: inline-block;
  color: var(--color-accent-blue);
  font-weight: 400;
  margin-left: 2px;
  animation: cursor-pulse 1.2s ease-in-out infinite;
}
@keyframes cursor-pulse {
  0%,
  100% { opacity: 0.25; }
  50% { opacity: 1; }
}

.chat-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  flex-shrink: 0;
}
.chat-input-row.busy { opacity: 0.6; }

.chat-input-box {
  flex: 1;
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
.chat-input-box:focus { border-color: var(--color-accent-blue); }
.chat-input-box::placeholder { color: var(--color-text-muted); font-size: 12px; }

.chat-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-accent-blue);
  cursor: pointer;
  transition: all var(--transition);
}
.chat-send:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent-blue) 10%, transparent);
}
.chat-send:disabled { opacity: 0.3; cursor: not-allowed; }

/* ── Shared ── */
.empty-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 24px 0;
  font-style: italic;
}

/* ── Transitions ── */
.pet-fade-enter-active,
.pet-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.pet-fade-enter-from { opacity: 0; transform: translateY(4px); }
.pet-fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
