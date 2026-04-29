<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { marked } from "marked";

const props = defineProps<{
  content: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  "update:content": [string];
}>();

marked.setOptions({ gfm: true, breaks: true });

const isEditing = ref(false);
const draft = ref(props.content);

watch(
  () => props.content,
  (v) => {
    if (!isEditing.value) draft.value = v;
  }
);

const rendered = computed(() => marked.parse(draft.value) as string);

function startEdit() {
  if (props.readonly) return;
  draft.value = props.content;
  isEditing.value = true;
}

function save() {
  emit("update:content", draft.value);
  isEditing.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    draft.value = props.content;
    isEditing.value = false;
  }
  // Ctrl/Cmd+S to save
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    save();
  }
}
</script>

<template>
  <div class="markdown-editor">
    <!-- Toolbar -->
    <div v-if="!readonly" class="editor-toolbar">
      <button v-if="!isEditing" class="toolbar-btn" @click="startEdit">Edit</button>
      <template v-else>
        <button class="toolbar-btn primary" @click="save">Save</button>
        <button class="toolbar-btn" @click="isEditing = false; draft = content">Cancel</button>
        <span class="toolbar-hint">Ctrl+S to save · Esc to cancel</span>
      </template>
    </div>

    <!-- Edit mode -->
    <textarea
      v-if="isEditing"
      v-model="draft"
      class="editor-textarea"
      spellcheck="false"
      @keydown="onKeydown"
    />

    <!-- View mode -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-else class="markdown-body" @dblclick="startEdit" v-html="rendered" />
  </div>
</template>

<style scoped>
.markdown-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.toolbar-btn {
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
}

.toolbar-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.toolbar-btn.primary {
  background-color: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
  color: #fff;
}

.toolbar-btn.primary:hover {
  opacity: 0.85;
}

.toolbar-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-left: 4px;
}

.editor-textarea {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  background-color: var(--color-bg);
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  padding: 20px 28px;
}

.markdown-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px;
  cursor: text;
}
</style>

<style>
/* Unscoped so markdown-body child elements are styled */
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  color: var(--color-text-primary);
  font-weight: 600;
  margin-top: 1.4em;
  margin-bottom: 0.5em;
  line-height: 1.3;
}

.markdown-body h1 { font-size: 1.6em; border-bottom: 1px solid var(--color-border); padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.25em; }
.markdown-body h3 { font-size: 1.05em; }

.markdown-body p {
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin-bottom: 0.8em;
}

.markdown-body ul,
.markdown-body ol {
  color: var(--color-text-secondary);
  padding-left: 1.5em;
  margin-bottom: 0.8em;
  line-height: 1.7;
}

.markdown-body li { margin-bottom: 0.2em; }

.markdown-body input[type="checkbox"] {
  margin-right: 6px;
  accent-color: var(--color-accent-blue);
}

.markdown-body code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  color: var(--color-accent-pink);
}

.markdown-body pre {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  overflow-x: auto;
  margin-bottom: 1em;
}

.markdown-body pre code {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.87em;
  color: var(--color-text-primary);
}

.markdown-body blockquote {
  border-left: 3px solid var(--color-accent-purple);
  margin: 0 0 0.8em;
  padding: 0.3em 1em;
  color: var(--color-text-muted);
  background-color: var(--color-surface);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.markdown-body hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 1.5em 0;
}

.markdown-body a {
  color: var(--color-accent-blue);
  text-decoration: none;
}

.markdown-body a:hover { text-decoration: underline; }

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1em;
  font-size: 13px;
}

.markdown-body th,
.markdown-body td {
  border: 1px solid var(--color-border);
  padding: 6px 10px;
  text-align: left;
}

.markdown-body th {
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  font-weight: 600;
}
</style>
