<script setup lang="ts">
import { reactive, watch, nextTick, ref } from "vue";
import { marked } from "marked";
import { Pencil, Plus, X } from "lucide-vue-next";

marked.setOptions({ gfm: true, breaks: true });

const props = defineProps<{ content: string }>();
const emit = defineEmits<{ "update:content": [string] }>();

// Stable incrementing id — avoids remount when a section is renamed.
let _uid = 0;

interface Section {
  id: number;
  heading: string;
  body: string;
  editing: boolean;
  editBackup: string;
}
interface Task { text: string; checked: boolean }

const sections = reactive<Section[]>([]);
let currentContent = "";

// ── Parse / Serialize ────────────────────────────────────────

function parseSections(md: string): Section[] {
  const result: Section[] = [];
  const lines = md.split("\n");
  let cur: Section | null = null;
  for (const line of lines) {
    const m = line.match(/^# (.+)/);
    if (m) {
      if (cur) { cur.body = cur.body.trim(); result.push(cur); }
      cur = { id: _uid++, heading: m[1], body: "", editing: false, editBackup: "" };
    } else if (cur) {
      cur.body += line + "\n";
    }
  }
  if (cur) { cur.body = cur.body.trim(); result.push(cur); }
  return result;
}

function serializeSections(secs: Section[]): string {
  return secs.map(s => `# ${s.heading}\n\n${s.body.trimEnd()}`).join("\n\n") + "\n";
}

watch(
  () => props.content,
  (val) => {
    if (val !== currentContent) {
      const parsed = parseSections(val || "");
      sections.splice(0, sections.length, ...parsed);
      currentContent = val;
    }
  },
  { immediate: true }
);

function emitContent() {
  const md = serializeSections(sections);
  currentContent = md;
  emit("update:content", md);
}

// ── Task helpers ──────────────────────────────────────────────

function getTasks(body: string): Task[] {
  return body.split("\n")
    .filter(l => /^- \[[ x]\]/.test(l))
    .map(l => ({ text: l.replace(/^- \[[ x]\] /, ""), checked: l.startsWith("- [x]") }));
}

function getNonTaskMd(body: string): string {
  return body.split("\n").filter(l => !/^- \[[ x]\]/.test(l)).join("\n");
}

function renderMd(src: string): string {
  return src.trim() ? marked.parse(src) as string : "";
}

function toggleTask(body: string, idx: number): string {
  const lines = body.split("\n");
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^- \[[ x]\]/.test(lines[i])) {
      if (n === idx) {
        lines[i] = lines[i].startsWith("- [x]")
          ? lines[i].replace(/^- \[x\]/, "- [ ]")
          : lines[i].replace(/^- \[ \]/, "- [x]");
        break;
      }
      n++;
    }
  }
  return lines.join("\n");
}

function addTask(body: string): string {
  return body.trimEnd() + "\n- [ ] ";
}

function removeTask(body: string, idx: number): string {
  const lines = body.split("\n");
  let n = 0;
  return lines.filter(l => {
    if (/^- \[[ x]\]/.test(l)) { return n++ !== idx; }
    return true;
  }).join("\n");
}

function updateTaskText(body: string, idx: number, text: string): string {
  const lines = body.split("\n");
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^- \[[ x]\]/.test(lines[i])) {
      if (n === idx) {
        const checked = lines[i].startsWith("- [x]");
        lines[i] = `${checked ? "- [x]" : "- [ ]"} ${text}`;
        break;
      }
      n++;
    }
  }
  return lines.join("\n");
}

// ── Task interactions ─────────────────────────────────────────

function onToggleTask(si: number, ti: number) {
  sections[si].body = toggleTask(sections[si].body, ti);
  emitContent();
}

function onAddTask(si: number) {
  const tasks = getTasks(sections[si].body);
  if (tasks.length > 0 && !tasks[tasks.length - 1].text.trim()) return;
  sections[si].body = addTask(sections[si].body);
  emitContent();
}

function onRemoveTask(si: number, ti: number) {
  sections[si].body = removeTask(sections[si].body, ti);
  emitContent();
}

// ── Inline task editing ──────────────────────────────────────

const editingTask = ref<{ si: number; ti: number; text: string } | null>(null);

function startEditTask(si: number, ti: number) {
  const tasks = getTasks(sections[si].body);
  if (ti >= tasks.length) return;
  editingTask.value = { si, ti, text: tasks[ti].text };
  nextTick(() => {
    const el = document.querySelector<HTMLInputElement>(".task-edit-input");
    el?.focus(); el?.select();
  });
}

function commitEditTask() {
  if (!editingTask.value) return;
  const { si, ti, text } = editingTask.value;
  editingTask.value = null;
  if (text !== getTasks(sections[si].body)[ti]?.text) {
    sections[si].body = updateTaskText(sections[si].body, ti, text);
    emitContent();
  }
}

// ── Section body edit ────────────────────────────────────────

function startEdit(si: number) {
  sections[si].editBackup = sections[si].body;
  sections[si].editing = true;
  nextTick(() => {
    document.querySelector<HTMLTextAreaElement>(`.section-textarea[data-si="${si}"]`)?.focus();
  });
}

function commitEdit(si: number) {
  sections[si].editing = false;
  if (sections[si].body !== sections[si].editBackup) emitContent();
}

function cancelEdit(si: number) {
  sections[si].body = sections[si].editBackup;
  sections[si].editing = false;
}

// ── Heading rename ────────────────────────────────────────────
//
// Guards against the double-fire that happens when Enter or Esc
// removes the focused input from the DOM, which triggers blur.
// Pattern: always null-check renamingIdx first.

const renamingIdx = ref<number | null>(null);
const renameValue = ref("");

