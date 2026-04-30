<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { CheckCheck } from "lucide-vue-next";
import { useDebounceFn } from "@vueuse/core";

const props = defineProps<{
  content: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{ "update:content": [string] }>();

const editorEl = ref<HTMLDivElement>();
const savedFlash = ref(false);
let editor: Editor | undefined;
let currentContent = "";

function flashSaved() {
  savedFlash.value = true;
  setTimeout(() => (savedFlash.value = false), 1800);
}

const debouncedEmit = useDebounceFn((markdown: string) => {
  emit("update:content", markdown);
}, 350);

async function createEditor(content: string) {
  if (!editorEl.value) return;
  await editor?.destroy();
  editor = undefined;
  currentContent = content || "";

  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, editorEl.value!);
      ctx.set(defaultValueCtx, currentContent);
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
        currentContent = markdown;
        debouncedEmit(markdown);
      });
    })
    .use(gfm)
    .use(listener)
    .use(history)
    .create();
}

onMounted(async () => {
  await nextTick();
  await createEditor(props.content);
});

onUnmounted(async () => {
  await editor?.destroy();
  editor = undefined;
});

watch(
  () => props.content,
  async (val) => {
    if (val !== currentContent) {
      await createEditor(val);
    }
  }
);

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    flashSaved();
  }
}
</script>

<template>
  <div class="editor-wrap" @keydown="onKeydown">
    <div class="editor-status">
      <Transition name="fade-up">
        <span v-if="savedFlash" class="saved-badge">
          <CheckCheck :size="11" /> Saved
        </span>
      </Transition>
    </div>

    <div class="editor-scroll">
      <div ref="editorEl" class="editor-root" />
    </div>
  </div>
</template>

<style scoped>
.editor-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.editor-status {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 5;
  pointer-events: none;
}

.saved-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-accent-green);
  background: color-mix(in srgb, var(--color-accent-green) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-green) 30%, transparent);
  padding: 3px 8px;
  border-radius: 20px;
}

.fade-up-enter-active,
.fade-up-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.fade-up-enter-from   { opacity: 0; transform: translateY(4px); }
.fade-up-leave-to     { opacity: 0; transform: translateY(-4px); }

.editor-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 28px 52px 80px;
}

.editor-root {
  min-height: 300px;
}

/* Scope Milkdown styles via :deep() so they don't leak globally */
.editor-root :deep(.milkdown) {
  background: transparent;
  outline: none;
}

.editor-root :deep(.ProseMirror) {
  outline: none;
  line-height: 1.75;
  color: var(--color-text-secondary);
  min-height: 200px;
  cursor: text;
}

.editor-root :deep(.ProseMirror > *:first-child) { margin-top: 0; }

/* ── Headings ── */
.editor-root :deep(.ProseMirror h1) {
  font-size: 1.7em;
  font-weight: 700;
  color: var(--color-accent-purple);
  margin: 0.1em 0 0.5em;
  border-bottom: 2px solid var(--color-accent-blue);
  padding-bottom: 0.25em;
  letter-spacing: -0.02em;
}

.editor-root :deep(.ProseMirror h2) {
  font-size: 1.25em;
  font-weight: 700;
  color: var(--color-accent-blue);
  margin: 1.2em 0 0.4em;
  padding-left: 10px;
  border-left: 3px solid var(--color-accent-blue);
}

.editor-root :deep(.ProseMirror h3) {
  font-size: 1.05em;
  font-weight: 700;
  color: var(--color-accent-pink);
  margin: 1em 0 0.35em;
}

.editor-root :deep(.ProseMirror h4) {
  font-size: 0.95em;
  font-weight: 600;
  color: var(--color-accent-teal);
  margin: 0.9em 0 0.3em;
}

/* ── Paragraph ── */
.editor-root :deep(.ProseMirror p) {
  color: var(--color-text-secondary);
  margin: 0 0 0.75em;
}

