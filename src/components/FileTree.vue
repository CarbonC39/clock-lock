<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { RotateCw } from "lucide-vue-next";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "../stores/workspaceStore";
import FileTreeNode from "./FileTreeNode.vue";

const workspace = useWorkspaceStore();

let unlisten: UnlistenFn | null = null;

onMounted(async () => {
  unlisten = await listen("fs-change", () => {
    workspace.refreshTree();
  });
});

onUnmounted(() => {
  unlisten?.();
});
</script>

<template>
  <div class="file-tree">
    <div class="panel-header">
      <span class="panel-title">Files</span>
      <button
        v-if="workspace.path"
        class="refresh-btn"
        title="Refresh"
        @click="workspace.refreshTree()"
      ><RotateCw :size="12" /></button>
    </div>

    <div class="panel-body">
      <template v-if="workspace.path">
        <FileTreeNode
          v-for="node in workspace.fileTree"
          :key="node.path"
          :node="node"
          :depth="0"
        />
        <div v-if="workspace.fileTree.length === 0" class="empty-hint">
          Empty workspace
        </div>
      </template>
      <div v-else class="empty-hint">No workspace open</div>
    </div>
  </div>
</template>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.refresh-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  line-height: 1;
  transition: color var(--transition);
}

.refresh-btn:hover {
  color: var(--color-text-primary);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.empty-hint {
  padding: 12px;
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>
