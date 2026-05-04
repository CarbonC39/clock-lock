<script setup lang="ts">
import { ref, computed } from "vue";
import { marked } from "marked";
import { Wrench, ChevronDown, ChevronRight, Brain, ListTodo } from "lucide-vue-next";
import type { ChatMessage } from "../stores/agentStore";
import { useAgentStore } from "../stores/agentStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSupervisionStore } from "../stores/supervisionStore";
import BashBlock from "./BashBlock.vue";
import DiffView from "./DiffView.vue";

marked.setOptions({ gfm: true, breaks: true });

const props = defineProps<{ message: ChatMessage }>();
const workspace = useWorkspaceStore();
const agent = useAgentStore();
const sv = useSupervisionStore();

function formatIdleTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h ago` : `${hours}h ${rem}m ago`;
}

function handleSnooze(id: string) {
  sv.setSnooze(3_600_000);
  agent.snoozeCheckin(id);
}

const toolExpanded = ref(false);
const thoughtExpanded = ref(false);

const taskBreakdown = computed(() => {
  if (props.message.name !== "split_task") return null;
  try { return JSON.parse(props.message.content); } catch { return null; }
});

async function acceptSubtasks() {
  if (!taskBreakdown.value || !workspace.path) return;
  try {
    const { subtasks } = taskBreakdown.value;
    for (const text of subtasks as string[]) {
      await workspace.addTodo(text);
    }
  } catch (e) {
    console.error("Failed to accept subtasks:", e);
  }
}

interface Segment {
  type: "markdown" | "bash" | "diff";
  content: string;
}

const BLOCK_RE = /```(bash|sh|shell|zsh|powershell|cmd|diff)\n([\s\S]*?)```/g;

const segments = computed((): Segment[] => {
  if (props.message.role !== "assistant") return [];
  const result: Segment[] = [];
  const text = props.message.content || "";
  let lastIndex = 0;
  const re = new RegExp(BLOCK_RE.source, BLOCK_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({ type: "markdown", content: text.slice(lastIndex, match.index) });
    }
    const lang = match[1];
    const body = match[2].trim();
    if (lang === "diff") {
      result.push({ type: "diff", content: body });
    } else {
      result.push({ type: "bash", content: body });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result.push({ type: "markdown", content: text.slice(lastIndex) });
  }

  return result.length ? result : [{ type: "markdown", content: text }];
});

const thoughts = computed(() => {
  if (!props.message.tool_calls) return [];
  return props.message.tool_calls.map(tc => {
    try {
      const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
      return {
        tool: tc.function.name,
        text: args.thought_process
      };
    } catch {
      return null;
    }
  }).filter(t => t && t.text);
});

function renderMd(src: string): string {
  return marked.parse(src) as string;
}
</script>

<template>
  <!-- Check-in card -->
  <div v-if="message.role === 'checkin'" class="msg-checkin">
    <div class="checkin-card">
      <div class="checkin-header">
        <span class="checkin-kaomoji">( ˘ω˘) zzz</span>
        <span class="checkin-label">Clock Lock</span>
        <span class="checkin-badge">{{ formatIdleTime(message.checkinMeta!.idleMinutes) }}</span>
      </div>
      <div class="checkin-body">
        <p class="checkin-text">{{ message.content }}</p>
        <div v-if="message.checkinMeta!.topTodo" class="checkin-todo-pill">
          <span class="pill-label">still on your list</span>
          <span class="pill-text">{{ message.checkinMeta!.topTodo }}</span>
        </div>
      </div>
      <div class="checkin-footer">
        <template v-if="!message.checkinMeta!.snoozed">
          <button class="checkin-btn btn-primary" @click="agent.sendMessage(`I'm back!`)">I'm here</button>
          <button class="checkin-btn btn-secondary" @click="agent.sendMessage('/remind')">Remind me</button>
          <button class="checkin-btn btn-ghost" @click="handleSnooze(message.id)">Snooze 1h</button>
        </template>
        <span v-else class="checkin-snoozed">Snoozed · see you in an hour</span>
      </div>
    </div>
  </div>

  <!-- System note -->
  <div v-else-if="message.role === 'system-note'" class="msg-note">
    {{ message.content }}
  </div>

  <!-- Tool call result -->
  <div v-else-if="message.role === 'tool'" class="msg-tool">
    <!-- Specialized: split_task card -->
    <div v-if="message.name === 'split_task'" class="task-breakdown-card">
      <div class="card-header">
        <ListTodo :size="14" />
        <span>Task Breakdown</span>
      </div>
      <div class="card-body">
        <p class="original-task">{{ taskBreakdown?.original_task }}</p>
        <ul class="subtask-list">
          <li v-for="(st, i) in taskBreakdown?.subtasks" :key="i">
            <div class="bullet" />
            <span>{{ st }}</span>
          </li>
        </ul>
        <button class="accept-btn" @click="acceptSubtasks()">
          Accept & Add to Todos
        </button>
      </div>
    </div>

    <!-- Generic Tool -->
    <template v-else>
      <button class="tool-toggle" @click="toolExpanded = !toolExpanded">
        <Wrench :size="11" />
        <span>{{ message.name }}</span>
        <component :is="toolExpanded ? ChevronDown : ChevronRight" :size="10" />
      </button>
      <pre v-if="toolExpanded" class="tool-result">{{ message.content }}</pre>
    </template>
  </div>

  <!-- User message -->
  <div v-else-if="message.role === 'user'" class="msg-user">
    <div class="bubble-user">{{ message.content }}</div>
  </div>

  <!-- Assistant message -->
  <div v-else class="msg-assistant">
    <div class="assistant-body">
      <!-- Thought Monologue -->
      <div v-if="thoughts.length > 0" class="thought-monologue" :class="{ expanded: thoughtExpanded }">
        <button class="thought-header" @click="thoughtExpanded = !thoughtExpanded">
          <Brain :size="11" />
          <span>Internal Monologue</span>
          <component :is="thoughtExpanded ? ChevronDown : ChevronRight" :size="10" />
        </button>
        <div v-if="thoughtExpanded" class="thought-list">
          <div v-for="(t, i) in thoughts" :key="i" class="thought-item">
            <span class="thought-tool">@{{ t!.tool }}:</span>
            <p>{{ t!.text }}</p>
          </div>
        </div>
      </div>

      <!-- Streaming / empty placeholder -->
      <div v-if="!message.content && message.isStreaming && !message.tool_calls" class="streaming-placeholder">
        <span class="thinking-dot" /><span class="thinking-dot" /><span class="thinking-dot" />
      </div>

      <!-- Rendered content -->
      <template v-else>
        <template v-for="(seg, i) in segments" :key="i">
          <BashBlock v-if="seg.type === 'bash'" :command="seg.content" />
          <DiffView v-else-if="seg.type === 'diff'" :diff-text="seg.content" />
          <div
            v-else-if="seg.content"
            class="md-segment markdown-body"
            v-html="renderMd(seg.content)"
          />
        </template>

        <!-- Streaming cursor -->
        <span v-if="message.isStreaming" class="stream-cursor">▌</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* ── System note ── */