/* ── Lists ── */
.editor-root :deep(.ProseMirror ul),
.editor-root :deep(.ProseMirror ol) {
  color: var(--color-text-secondary);
  padding-left: 1.5em;
  margin-bottom: 0.75em;
}

.editor-root :deep(.ProseMirror li) { margin-bottom: 0.25em; }
.editor-root :deep(.ProseMirror li > p) { margin: 0; }

/* ── Task list ── */
.editor-root :deep(.ProseMirror li[data-task-list-item]),
.editor-root :deep(.ProseMirror .task-list-item) {
  list-style: none;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding-left: 0;
  margin-left: -1.5em;
}

.editor-root :deep(.ProseMirror input[type="checkbox"]) {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  accent-color: var(--color-accent-blue);
  cursor: pointer;
  margin-top: 2px;
}

/* ── Inline code ── */
.editor-root :deep(.ProseMirror code) {
  font-family: var(--font-mono);
  font-size: 0.86em;
  background: color-mix(in srgb, var(--color-accent-pink) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-pink) 22%, transparent);
  padding: 0.1em 0.38em;
  border-radius: 4px;
  color: var(--color-accent-pink);
  font-weight: 500;
}

/* ── Code fence ── */
.editor-root :deep(.ProseMirror pre) {
  background: var(--editor-bg, var(--color-surface));
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-accent-purple);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  overflow-x: auto;
  margin-bottom: 1em;
}

.editor-root :deep(.ProseMirror pre code) {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.87em;
  color: var(--color-text-primary);
  font-weight: 400;
}

/* ── Blockquote ── */
.editor-root :deep(.ProseMirror blockquote) {
  border-left: 3px solid var(--color-accent-purple);
  margin: 0.4em 0 0.9em;
  padding: 0.5em 1em;
  background: color-mix(in srgb, var(--color-accent-purple) 6%, transparent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--color-text-muted);
  font-style: italic;
}

.editor-root :deep(.ProseMirror blockquote p) { margin: 0; }

/* ── HR ── */
.editor-root :deep(.ProseMirror hr) {
  border: none;
  height: 2px;
  background: var(--color-accent-blue);
  opacity: 0.25;
  margin: 1.5em 0;
}

/* ── Links ── */
.editor-root :deep(.ProseMirror a) {
  color: var(--color-accent-blue);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--color-accent-blue) 35%, transparent);
  transition: color var(--transition);
}
.editor-root :deep(.ProseMirror a:hover) { color: var(--color-accent-purple); }

/* ── Emphasis ── */
.editor-root :deep(.ProseMirror strong) { color: var(--color-text-primary); font-weight: 700; }
.editor-root :deep(.ProseMirror em)     { color: var(--color-accent-teal); font-style: italic; }

/* ── Tables ── */
.editor-root :deep(.ProseMirror table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1em;
  font-size: 13px;
}
.editor-root :deep(.ProseMirror th) {
  background: color-mix(in srgb, var(--color-accent-blue) 10%, transparent);
  color: var(--color-accent-blue);
  font-weight: 700;
  padding: 7px 12px;
  border: 1px solid var(--color-border);
  text-align: left;
}
.editor-root :deep(.ProseMirror td) {
  border: 1px solid var(--color-border);
  padding: 6px 12px;
  color: var(--color-text-secondary);
}
.editor-root :deep(.ProseMirror tr:nth-child(even) td) {
  background: color-mix(in srgb, var(--color-border) 25%, transparent);
}

/* ── Images ── */
.editor-root :deep(.ProseMirror img) {
  max-width: 100%;
  border-radius: var(--radius-md);
  margin: 0.5em 0;
}

/* ── ProseMirror selection / focus ── */
.editor-root :deep(.ProseMirror-selectednode) {
  outline: 2px solid var(--color-accent-blue);
  border-radius: var(--radius-sm);
}
</style>
