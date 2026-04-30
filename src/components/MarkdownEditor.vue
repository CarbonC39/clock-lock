<script setup lang="ts">
import { reactive, watch, nextTick } from "vue";
import { marked } from "marked";
import { Pencil, Plus, X } from "lucide-vue-next";

marked.setOptions({ gfm: true, breaks: true });

const props = defineProps<{
  content: string;
}>();

const emit = defineEmits<{ "update:content": [string] }>();

interface Section {
  heading: string;
  body: string;
  editing: boolean;
  editBackup: string;
}

interface Task {
  text: string;
  checked: boolean;
}

const sections = reactive<Section[]>([]);
let currentContent = "";

// ── Parse / Serialize ──
function parseSections(md: string): Section[] {
  const result: Section[] = [];
  const lines = md.split("\n");
  let current: Section | null = null;

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/);
    if (h1) {
      if (current) {
        current.body = current.body.trimEnd();
        result.push(current);
      }
      current = { heading: h1[1], body: "", editing: false, editBackup: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) {
    current.body = current.body.trimEnd();
    result.push(current);
  }
  return result;
}

function serializeSections(secs: Section[]): string {
  return secs.map((s) => `# ${s.heading}\n\n${s.body.trimEnd()}`).join("\n\n") + "\n";
}

// ── Task helpers ──
function getTasks(body: string): Task[] {
  return body
    .split("\n")
    .filter((line) => /^- \[[ x]\]/.test(line))
    .map((line) => ({
      text: line.replace(/^- \[[ x]\] /, ""),
      checked: line.startsWith("- [x]"),
    }));
}

function getNonTaskMd(body: string): string {
  const lines = body.split("\n");
  const filtered = lines.filter((line) => !/^- \[[ x]\]/.test(line));
  return filtered.join("\n");
}

function renderMd(src: string): string {
  if (!src.trim()) return "";
  return marked.parse(src) as string;
}

// ── Mutations ──
function toggleTask(body: string, index: number): string {
  const lines = body.split("\n");
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^- \[[ x]\]/.test(lines[i])) {
      if (count === index) {
        lines[i] = lines[i].startsWith("- [x]")
          ? lines[i].replace("- [x]", "- [ ]")
          : lines[i].replace("- [ ]", "- [x]");
        break;
      }
      count++;
    }
  }
  return lines.join("\n");
}

function addTask(body: string): string {
  return body.trimEnd() + "\n- [ ] ";
}

function removeTask(body: string, index: number): string {
  const lines = body.split("\n");
  const result: string[] = [];
  let count = 0;
  for (const line of lines) {
    if (/^- \[[ x]\]/.test(line)) {
      if (count !== index) result.push(line);
      count++;
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}

// ── Sync ──
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

// ── Task interactions ──
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

// ── Edit mode ──
function startEdit(si: number) {
  const section = sections[si];
  section.editBackup = section.body;
  section.editing = true;
  nextTick(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      `.section-textarea[data-si="${si}"]`
    );
    ta?.focus();
    ta?.select();
  });
}

function finishEdit(si: number) {
  const section = sections[si];
  section.editing = false;
  if (section.body !== section.editBackup) {
    emitContent();
  }
}

function cancelEdit(si: number) {
  const section = sections[si];
  section.body = section.editBackup;
  section.editing = false;
}
</script>

