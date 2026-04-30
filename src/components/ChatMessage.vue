<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import type { ChatMessage } from "../stores/agentStore";
import BashBlock from "./BashBlock.vue";
import DiffView from "./DiffView.vue";

marked.setOptions({ gfm: true, breaks: true });

const props = defineProps<{ message: ChatMessage }>();

interface Segment {
  type: "markdown" | "bash" | "diff";
  content: string;
}

const BLOCK_RE = /```(bash|sh|shell|zsh|powershell|cmd|diff)\n([\s\S]*?)```/g;

const segments = computed((): Segment[] => {
  if (props.message.role !== "assistant") return [];
  const result: Segment[] = [];
  const text = props.message.content;
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

function renderMd(src: string): string {
  return marked.parse(src) as string;
}
</script>

<template>
  <!-- System note -->
  <div v-if="message.role === 'system-note'" class="msg-note">
    {{ message.content }}
  </div>

  <!-- User message -->
  <div v-else-if="message.role === 'user'" class="msg-user">
    <div class="bubble-user">{{ message.content }}</div>
  </div>

  <!-- Assistant message -->
  <div v-else class="msg-assistant">
    <div class="assistant-body">
      <!-- Streaming / empty placeholder -->
      <div v-if="!message.content && message.isStreaming" class="streaming-placeholder">
        <span class="thinking-dot" /><span class="thinking-dot" /><span class="thinking-dot" />
      </div>

      <!-- Rendered content -->
      <template v-else>
        <template v-for="(seg, i) in segments" :key="i">
          <BashBlock v-if="seg.type === 'bash'" :command="seg.content" />
          <DiffView v-else-if="seg.type === 'diff'" :diff-text="seg.content" />
          <div
            v-else
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

/* ── User bubble ── */
.msg-user {
  display: flex;
  justify-content: flex-end;
}

.bubble-user {
  max-width: 75%;
  padding: 9px 14px;
  background: var(--color-accent-blue);
  color: #fff;
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
  animation: blink 0.9s step-end infinite;
  font-weight: 400;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
</style>

<style>
/* Markdown inside chat — narrower margins than the editor */
.msg-assistant .markdown-body { line-height: 1.65; }

.msg-assistant .markdown-body h1 { font-size: 1.3em; font-weight: 700; color: var(--color-accent-purple); margin: 0.5em 0 0.4em; border-bottom: 1px solid var(--color-accent-blue); padding-bottom: 0.2em; }
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

.msg-assistant .markdown-body strong { color: var(--color-text-primary); font-weight: 700; }
.msg-assistant .markdown-body em { color: var(--color-accent-teal); font-style: italic; }

.msg-assistant .markdown-body a { color: var(--color-accent-blue); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--color-accent-blue) 35%, transparent); }

.msg-assistant .markdown-body table { width: 100%; border-collapse: collapse; margin-bottom: 0.75em; font-size: 12px; }
.msg-assistant .markdown-body th { background: color-mix(in srgb, var(--color-accent-blue) 10%, transparent); color: var(--color-accent-blue); font-weight: 700; padding: 5px 10px; border: 1px solid var(--color-border); text-align: left; }
.msg-assistant .markdown-body td { border: 1px solid var(--color-border); padding: 4px 10px; color: var(--color-text-secondary); }
</style>
