<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { marked } from "marked";
import { Pencil, BookOpen, StickyNote } from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";
import MarkdownCodeEditor from "./MarkdownCodeEditor.vue";

marked.setOptions({ gfm: true, breaks: true });

const workspace = useWorkspaceStore();

type Tab = "overview" | "notes";
const tab = ref<Tab>("overview");

const editing = ref(false);
const draft = ref("");
const editorRef = ref<{ focus: () => void } | null>(null);

const current = computed(() =>
  tab.value === "overview"
    ? (workspace.homeData?.overview ?? "")
    : (workspace.homeData?.notes ?? "")
);

const placeholder = computed(() =>
  tab.value === "overview"
    ? "Describe your project…"
    : "Scratch pad — progress, links, observations…"
);

function renderMd(src: string): string {
  if (!src.trim()) return "";
  return marked.parse(src) as string;
}

async function startEdit() {
  draft.value = current.value;
  editing.value = true;
  await nextTick();
  editorRef.value?.focus();
}

function commit() {
  editing.value = false;
  if (draft.value === current.value) return;
  if (tab.value === "overview") workspace.saveOverview(draft.value);
  else workspace.saveNotes(draft.value);
}

function switchTab(t: Tab) {
  if (editing.value) commit();
  tab.value = t;
}

// Keep draft in sync if not editing and external changes arrive
watch(current, (v) => { if (!editing.value) draft.value = v; });
</script>

<template>
  <div class="card overview-card">
    <div class="card-head">
      <component :is="tab === 'overview' ? BookOpen : StickyNote" :size="13" class="head-icon" />
      <div class="seg">
        <button class="seg-btn" :class="{ on: tab === 'overview' }" @click="switchTab('overview')">Overview</button>
        <button class="seg-btn" :class="{ on: tab === 'notes' }" @click="switchTab('notes')">Notes</button>
      </div>
      <button v-if="!editing" class="edit-btn" title="Edit" @click="startEdit">
        <Pencil :size="12" />
      </button>
    </div>

    <div class="card-body">
      <div v-if="editing" class="edit-wrap">
        <MarkdownCodeEditor
          ref="editorRef"
          v-model="draft"
          :placeholder="placeholder"
          @blur="commit"
          @commit="commit"
        />
        <p class="edit-hint">Ctrl+Enter / Esc to save</p>
      </div>

      <div
        v-else-if="current.trim()"
        class="md-rendered"
        @dblclick="startEdit"
        v-html="renderMd(current)"
      />

      <p v-else class="empty-hint" @dblclick="startEdit">
        <template v-if="tab === 'overview'">
          No description yet. Double-click to write one, or ask the agent to <code>/scan</code>.
        </template>
        <template v-else>
          No notes yet. The agent jots observations here as you work. Double-click to add your own.
        </template>
      </p>
    </div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border-soft);
  flex-shrink: 0;
}
.head-icon { color: var(--color-accent-blue); flex-shrink: 0; }

.seg {
  display: flex;
  gap: 2px;
  flex: 1;
  background: var(--color-surface-hover);
  border-radius: var(--radius-sm);
  padding: 2px;
  width: fit-content;
  flex-grow: 0;
}
.seg-btn {
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-sans);
  padding: 2px 9px;
  border: none;
  background: none;
  color: var(--color-text-muted);
  border-radius: 3px;
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition);
}
.seg-btn:hover { color: var(--color-text-secondary); }
.seg-btn.on {
  background: var(--color-surface);
  color: var(--color-accent-blue);
  box-shadow: var(--shadow-sm);
}

.edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: auto;
  border: none;
  background: none;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition), background-color var(--transition), color var(--transition);
}
.card:hover .edit-btn { opacity: 1; }
.edit-btn:hover { background: var(--color-surface-hover); color: var(--color-accent-blue); }

.card-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px 16px;
}

.edit-wrap { display: flex; flex-direction: column; }
.edit-hint {
  font-size: 10.5px;
  color: var(--color-text-muted);
  opacity: 0.7;
  margin: 5px 0 0 2px;
}

/* ── Rendered markdown ── */
.md-rendered {
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  cursor: text;
}
.md-rendered :deep(p) { margin: 0 0 0.5em; }
.md-rendered :deep(p:last-child) { margin-bottom: 0; }
.md-rendered :deep(h1) { font-size: 1.12em; font-weight: 700; color: var(--color-accent-blue); margin: 0.7em 0 0.3em; }
.md-rendered :deep(h2) { font-size: 1.04em; font-weight: 700; color: var(--color-accent-blue); margin: 0.7em 0 0.25em; }
.md-rendered :deep(h3) { font-size: 1em; font-weight: 600; color: var(--color-accent-purple); margin: 0.55em 0 0.2em; }
.md-rendered :deep(h4) { font-size: 0.95em; font-weight: 600; color: var(--color-accent-teal); margin: 0.5em 0 0.2em; }
.md-rendered :deep(ul), .md-rendered :deep(ol) { padding-left: 1.3em; margin: 0 0 0.5em; }
.md-rendered :deep(li) { margin-bottom: 0.15em; color: var(--color-text-secondary); }
.md-rendered :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: color-mix(in srgb, var(--color-accent-pink) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-pink) 20%, transparent);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  color: var(--color-accent-pink);
}
.md-rendered :deep(pre) {
  background: var(--editor-bg, var(--color-surface));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  overflow-x: auto;
  margin: 0 0 0.5em;
}
.md-rendered :deep(pre code) { background: none; border: none; padding: 0; color: var(--color-text-primary); font-size: 0.84em; }
.md-rendered :deep(blockquote) {
  border-left: 2px solid var(--color-accent-purple);
  margin: 0.3em 0 0.5em;
  padding: 0.3em 0.8em;
  color: var(--color-text-muted);
  font-style: italic;
}
.md-rendered :deep(a) { color: var(--color-accent-blue); }
.md-rendered :deep(strong) { font-weight: 700; color: var(--color-accent-blue); }
.md-rendered :deep(em) { color: var(--color-accent-teal); font-style: italic; }
.md-rendered :deep(hr) { border: none; border-top: 1px solid var(--color-border); margin: 0.8em 0; }

.empty-hint {
  font-size: 12.5px;
  color: var(--color-text-muted);
  font-style: italic;
  cursor: text;
  margin: 0;
  line-height: 1.6;
}
.empty-hint code {
  font-family: var(--font-mono);
  font-style: normal;
  font-size: 12px;
  background: color-mix(in srgb, var(--color-text-muted) 12%, transparent);
  padding: 1px 4px;
  border-radius: 3px;
}
</style>
