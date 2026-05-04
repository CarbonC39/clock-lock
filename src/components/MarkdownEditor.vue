<script setup lang="ts">
import { ref, watch } from "vue";
import { marked } from "marked";
import { Plus, X, BookOpen, CheckSquare, StickyNote } from "lucide-vue-next";
import type { HomeData } from "../stores/workspaceStore";
import MarkdownCodeEditor from "./MarkdownCodeEditor.vue";

marked.setOptions({ gfm: true, breaks: true });

const props = defineProps<{ data: HomeData }>();
const emit = defineEmits<{ "save-overview": [string]; "save-notes": [string]; "add-todo": [string]; "toggle-todo": [number, boolean]; "delete-todo": [number] }>();

// ── Overview editing ──────────────────────────────────────────

const editingOverview = ref(false);
const overviewDraft = ref("");
const overviewEditor = ref<{ focus: () => void } | null>(null);

function startEditOverview() {
  overviewDraft.value = props.data.overview;
  editingOverview.value = true;
  overviewEditor.value?.focus();
}

function commitOverview() {
  editingOverview.value = false;
  if (overviewDraft.value !== props.data.overview) {
    emit("save-overview", overviewDraft.value);
  }
}

// ── Notes editing ──────────────────────────────────────────

const editingNotes = ref(false);
const notesDraft = ref("");
const notesEditor = ref<{ focus: () => void } | null>(null);

function startEditNotes() {
  notesDraft.value = props.data.notes;
  editingNotes.value = true;
  notesEditor.value?.focus();
}

function commitNotes() {
  editingNotes.value = false;
  if (notesDraft.value !== props.data.notes) {
    emit("save-notes", notesDraft.value);
  }
}

// ── Todo editing ──────────────────────────────────────────────

const editingTask = ref<{ index: number; text: string } | null>(null);
const newTodoText = ref("");
const showAddInput = ref(false);

function startEditTask(index: number) {
  editingTask.value = { index, text: props.data.todos[index].text };
}

function commitEditTask() {
  editingTask.value = null;
}

function submitNewTodo() {
  const text = newTodoText.value.trim();
  if (!text) return;
  newTodoText.value = "";
  showAddInput.value = false;
  emit("add-todo", text);
}

function onNewTodoKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") { e.preventDefault(); submitNewTodo(); }
  if (e.key === "Escape") { showAddInput.value = false; newTodoText.value = ""; }
}

function showAdd() {
  showAddInput.value = true;
}

// ── Derived ──────────────────────────────────────────────────

function renderMd(src: string): string {
  if (!src.trim()) return "";
  return marked.parse(src) as string;
}

watch(() => props.data.overview, (v) => { if (!editingOverview.value) overviewDraft.value = v; });
watch(() => props.data.notes, (v) => { if (!editingNotes.value) notesDraft.value = v; });
</script>

<template>
  <div class="editor-wrap">
    <div class="editor-scroll">

      <!-- ── Overview ── -->
      <section class="md-section">
        <div class="section-head">
          <BookOpen :size="14" class="section-icon" />
          <h1 class="section-heading">Overview</h1>
          <button v-if="!editingOverview" class="edit-hint-btn" @click="startEditOverview">edit</button>
        </div>

        <div v-if="editingOverview" class="section-edit">
          <MarkdownCodeEditor
            ref="overviewEditor"
            v-model="overviewDraft"
            placeholder="Describe your project…"
            @blur="commitOverview"
            @commit="commitOverview"
          />
          <p class="edit-hint">Ctrl+Enter or Esc to save · blur auto-saves</p>
        </div>
        <div
          v-else-if="data.overview.trim()"
          class="md-rendered overview-rendered"
          @dblclick="startEditOverview"
          v-html="renderMd(data.overview)"
        />
        <p v-else class="placeholder-text" @dblclick="startEditOverview">
          No project description yet. Double-click to write one, or ask the agent to <code>/scan</code>.
        </p>
      </section>

      <!-- ── Todos ── -->
      <section class="md-section">
        <div class="section-head">
          <CheckSquare :size="14" class="section-icon" />
          <h1 class="section-heading">Todos</h1>
        </div>

        <div class="task-block">
          <div
            v-for="(todo, i) in data.todos"
            :key="i"
            class="task-row"
            :class="{ done: todo.done }"
          >
            <button
              class="task-check"
              :class="{ on: todo.done }"
              @click="emit('toggle-todo', i, !todo.done)"
            >
              <span v-if="todo.done" class="check-mark" />
            </button>

            <input
              v-if="editingTask && editingTask.index === i"
              v-model="editingTask.text"
              class="task-edit-input"
              @blur="commitEditTask"
              @keydown.enter="commitEditTask"
              @keydown.escape="editingTask = null"
              @click.stop
            />
            <span
              v-else
              class="task-text"
              @dblclick="startEditTask(i)"
            >{{ todo.text || "…" }}</span>

            <button class="task-remove" title="Remove" @click="emit('delete-todo', i)">
              <X :size="10" />
            </button>
          </div>

          <!-- Add new todo -->
          <div v-if="showAddInput" class="new-todo-row">
            <input
              v-model="newTodoText"
              class="new-todo-input"
              placeholder="New task…"
              @keydown="onNewTodoKeydown"
              @blur="submitNewTodo"
            />
          </div>
          <button v-else class="task-add" @click="showAdd">
            <Plus :size="13" />
            <span>Add task</span>
          </button>
        </div>

        <p v-if="!data.todos.length && !showAddInput" class="placeholder-text">
          No tasks yet. Add one above or ask the agent.
        </p>
      </section>

      <!-- ── Notes ── -->
      <section class="md-section">
        <div class="section-head">
          <StickyNote :size="14" class="section-icon" />
          <h1 class="section-heading">Notes</h1>
          <button v-if="!editingNotes" class="edit-hint-btn" @click="startEditNotes">edit</button>
        </div>

        <div v-if="editingNotes" class="section-edit">
          <MarkdownCodeEditor
            ref="notesEditor"
            v-model="notesDraft"
            placeholder="Scratch pad — progress, links, observations…"
            @blur="commitNotes"
            @commit="commitNotes"
          />
          <p class="edit-hint">Ctrl+Enter or Esc to save · blur auto-saves</p>
        </div>
        <div
          v-else-if="data.notes.trim()"
          class="md-rendered notes-rendered"
          @dblclick="startEditNotes"
          v-html="renderMd(data.notes)"
        />
        <p v-else class="placeholder-text" @dblclick="startEditNotes">
          No notes yet. The agent appends observations here as you work. Double-click to write your own.
        </p>
      </section>

    </div>
  </div>
