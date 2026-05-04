<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [string];
  commit: [];
  blur: [];
}>();

const containerEl = ref<HTMLDivElement>();
let view: EditorView | null = null;

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: "var(--color-accent-blue)", fontWeight: "700" },
  { tag: tags.heading2, color: "var(--color-accent-blue)", fontWeight: "700" },
  { tag: tags.heading3, color: "var(--color-accent-purple)", fontWeight: "600" },
  { tag: tags.heading4, color: "var(--color-accent-purple)", fontWeight: "600" },
  { tag: tags.strong, color: "var(--color-accent-blue)", fontWeight: "700" },
  { tag: tags.emphasis, color: "var(--color-accent-teal)", fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--color-text-muted)" },
  { tag: tags.link, color: "var(--color-accent-blue)" },
  { tag: tags.url, color: "var(--color-accent-teal)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--color-accent-pink)" },
  { tag: tags.quote, color: "var(--color-text-muted)", fontStyle: "italic" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)", color: "var(--color-accent-pink)" },
  { tag: tags.processingInstruction, color: "var(--color-accent-yellow)" },
  { tag: tags.comment, color: "var(--color-text-muted)" },
]);

const cmTheme = EditorView.theme({
  "&": { color: "var(--color-text-primary)", background: "transparent" },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    lineHeight: "1.65",
    padding: "10px 14px",
    minHeight: "140px",
    caretColor: "var(--color-accent-blue)",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-accent-blue)" },
  ".cm-selectionBackground": {
    background: "color-mix(in srgb, var(--color-accent-blue) 20%, transparent)",
  },
  "&.cm-focused .cm-selectionBackground": {
    background: "color-mix(in srgb, var(--color-accent-blue) 28%, transparent)",
  },
  ".cm-gutters": { display: "none" },
  ".cm-activeLine": { background: "transparent" },
  ".cm-activeLineGutter": { display: "none" },
  ".cm-placeholder": { color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" },
  ".cm-line": { padding: "0" },
  ".cm-scroller": { overflow: "auto" },
});

onMounted(() => {
  if (!containerEl.value) return;

  const extensions = [
    history(),
    markdown(),
    syntaxHighlighting(mdHighlight),
    EditorView.lineWrapping,
    cmTheme,
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      { key: "Ctrl-Enter", run: () => { emit("commit"); return true; } },
      { key: "Escape", run: () => { emit("commit"); return true; } },
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) emit("update:modelValue", u.state.doc.toString());
      if (u.focusChanged && !u.view.hasFocus) emit("blur");
    }),
    ...(props.placeholder ? [placeholder(props.placeholder)] : []),
  ];

  view = new EditorView({
    state: EditorState.create({ doc: props.modelValue, extensions }),
    parent: containerEl.value,
  });
});

onUnmounted(() => {
  view?.destroy();
  view = null;
});

watch(() => props.modelValue, (val) => {
  if (!view || view.state.doc.toString() === val) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: val } });
});

function focus() {
  nextTick(() => view?.focus());
}

defineExpose({ focus });
</script>

<template>
  <div ref="containerEl" class="cm-wrap" />
</template>

<style scoped>
.cm-wrap {
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--transition);
  box-sizing: border-box;
}
.cm-wrap:focus-within {
  border-color: var(--color-accent-blue);
}
</style>
