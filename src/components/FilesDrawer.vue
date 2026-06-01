<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  X, FolderOpen, RotateCw, UtensilsCrossed, ExternalLink, FileText, PanelLeftClose,
} from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useUiStore } from "../stores/uiStore";
import { useAgentStore } from "../stores/agentStore";
import { highlightCode } from "../composables/useHighlighter";
import FileTreeNode from "./FileTreeNode.vue";

const workspace = useWorkspaceStore();
const ui = useUiStore();
const agent = useAgentStore();

const highlightedHtml = ref<string | null>(null);
const imageDataUrl = ref<string | null>(null);
const annotationNote = ref("");
const annotationSaved = ref(false);

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif"]);
function isImage(path: string): boolean {
  return IMAGE_EXTS.has(path.split(".").pop()?.toLowerCase() ?? "");
}

const selectedName = computed(() =>
  workspace.selectedFilePath?.split(/[\\/]/).pop() ?? null
);
const hasPreview = computed(() => !!workspace.selectedFilePath);

function relPath(path = workspace.selectedFilePath ?? ""): string {
  if (!workspace.path) return path;
  const wsNorm = workspace.path.replace(/\\/g, "/");
  const pNorm = path.replace(/\\/g, "/");
  return pNorm.startsWith(wsNorm + "/") ? pNorm.slice(wsNorm.length + 1) : pNorm;
}

// Recompute highlight when content or theme changes
watch(
  [() => workspace.selectedFileContent, () => ui.isDark],
  async ([content]) => {
    highlightedHtml.value = null;
    if (!content || !workspace.selectedFilePath) return;
    if (content.length > 100000) return; // skip huge files
    const filename = workspace.selectedFilePath.replace(/\\/g, "/").split("/").pop() ?? "";
    highlightedHtml.value = await highlightCode(content, filename, ui.isDark);
  }
);

// Load image / annotation when selection changes
watch(
  () => workspace.selectedFilePath,
  async (path) => {
    imageDataUrl.value = null;
    annotationNote.value = "";
    if (!path) return;
    if (workspace.selectedFileContent === null && isImage(path)) {
      try {
        imageDataUrl.value = await invoke<string>("read_image_b64", { path });
      } catch {
        imageDataUrl.value = null;
      }
    }
    if (workspace.path && workspace.selectedFileContent === null) {
      try {
        const annotations: Record<string, string> = await invoke("get_annotations", {
          workspacePath: workspace.path,
        });
        const rel = relPath(path);
        if (annotations[rel]) annotationNote.value = annotations[rel];
      } catch { /* ignore */ }
    }
  }
);

function close() {
  ui.setFiles(false);
}

function feedToAgent() {
  if (!workspace.selectedFilePath || agent.isBusy) return;
  const rel = relPath();
  agent.sendMessage(`Take a look at \`${rel}\` — walk me through what it does and anything worth noting.`);
  close();
}

async function openExternally() {
  if (!workspace.selectedFilePath) return;
  openPath(workspace.selectedFilePath).catch(console.warn);
}

async function saveAnnotation() {
  if (!workspace.path || !workspace.selectedFilePath) return;
  await invoke("save_annotation", {
    workspacePath: workspace.path,
    relPath: relPath(),
    note: annotationNote.value,
  });
  annotationSaved.value = true;
  setTimeout(() => (annotationSaved.value = false), 2000);
}
</script>

<template>
  <Transition name="drawer">
    <div v-if="ui.filesOpen" class="drawer-root">
      <div class="backdrop" @click="close" />

      <aside class="drawer" :class="{ expanded: hasPreview }">
        <!-- ── Tree pane ── -->
        <div class="pane-tree">
          <header class="pane-head">
            <FolderOpen :size="14" class="head-icon" />
            <span class="head-title">Files</span>
            <button
              v-if="workspace.path"
              class="head-btn"
              title="Refresh"
              @click="workspace.refreshTree()"
            ><RotateCw :size="13" /></button>
            <button class="head-btn" title="Close" @click="close"><X :size="15" /></button>
          </header>

          <!-- No workspace -->
          <div v-if="!workspace.path" class="drawer-empty">
            <button class="open-zone" @click="workspace.openWorkspace()">
              <FolderOpen :size="24" />
              <span class="open-title">Open a Workspace</span>
              <span class="open-hint">Browse for a project folder</span>
            </button>
          </div>

          <!-- Tree -->
          <div v-else class="tree-scroll">
            <FileTreeNode
              v-for="node in workspace.fileTree"
              :key="node.path"
              :node="node"
              :depth="0"
            />
            <div v-if="!workspace.fileTree.length" class="empty-hint">Empty workspace</div>
          </div>
        </div>

        <!-- ── Preview pane ── -->
        <div v-if="hasPreview" class="pane-view">
          <header class="view-head">
            <button class="head-btn" title="Close preview" @click="workspace.deselect()">
              <PanelLeftClose :size="14" />
            </button>
            <FileText :size="13" class="view-icon" />
            <span class="view-name">{{ selectedName }}</span>
            <button class="view-act" title="Open in system app" @click="openExternally">
              <ExternalLink :size="13" />
            </button>
            <button class="view-act feed" :disabled="agent.isBusy" title="Ask the agent to read this" @click="feedToAgent">
              <UtensilsCrossed :size="13" />
              <span>Feed</span>
            </button>
          </header>

          <div class="view-body">
            <!-- Text -->
            <template v-if="workspace.selectedFileContent !== null">
              <div v-if="highlightedHtml" class="shiki-wrap" v-html="highlightedHtml" />
              <pre v-else class="plain-code"><code>{{ workspace.selectedFileContent }}</code></pre>
            </template>

            <!-- Binary / image -->
            <div v-else class="binary-view">
              <div v-if="imageDataUrl" class="image-preview">
                <img :src="imageDataUrl" :alt="selectedName ?? ''" />
              </div>
              <div v-else class="no-preview-badge">No inline preview — try "Open in system app".</div>

              <div class="annotation-area">
                <p class="annotation-label">Agent annotation</p>
                <div class="annotation-row">
                  <input
                    v-model="annotationNote"
                    class="annotation-input"
                    placeholder="Describe this file so the agent understands it… (optional)"
                    @keydown.enter="saveAnnotation"
                    @blur="saveAnnotation"
                  />
                  <button class="btn-save" @click="saveAnnotation">
                    {{ annotationSaved ? "Saved!" : "Save" }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-root {
  position: absolute;
  inset: 0;
  z-index: 200;
}

.backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--color-bg) 40%, rgba(0, 0, 0, 0.35));
  backdrop-filter: blur(1.5px);
}