<template>
  <div class="editor-wrap">
    <div class="editor-scroll">
      <section
        v-for="(section, si) in sections"
        :key="si"
        class="md-section"
      >
        <!-- ── Heading ── -->
        <div class="section-head">
          <h1 class="section-heading" @dblclick="startEdit(si)">
            {{ section.heading }}
          </h1>
          <button
            v-if="!section.editing"
            class="edit-btn"
            title="Edit section"
            @click="startEdit(si)"
          >
            <Pencil :size="11" />
          </button>
        </div>

        <!-- ── Read mode ── -->
        <template v-if="!section.editing">
          <!-- Markdown body -->
          <div
            v-if="getNonTaskMd(section.body).trim()"
            class="md-rendered"
            v-html="renderMd(getNonTaskMd(section.body))"
          />

          <!-- Task list -->
          <div v-if="getTasks(section.body).length" class="task-block">
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
              <span class="task-text">{{ task.text || "…" }}</span>
              <button
                class="task-remove"
                title="Remove"
                @click="onRemoveTask(si, ti)"
              >
                <X :size="8" />
              </button>
            </div>
            <button class="task-add" @click="onAddTask(si)">
              <Plus :size="10" /> Add task
            </button>
          </div>
        </template>

        <!-- ── Edit mode ── -->
        <div v-else class="section-edit">
          <textarea
            v-model="section.body"
            :data-si="si"
            class="section-textarea"
            rows="6"
            @blur="finishEdit(si)"
            @keydown.ctrl.enter="finishEdit(si)"
            @keydown.escape="cancelEdit(si)"
          />
          <div class="edit-hint">Ctrl+Enter to save · Esc to cancel</div>
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
  padding: 28px 52px 80px;
}

/* ── Section header ── */
.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 6px;
}

.section-heading {
  font-size: 1.25em;
  font-weight: 700;
  color: var(--color-accent-purple);
  margin: 0;
  flex: 1;
  cursor: default;
  letter-spacing: -0.02em;
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
}
.section-head:hover .edit-btn { opacity: 1; }
.edit-btn:hover {
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-accent-blue);
}

/* ── Rendered markdown ── */
.md-rendered {
  font-size: 14px;
  line-height: 1.75;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.md-rendered :deep(p) { margin: 0 0 0.5em; }
.md-rendered :deep(p:last-child) { margin-bottom: 0; }
.md-rendered :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.86em;
  background: color-mix(in srgb, var(--color-accent-pink) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-pink) 22%, transparent);
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
  margin-bottom: 0.5em;
}
.md-rendered :deep(pre code) { background: none; border: none; padding: 0; color: var(--color-text-primary); font-size: 0.84em; }
.md-rendered :deep(a) { color: var(--color-accent-blue); }
.md-rendered :deep(strong) { color: var(--color-text-primary); }
.md-rendered :deep(em) { color: var(--color-accent-teal); }

/* ── Task block ── */
.task-block {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
  font-size: 13px;
}
.task-row:hover {
  background: color-mix(in srgb, var(--color-accent-blue) 4%, transparent);
}
.task-row:hover .task-remove { opacity: 1; }
.task-row.done .task-text {
  text-decoration: line-through;
  color: var(--color-text-muted);
}

/* ── Custom checkbox ── */
.task-check {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-accent-blue) 6%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--color-accent-blue) 25%, var(--color-border));
  border-radius: 3px;
  cursor: pointer;
  padding: 0;
  transition: all var(--transition);
}
.task-check:hover {
  border-color: var(--color-accent-blue);
  background: color-mix(in srgb, var(--color-accent-blue) 12%, transparent);
}
.task-check.on {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
}

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
  min-height: 20px;
  line-height: 1.5;
  word-break: break-word;
}

.task-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: 2px;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  padding: 0;
  transition: all var(--transition);
}
.task-remove:hover {
  background: color-mix(in srgb, var(--color-accent-red) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-accent-red) 30%, transparent);
  color: var(--color-accent-red);
}

/* ── Add task button ── */
.task-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 3px 8px;
  margin-top: 4px;
  font-size: 11px;
  font-weight: 600;
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition);
}
.task-add:hover {
  border-color: var(--color-accent-blue);
  color: var(--color-accent-blue);
  background: color-mix(in srgb, var(--color-accent-blue) 5%, transparent);
}

/* ── Edit mode ── */
.section-edit { margin-top: 2px; }

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
  min-height: 100px;
  transition: border-color var(--transition);
}
.section-textarea:focus { border-color: var(--color-accent-blue); }

.edit-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 4px;
  padding-left: 2px;
}
</style>