.msg-note {
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 4px 16px;
  font-style: italic;
}

/* ── Tool call ── */
.msg-tool {
  padding: 2px 0;
}

.task-breakdown-card {
  margin: 8px 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  max-width: 320px;
}

.card-header {
  padding: 8px 12px;
  background: color-mix(in srgb, var(--color-accent-teal) 10%, transparent);
  color: var(--color-accent-teal);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--color-border);
}

.card-body {
  padding: 12px;
}

.original-task {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 10px;
}

.subtask-list {
  list-style: none;
  padding: 0;
  margin: 0 0 12px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.subtask-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.bullet {
  width: 5px;
  height: 5px;
  background: var(--color-accent-teal);
  border-radius: 50%;
  flex-shrink: 0;
}

.accept-btn {
  width: 100%;
  padding: 8px;
  background: var(--color-accent-teal);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity var(--transition);
}
.accept-btn:hover { opacity: 0.9; }

.tool-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 11.5px;
  font-weight: 600;
  background: color-mix(in srgb, var(--color-accent-purple) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-purple) 22%, transparent);
  border-radius: var(--radius-sm);
  color: var(--color-accent-purple);
  cursor: pointer;
  transition: all var(--transition);
  width: 100%;
  text-align: left;
}
.tool-toggle:hover {
  background: color-mix(in srgb, var(--color-accent-purple) 16%, transparent);
}