.drawer {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 300px;
  display: flex;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  transition: width 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.drawer.expanded { width: min(760px, 94vw); }

/* ── Tree pane ── */
.pane-tree {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border-soft);
}
.drawer:not(.expanded) .pane-tree { width: 300px; }

.pane-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--color-border-soft);
  flex-shrink: 0;
}
.head-icon { color: var(--color-accent-teal); flex-shrink: 0; }
.head-title {
  flex: 1;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--color-text-primary);
}
.head-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition);
}
.head-btn:hover { background: var(--color-surface-hover); color: var(--color-text-primary); }

.tree-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.empty-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  font-style: italic;
  padding: 12px 16px;
}

/* No-workspace state */
.drawer-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.open-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 24px;
  background: none;
  border: 1.5px dashed var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-accent-teal);
  transition: border-color var(--transition), background-color var(--transition);
}
.open-zone:hover {
  border-color: color-mix(in srgb, var(--color-accent-teal) 50%, var(--color-border));
  background: color-mix(in srgb, var(--color-accent-teal) 5%, transparent);
}
.open-title { font-size: 13px; font-weight: 700; color: var(--color-text-primary); }
.open-hint { font-size: 11.5px; color: var(--color-text-muted); }

/* ── Preview pane ── */
.pane-view {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.view-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 10px;
  border-bottom: 1px solid var(--color-border-soft);
  flex-shrink: 0;
  background: var(--color-surface);
}
.view-icon { color: var(--color-accent-teal); flex-shrink: 0; }
.view-name {
  flex: 1;
  font-size: 12.5px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.view-act {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border: none;
  background: none;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  transition: background-color var(--transition), color var(--transition), opacity var(--transition);
}
.view-act:hover { background: var(--color-surface-hover); color: var(--color-text-primary); }
.view-act.feed {
  background: var(--color-accent-teal);
  color: #fff;
}
.view-act.feed:hover:not(:disabled) { opacity: 0.88; background: var(--color-accent-teal); color: #fff; }
.view-act.feed:disabled { opacity: 0.45; cursor: not-allowed; }

.view-body {
  flex: 1;
  overflow: auto;
}

/* Shiki / plain */
.shiki-wrap :deep(pre.shiki) {
  margin: 0;
  padding: 16px 18px;
  border-radius: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  min-height: 100%;
  overflow-x: auto;
}
.shiki-wrap :deep(pre.shiki code) { font-family: inherit; font-size: inherit; }
.plain-code {
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  padding: 16px 18px;
  margin: 0;
}

/* Binary */
.binary-view {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.image-preview { display: flex; justify-content: center; }
.image-preview img {
  max-width: 100%;
  max-height: 60vh;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  object-fit: contain;
}
.no-preview-badge { font-size: 12px; color: var(--color-text-muted); font-style: italic; }

.annotation-area { display: flex; flex-direction: column; gap: 6px; }
.annotation-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin: 0;
}
.annotation-row { display: flex; gap: 8px; align-items: center; }
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
.annotation-input:focus { border-color: var(--color-accent-teal); }
.btn-save {
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 700;
  background: var(--color-accent-teal);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: opacity var(--transition);
}
.btn-save:hover { opacity: 0.85; }

/* ── Slide transition ── */
.drawer-enter-active .drawer,
.drawer-leave-active .drawer { transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1); }
.drawer-enter-from .drawer,
.drawer-leave-to .drawer { transform: translateX(-100%); }

.drawer-enter-active .backdrop,
.drawer-leave-active .backdrop { transition: opacity 0.22s ease; }
.drawer-enter-from .backdrop,
.drawer-leave-to .backdrop { opacity: 0; }
</style>
