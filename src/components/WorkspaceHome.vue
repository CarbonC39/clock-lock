<script setup lang="ts">
import { useWorkspaceStore } from "../stores/workspaceStore";
import MarkdownEditor from "./MarkdownEditor.vue";

const workspace = useWorkspaceStore();

const emit = defineEmits<{ openWorkspace: [] }>();
</script>

<template>
  <div class="workspace-home">
    <!-- Empty state -->
    <div v-if="!workspace.path" class="empty-state">
      <div class="empty-icon">⬡</div>
      <h2 class="empty-title">No workspace open</h2>
      <p class="empty-desc">Open a folder to start tracking your project.</p>
      <button class="btn-primary" @click="emit('openWorkspace')">Open Folder</button>
    </div>

    <!-- File view — non-home file selected -->
    <template v-else-if="workspace.selectedFilePath && !workspace.selectedFilePath.endsWith('home.md')">
      <div class="file-header">
        <button class="back-btn" @click="workspace.selectedFilePath = null">← home.md</button>
        <span class="file-name">{{ workspace.selectedFilePath.split("/").pop() }}</span>
      </div>
      <div v-if="workspace.selectedFileContent !== null" class="file-content">
        <pre><code>{{ workspace.selectedFileContent }}</code></pre>
      </div>
      <div v-else class="binary-notice">
        <p>Binary file — add an annotation to help the agent understand it.</p>
        <BinaryAnnotationInline
          :file-path="workspace.selectedFilePath"
          :workspace-path="workspace.path!"
        />
      </div>
    </template>

    <!-- Home markdown -->
    <template v-else-if="workspace.path">
      <MarkdownEditor
        :content="workspace.homeMdContent"
        @update:content="workspace.saveHomeMd"
      />
    </template>
  </div>
</template>

<script lang="ts">
// Inline binary annotation — keeps it simple without a separate modal
import { defineComponent, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

const BinaryAnnotationInline = defineComponent({
  name: "BinaryAnnotationInline",
  props: {
    filePath: { type: String, required: true },
    workspacePath: { type: String, required: true },
  },
  setup(props) {
    const note = ref("");
    const saved = ref(false);

    async function save() {
      const relPath = props.filePath.replace(props.workspacePath + "/", "");
      await invoke("save_annotation", {
        workspacePath: props.workspacePath,
        relPath,
        note: note.value,
      });
      saved.value = true;
      setTimeout(() => (saved.value = false), 2000);
    }

    return { note, saved, save };
  },
  template: `
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px">
      <input
        v-model="note"
        placeholder="What is this file? (optional)"
        style="flex:1;padding:6px 10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text-primary);font-size:13px;outline:none"
      />
      <button
        @click="save"
        style="padding:6px 14px;background:var(--color-accent-blue);color:#fff;border:none;border-radius:var(--radius-sm);cursor:pointer;font-size:12px"
      >{{ saved ? 'Saved!' : 'Save' }}</button>
    </div>
  `,
});
</script>

<style scoped>
.workspace-home {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  padding: 40px;
  text-align: center;
}

.empty-icon {
  font-size: 40px;
  color: var(--color-accent-purple);
  opacity: 0.4;
  line-height: 1;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.empty-desc {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 0;
}

.btn-primary {
  margin-top: 4px;
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 500;
  background-color: var(--color-accent-blue);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: opacity var(--transition);
}

.btn-primary:hover {
  opacity: 0.85;
}

/* File header */
.file-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  color: var(--color-accent-blue);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

/* File content */
.file-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.file-content pre {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.binary-notice {
  padding: 20px 28px;
  color: var(--color-text-muted);
  font-size: 13px;
}
</style>