</template>

<style scoped>
.editor-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.editor-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 32px 52px 80px;
}

/* ── Section ── */
.md-section {
  margin-bottom: 40px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.section-icon {
  color: var(--color-accent-blue);
  flex-shrink: 0;
}

.section-heading {
  flex: 1;
  font-size: 1.2em;
  font-weight: 700;
  color: var(--color-accent-blue);
  margin: 0;
  letter-spacing: -0.02em;
  user-select: none;
}

.edit-hint-btn {
  font-size: 10.5px;
  font-family: var(--font-sans);
  font-weight: 500;
  color: var(--color-text-muted);
  background: none;
  border: none;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition), background-color var(--transition), color var(--transition);
  flex-shrink: 0;
}
.section-head:hover .edit-hint-btn { opacity: 1; }
.edit-hint-btn:hover { background: var(--color-surface-hover); color: var(--color-accent-blue); }

/* ── Rendered markdown ── */
.md-rendered {
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--color-text-secondary);
  cursor: text;
  border-radius: var(--radius-sm);
  padding: 2px 4px;
  margin: -2px -4px;
}

.md-rendered :deep(p) { margin: 0 0 0.5em; }
.md-rendered :deep(p:last-child) { margin-bottom: 0; }
.md-rendered :deep(h1) { font-size: 1.15em; font-weight: 700; color: var(--color-accent-blue); margin: 0.8em 0 0.35em; }
.md-rendered :deep(h2) { font-size: 1.05em; font-weight: 700; color: var(--color-accent-blue); margin: 0.8em 0 0.3em; }
.md-rendered :deep(h3) { font-size: 1em; font-weight: 600; color: var(--color-accent-purple); margin: 0.6em 0 0.25em; }
.md-rendered :deep(h4) { font-size: 0.95em; font-weight: 600; color: var(--color-accent-teal); margin: 0.5em 0 0.2em; }
.md-rendered :deep(ul), .md-rendered :deep(ol) { padding-left: 1.4em; margin: 0 0 0.5em; }
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
  padding: 10px 14px;
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

/* ── Placeholder ── */
.placeholder-text {
  font-size: 13px;
  color: var(--color-text-muted);
  font-style: italic;
  cursor: text;
  margin: 0;
  padding: 2px 4px;
  line-height: 1.6;
}
.placeholder-text code {
  font-family: var(--font-mono);
  font-size: 12px;
  background: color-mix(in srgb, var(--color-text-muted) 10%, transparent);
  padding: 1px 4px;
  border-radius: 3px;
}

/* ── Task block ── */
.task-block {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 4px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  transition: background-color var(--transition);
}
.task-row:hover { background: color-mix(in srgb, var(--color-accent-blue) 5%, transparent); }
.task-row:hover .task-remove { opacity: 1; }
.task-row.done .task-text { text-decoration: line-through; color: var(--color-text-muted); opacity: 0.7; }

.task-check {
  width: 15px;
  height: 15px;
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
}
.task-row:hover .task-check { border-color: var(--color-text-muted); }
.task-check:hover { border-color: var(--color-accent-blue); }
.task-check.on { background: var(--color-accent-blue); border-color: var(--color-accent-blue); }

.check-mark {
  display: block;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) translate(-1px, -1px);
}

.task-text {
  flex: 1;
  color: var(--color-text-secondary);
  line-height: 1.5;
  word-break: break-word;
  cursor: default;
}

.task-edit-input {
  flex: 1;
  padding: 2px 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-accent-blue);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: var(--font-sans);
  line-height: 1.5;
  outline: none;
  min-width: 0;
}

.task-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  background: none;
  border: none;
  border-radius: 3px;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  padding: 0;
  transition: all var(--transition);
}
.task-remove:hover { background: color-mix(in srgb, var(--color-accent-red) 10%, transparent); color: var(--color-accent-red); }

.new-todo-row { padding: 2px 4px; }
.new-todo-input {
  width: 100%;
  padding: 4px 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-accent-blue);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  box-sizing: border-box;
}

.task-add {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  padding: 3px 4px;
  font-size: 11.5px;
  font-family: var(--font-sans);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition), color var(--transition);
}
.task-block:hover .task-add { opacity: 0.55; }
.task-add:hover { opacity: 1 !important; color: var(--color-accent-blue); }

/* ── Body edit mode ── */
.section-edit { margin-top: 4px; }

.edit-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin: 4px 0 0 2px;
  opacity: 0.7;
}
</style>
