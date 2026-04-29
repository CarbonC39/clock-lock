<script setup lang="ts">
import { ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { Home, FolderOpen } from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";
import MarkdownEditor from "./MarkdownEditor.vue";

const workspace = useWorkspaceStore();

const annotationNote = ref("");
const annotationSaved = ref(false);
const imageDataUrl = ref<string | null>(null);

const IMAGE_EXTS = new Set(["png","jpg","jpeg","gif","webp","svg","ico","bmp","avif"]);

function isImage(path: string): boolean {
  return IMAGE_EXTS.has(path.split(".").pop()?.toLowerCase() ?? "");
}

watch(
  () => workspace.selectedFilePath,
  async (path) => {
    imageDataUrl.value = null;
    annotationNote.value = "";
    if (path && workspace.selectedFileContent === null && isImage(path)) {
      try {
        imageDataUrl.value = await invoke<string>("read_image_b64", { path });
      } catch {
        imageDataUrl.value = null;
      }
    }
  }
);

async function saveAnnotation() {
  if (!workspace.path || !workspace.selectedFilePath) return;
  const relPath = workspace.selectedFilePath
    .replace(workspace.path + "/", "")
    .replace(workspace.path + "\\", "");
  await invoke("save_annotation", {
    workspacePath: workspace.path,
    relPath,
    note: annotationNote.value,
  });
  annotationSaved.value = true;
  setTimeout(() => (annotationSaved.value = false), 2000);
}
</script>

<template>
  <div class="workspace-home">

    <!-- ── Empty state ────────────────────────────────── -->
    <div v-if="!workspace.path" class="empty-state">
      <div class="open-zone" @click="workspace.openWorkspace()">
        <FolderOpen :size="28" class="open-zone-icon" />
        <p class="open-zone-title">Open a Workspace</p>
        <p class="open-zone-hint">Click to browse for a project folder</p>
      </div>
    </div>

    <!-- ── Non-home file selected ─────────────────────── -->
    <template v-else-if="workspace.selectedFilePath && !workspace.selectedFilePath.endsWith('home.md')">
      <div class="file-header">
        <button class="back-btn" title="Back to home" @click="workspace.selectedFilePath = null">
          <Home :size="14" />
        </button>
        <span class="file-name">{{ workspace.selectedFilePath.split(/[\\/]/).pop() }}</span>
      </div>

      <!-- Text file -->
      <div v-if="workspace.selectedFileContent !== null" class="file-content">
        <pre><code>{{ workspace.selectedFileContent }}</code></pre>
      </div>

      <!-- Binary file: image + optional annotation -->
      <div v-else class="binary-view">
        <div v-if="imageDataUrl" class="image-preview">
          <img :src="imageDataUrl" :alt="workspace.selectedFilePath.split(/[\\/]/).pop()" />
        </div>
        <div v-else class="no-preview-badge">No preview available</div>

        <div class="annotation-area">
          <p class="annotation-label">Agent annotation</p>
          <div class="annotation-row">
            <input
              v-model="annotationNote"
              class="annotation-input"
              placeholder="Describe this file so the agent understands it… (optional)"
              @keydown.enter="saveAnnotation"
            />
            <button class="btn-save" @click="saveAnnotation">
              {{ annotationSaved ? "Saved!" : "Save" }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Home markdown ──────────────────────────────── -->
    <template v-else-if="workspace.path">
      <MarkdownEditor
        :key="workspace.path"
        :content="workspace.homeMdContent"
        @update:content="workspace.saveHomeMd"
      />
    </template>

  </div>
</template>

<style scoped>
.workspace-home {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Empty state ── */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
}

.open-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 48px;
  border: 1.5px dashed var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: center;
  transition: border-color var(--transition), background-color var(--transition);
}

.open-zone:hover {
  border-color: color-mix(in srgb, var(--color-accent-blue) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-accent-blue) 3%, transparent);
}

.open-zone-icon {
  color: var(--color-accent-blue);
  opacity: 0.7;
}

.open-zone:hover .open-zone-icon {
  opacity: 1;
}

.open-zone-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.open-zone-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

/* ── File header ── */
.file-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition);
}
.back-btn:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Text file ── */
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
  margin: 0;
}

/* ── Binary view ── */
.binary-view {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.image-preview {
  display: flex;
  justify-content: center;
}

.image-preview img {
  max-width: 100%;
  max-height: 55vh;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  object-fit: contain;
}

.no-preview-badge {
  font-size: 12px;
  color: var(--color-text-muted);
  font-style: italic;
}

/* ── Annotation ── */
.annotation-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.annotation-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin: 0;
}

.annotation-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.annotation-input {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color var(--transition);
}
.annotation-input:focus { border-color: var(--color-accent-blue); }
.annotation-input::placeholder { color: var(--color-text-muted); font-size: 12px; }

.btn-save {
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 600;
  background: var(--color-accent-blue);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: opacity var(--transition);
}
.btn-save:hover { opacity: 0.85; }
</style>