function startRename(si: number) {
  renamingIdx.value = si;
  renameValue.value = sections[si].heading;
  nextTick(() => {
    const el = document.querySelector<HTMLInputElement>(".heading-rename-input");
    el?.focus(); el?.select();
  });
}

function commitRename() {
  if (renamingIdx.value === null) return; // guard: Esc already cleared this
  const si = renamingIdx.value;
  renamingIdx.value = null;
  const name = renameValue.value.trim();
  if (name && name !== sections[si].heading) {
    sections[si].heading = name;
    emitContent();
  }
}

function cancelRename() {
  renamingIdx.value = null;
  // Vue removes the input → blur fires → commitRename → early-returns above. ✓
}

</script>

<template>
  <div class="editor-wrap">
    <div class="editor-scroll">

      <section
        v-for="(section, si) in sections"
        :key="section.id"
        class="md-section"
      >
        <!-- ── Section heading ── -->
        <div class="section-head">

          <!-- Rename mode: inline input replaces h1 -->
          <input
            v-if="renamingIdx === si"
            v-model="renameValue"
            class="heading-rename-input"
            @blur="commitRename"
            @keydown.enter.prevent="commitRename"
            @keydown.escape="cancelRename"
          />

          <!-- Normal heading -->
          <h1
            v-else
            class="section-heading"
            title="Double-click to rename"
            @dblclick="startRename(si)"
          >{{ section.heading }}</h1>

          <!-- Buttons hidden until hover; hidden entirely while body-editing or renaming -->
          <template v-if="!section.editing && renamingIdx !== si">
            <button class="rename-btn" @click="startRename(si)">rename</button>
            <button class="edit-btn" title="Edit content" @click="startEdit(si)">
              <Pencil :size="11" />
            </button>
          </template>
        </div>

        <!-- ── Read mode ── -->
        <template v-if="!section.editing">

          <!-- Markdown prose (non-task lines) -->
          <div
            v-if="getNonTaskMd(section.body).trim()"
            class="md-rendered"
            v-html="renderMd(getNonTaskMd(section.body))"
          />

          <!-- Tasks -->
          <div class="task-block">
            <div
              v-for="(task, ti) in getTasks(section.body)"
              :key="ti"
              class="task-row"
              :class="{ done: task.checked }"
            >
              <button
                class="task-check"
                :class="{ on: task.checked }"
                @click="onToggleTask(si, ti)"
              >
                <span v-if="task.checked" class="check-mark" />
              </button>

              <input
                v-if="editingTask && editingTask.si === si && editingTask.ti === ti"
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
                @dblclick="startEditTask(si, ti)"
              >{{ task.text || "…" }}</span>

              <button class="task-remove" title="Remove" @click="onRemoveTask(si, ti)">
                <X :size="10" />
              </button>
            </div>

            <!-- Add task -->
            <button class="task-add" @click="onAddTask(si)">
              <Plus :size="13" />
              <span>Add task</span>
            </button>
          </div>
        </template>

        <!-- ── Body edit mode ── -->
        <div v-else class="section-edit">
          <textarea
            v-model="section.body"
            :data-si="si"
            class="section-textarea"
            rows="6"
            @blur="commitEdit(si)"
            @keydown.ctrl.enter="commitEdit(si)"
            @keydown.escape="cancelEdit(si)"
          />
          <p class="edit-hint">Ctrl+Enter to save · Esc to cancel · blur auto-saves</p>
        </div>
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

/* ── Section heading row ── */
.section-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.section-heading {
  flex: 1;
  font-size: 1.2em;
  font-weight: 700;
  color: var(--color-accent-blue);
  margin: 0;
  letter-spacing: -0.02em;
  cursor: default;
  user-select: none;
}

/* Inline rename input — visually replaces the h1 */
.heading-rename-input {
  flex: 1;
  font-size: 1.2em;
  font-weight: 700;
  font-family: var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--color-accent-blue);
  background: transparent;
  border: none;
  border-bottom: 2px solid var(--color-accent-blue);
  padding: 0 2px 2px;
  outline: none;
  min-width: 0;
}

/* Buttons appear on hover of the section head */
.rename-btn {
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
  white-space: nowrap;
}

.edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition);
  padding: 0;
}

.section-head:hover .rename-btn,
.section-head:hover .edit-btn {
  opacity: 1;
}

.rename-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-accent-blue);
}

.edit-btn:hover {
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-accent-blue);
}

/* ── Rendered markdown ── */
.md-rendered {
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--color-text-secondary);
  margin-bottom: 10px;
}

.md-rendered :deep(p) { margin: 0 0 0.5em; }
.md-rendered :deep(p:last-child) { margin-bottom: 0; }
.md-rendered :deep(h2) { font-size: 1em; font-weight: 700; color: var(--color-text-primary); margin: 0.8em 0 0.3em; }
.md-rendered :deep(h3) { font-size: 0.95em; font-weight: 600; color: var(--color-text-secondary); margin: 0.6em 0 0.2em; }
.md-rendered :deep(ul), .md-rendered :deep(ol) { padding-left: 1.4em; margin: 0 0 0.5em; }
.md-rendered :deep(li) { margin-bottom: 0.15em; }
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
.md-rendered :deep(strong) { font-weight: 700; color: var(--color-text-primary); }
.md-rendered :deep(em) { color: var(--color-accent-teal); font-style: italic; }
.md-rendered :deep(hr) { border: none; border-top: 1px solid var(--color-border); margin: 0.8em 0; }

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

.section-textarea {
  width: 100%;
  padding: 10px 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.65;
  outline: none;
  resize: vertical;
  min-height: 80px;
  transition: border-color var(--transition);
  box-sizing: border-box;
}
.section-textarea:focus { border-color: var(--color-accent-blue); }

.edit-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin: 4px 0 0 2px;
  opacity: 0.7;
}

</style>