.tool-result {
  margin: 4px 0 4px 8px;
  padding: 6px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.55;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border-left: 2px solid var(--color-accent-purple);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 260px;
  overflow-y: auto;
}

/* ── User bubble ── */
.msg-user {
  display: flex;
  justify-content: flex-end;
}

.bubble-user {
  max-width: 75%;
  padding: 9px 14px;
  background: color-mix(in srgb, var(--color-accent-blue) 18%, transparent);
  color: var(--color-text-primary);
  border-radius: 16px 16px 4px 16px;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Assistant ── */
.msg-assistant {
  display: flex;
  gap: 8px;
}

.assistant-body {
  flex: 1;
  min-width: 0;
}

/* Thought monologue */
.thought-monologue {
  margin-bottom: 8px;
  border: 1px solid color-mix(in srgb, var(--color-accent-purple) 20%, var(--color-border));
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.thought-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-accent-purple);
  background: color-mix(in srgb, var(--color-accent-purple) 6%, transparent);
  border: none;
  cursor: pointer;
  transition: background-color var(--transition);
  width: 100%;
  text-align: left;
}

.thought-header:hover { background: color-mix(in srgb, var(--color-accent-purple) 12%, transparent); }

.thought-list {
  padding: 6px 10px 8px;
  background: color-mix(in srgb, var(--color-accent-purple) 4%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--color-accent-purple) 14%, var(--color-border));
}

.thought-item {
  margin-bottom: 4px;
}
.thought-item:last-child { margin-bottom: 0; }

.thought-tool {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-accent-teal);
  font-weight: 700;
  margin-right: 4px;
}

.thought-item p {
  display: inline;
  font-size: 11px;
  font-style: italic;
  color: var(--color-text-muted);
}

.md-segment {
  font-size: 13px;
  line-height: 1.65;
}

/* Streaming indicators */
.streaming-placeholder {
  display: flex;
  gap: 4px;
  padding: 6px 2px;
  align-items: center;
}

.thinking-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent-blue);
  animation: bounce 1.2s ease-in-out infinite;
}

.thinking-dot:nth-child(2) { animation-delay: 0.15s; }
.thinking-dot:nth-child(3) { animation-delay: 0.30s; }

@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-5px); opacity: 1; }
}

.stream-cursor {
  color: var(--color-accent-blue);
  animation: blink 1.2s ease-in-out infinite;
  font-weight: 400;
}

@keyframes blink {
  0%, 100% { opacity: 0.25; }
  50%       { opacity: 1; }
}

/* ── Check-in card ── */
@keyframes checkin-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}

.msg-checkin { display: flex; justify-content: flex-start; }

.checkin-card {
  background: color-mix(in srgb, var(--color-accent-purple) 8%, var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-accent-purple) 28%, var(--color-border));
  border-radius: 12px;
  overflow: hidden;
  max-width: 340px;
  box-shadow: var(--shadow-sm);
  animation: checkin-in 0.3s ease;
}

.checkin-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--color-accent-purple) 14%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-accent-purple) 20%, var(--color-border));
}

.checkin-kaomoji {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-accent-purple);
  flex-shrink: 0;
}

.checkin-label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-accent-purple);
  flex: 1;
}

.checkin-badge {
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  background: color-mix(in srgb, var(--color-accent-purple) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-purple) 28%, transparent);
  border-radius: 99px;
  color: var(--color-accent-purple);
  white-space: nowrap;
}

.checkin-body {
  padding: 10px 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkin-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  margin: 0;
}

