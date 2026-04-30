<script setup lang="ts">
import { reactive, watch, nextTick } from "vue";
import { marked } from "marked";
import { Plus, X } from "lucide-vue-next";

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

function isTaskSection(heading: string): boolean {
  const lower = heading.toLowerCase();
  return lower.includes("todo") || lower.includes("task") || lower.includes("progress");
}

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
  return body.trimEnd() + "\n" + '- [ ] ';
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

function renderMd(src: string): string {
  if (!src.trim()) return "";
  return marked.parse(src) as string;
}

// ── Sync from prop ──
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

// ── Emit on section change ──
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
  // If not already editing, enter edit mode for quick text entry
  const taskList = getTasks(sections[si].body);
  if (taskList.length > 0 && !taskList[taskList.length - 1].text.trim()) {
    return; // Already has an empty one
  }
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
    const ta = document.querySelector<HTMLTextAreaElement>(`.section-textarea[data-si="${si}"]`);
    ta?.focus();
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
        <h1 class="section-heading">{{ section.heading }}</h1>

        <!-- ── Read mode ── -->
        <div
          v-if="!section.editing"
          class="section-body"
          @dblclick="startEdit(si)"
        >
          <!-- Rendered non-task markdown -->
          <div
            v-if="getNonTaskMd(section.body).trim()"
            class="md-rendered"
            v-html="renderMd(getNonTaskMd(section.body))"
          />

          <!-- Task list -->
          <ul v-if="getTasks(section.body).length" class="task-list">
            <li
              v-for="(task, ti) in getTasks(section.body)"
              :key="ti"
              class="task-item"
              :class="{ done: task.checked }"
            >
              <input
                type="checkbox"
                :checked="task.checked"
                class="task-check"
                @click.stop="onToggleTask(si, ti)"
              />
              <span class="task-text" @dblclick.stop="startEdit(si)">
                {{ task.text || "…" }}
              </span>
              <button
                v-if="isTaskSection(section.heading)"
                class="task-remove"
                title="Remove task"
                @click.stop="onRemoveTask(si, ti)"
              >
                <X :size="10" />
              </button>
            </li>
            <li
              v-if="isTaskSection(section.heading)"
              class="task-add-row"
            >
              <button class="task-add" @click="onAddTask(si)">
                <Plus :size="10" /> Add task
              </button>
            </li>
          </ul>
        </div>

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

/* ── Section ── */
.md-section {
  margin-bottom: 28px;
}

.section-heading {
  font-size: 1.5em;
  font-weight: 700;
  color: var(--color-accent-purple);
  margin: 0 0 12px;
  border-bottom: 2px solid var(--color-accent-blue);
  padding-bottom: 6px;
  letter-spacing: -0.02em;
}

/* ── Read mode body ── */
.section-body {
  cursor: default;
  min-height: 24px;
  padding: 4px 0;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
}
.section-body:hover {
  background: color-mix(in srgb, var(--color-accent-blue) 3%, transparent);
}

.md-rendered {
  font-size: 14px;
  line-height: 1.75;
  color: var(--color-text-secondary);
}

.md-rendered :deep(p) { margin: 0 0 0.5em; }
.md-rendered :deep(p:last-child) { margin-bottom: 0; }
.md-rendered :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: color-mix(in srgb, var(--color-accent-pink) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-pink) 22%, transparent);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  color: var(--color-accent-pink);
}
.md-rendered :deep(pre) {
  background: var(--editor-bg, var(--color-surface));
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-accent-purple);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  overflow-x: auto;
  margin-bottom: 0.5em;
}
.md-rendered :deep(pre code) { background: none; border: none; padding: 0; color: var(--color-text-primary); font-size: 0.85em; }
.md-rendered :deep(a) { color: var(--color-accent-blue); }
.md-rendered :deep(strong) { color: var(--color-text-primary); }
.md-rendered :deep(em) { color: var(--color-accent-teal); }

/* ── Task list ── */
.task-list {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 6px 5px 2px;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition);
  font-size: 14px;
  line-height: 1.55;
}
.task-item:hover {
  background: color-mix(in srgb, var(--color-accent-blue) 5%, transparent);
}
.task-item:hover .task-remove { opacity: 1; }

.task-item.done .task-text {
  text-decoration: line-through;
  color: var(--color-text-muted);
}

.task-check {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  margin-top: 3px;
  accent-color: var(--color-accent-blue);
  cursor: pointer;
}

.task-text {
  flex: 1;
  color: var(--color-text-secondary);
  word-break: break-word;
  min-height: 22px;
}

.task-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 2px;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition), color var(--transition), border-color var(--transition);
  padding: 0;
}
.task-remove:hover { color: var(--color-accent-red); border-color: var(--color-accent-red); }

.task-add-row { padding: 2px 0 0; }

.task-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 12px;
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
.section-edit {
  margin-top: 2px;
}

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
  padding-left: 4px;
}
</style>