.checkin-todo-pill {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 5px 9px;
  background: color-mix(in srgb, var(--color-accent-purple) 6%, var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-accent-purple) 16%, var(--color-border));
  border-radius: 6px;
}

.pill-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.pill-text {
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.checkin-footer {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid color-mix(in srgb, var(--color-accent-purple) 12%, var(--color-border));
  background: color-mix(in srgb, var(--color-accent-purple) 4%, transparent);
}

.checkin-btn {
  flex: 1;
  padding: 5px 8px;
  font-size: 11.5px;
  font-weight: 700;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: opacity var(--transition), background var(--transition);
  white-space: nowrap;
}
.checkin-btn:hover { opacity: 0.85; }

.btn-primary   { background: var(--color-accent-purple); color: #fff; }
.btn-secondary {
  background: color-mix(in srgb, var(--color-accent-purple) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-purple) 30%, transparent);
  color: var(--color-accent-purple);
}
.btn-ghost {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
}
.btn-ghost:hover { background: var(--color-surface-hover); }

.checkin-snoozed {
  font-size: 11px;
  color: var(--color-text-faint);
  font-style: italic;
  padding: 4px 2px;
}
</style>

<style>
/* Markdown inside chat — narrower margins than the editor */
.msg-assistant .markdown-body { line-height: 1.65; }

.msg-assistant .markdown-body h1 { font-size: 1.3em; font-weight: 700; color: var(--color-accent-blue); margin: 0.5em 0 0.4em; border-bottom: 1px solid var(--color-border); padding-bottom: 0.2em; }
.msg-assistant .markdown-body h2 { font-size: 1.1em; font-weight: 700; color: var(--color-accent-blue); margin: 0.8em 0 0.3em; padding-left: 8px; border-left: 2px solid var(--color-accent-blue); }
.msg-assistant .markdown-body h3 { font-size: 1em; font-weight: 700; color: var(--color-accent-pink); margin: 0.7em 0 0.25em; }

.msg-assistant .markdown-body p { color: var(--color-text-secondary); margin: 0 0 0.6em; }
.msg-assistant .markdown-body p:last-child { margin-bottom: 0; }

.msg-assistant .markdown-body ul,
.msg-assistant .markdown-body ol { color: var(--color-text-secondary); padding-left: 1.4em; margin-bottom: 0.6em; }
.msg-assistant .markdown-body li { margin-bottom: 0.2em; }

.msg-assistant .markdown-body code {
  font-family: var(--font-mono);
  font-size: 0.84em;
  background: color-mix(in srgb, var(--color-accent-pink) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-pink) 22%, transparent);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  color: var(--color-accent-pink);
}

.msg-assistant .markdown-body pre {
  background: var(--editor-bg, var(--color-surface));
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-accent-purple);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  overflow-x: auto;
  margin-bottom: 0.75em;
}

.msg-assistant .markdown-body pre code {
  background: none; border: none; padding: 0;
  font-size: 0.85em; color: var(--color-text-primary);
}

.msg-assistant .markdown-body blockquote {
  border-left: 2px solid var(--color-accent-purple);
  margin: 0.3em 0 0.6em;
  padding: 0.4em 0.8em;
  background: color-mix(in srgb, var(--color-accent-purple) 5%, transparent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--color-text-muted);
  font-style: italic;
}

.msg-assistant .markdown-body strong { color: var(--color-accent-blue); font-weight: 700; }
.msg-assistant .markdown-body em { color: var(--color-accent-teal); font-style: italic; }

.msg-assistant .markdown-body a { color: var(--color-accent-blue); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--color-accent-blue) 35%, transparent); }

.msg-assistant .markdown-body table { width: 100%; border-collapse: collapse; margin-bottom: 0.75em; font-size: 12px; }
.msg-assistant .markdown-body th { background: color-mix(in srgb, var(--color-accent-blue) 10%, transparent); color: var(--color-accent-blue); font-weight: 700; padding: 5px 10px; border: 1px solid var(--color-border); text-align: left; }
.msg-assistant .markdown-body td { border: 1px solid var(--color-border); padding: 4px 10px; color: var(--color-text-secondary); }
</style>
