<script setup lang="ts">
import { ref } from "vue";
import type { FileNode } from "../stores/workspaceStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

defineOptions({ name: "FileTreeNode" });

const props = defineProps<{ node: FileNode; depth?: number }>();

const workspace = useWorkspaceStore();
const isOpen = ref(props.node.name === ".clocklock" ? false : props.depth === 0);

function toggle() {
  if (props.node.is_dir) isOpen.value = !isOpen.value;
}

function select() {
  if (!props.node.is_dir) workspace.selectFile(props.node.path);
}

const gitClass: Record<string, string> = {
  M: "status-modified",
  A: "status-added",
  D: "status-deleted",
};
</script>

<template>
  <div class="tree-node">
    <!-- Row -->
    <div
      class="node-row"
      :class="[
        node.is_dir ? 'is-dir' : 'is-file',
        workspace.selectedFilePath === node.path ? 'is-active' : '',
      ]"
      :style="{ paddingLeft: `${(depth ?? 0) * 12 + 8}px` }"
      @click="node.is_dir ? toggle() : select()"
    >
      <!-- Chevron for directories -->
      <span v-if="node.is_dir" class="chevron" :class="{ open: isOpen }">›</span>
      <span v-else class="chevron-spacer" />

      <!-- Icon -->
      <span class="node-icon">{{ node.is_dir ? (isOpen ? "📂" : "📁") : fileIcon(node.name) }}</span>

      <!-- Name -->
      <span class="node-name">{{ node.name }}</span>

      <!-- Git status badge -->
      <span
        v-if="node.git_status"
        class="git-badge"
        :class="gitClass[node.git_status] ?? 'status-modified'"
      >{{ node.git_status }}</span>
    </div>

    <!-- Children -->
    <template v-if="node.is_dir && isOpen && node.children">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="(depth ?? 0) + 1"
      />
    </template>
  </div>
</template>

<script lang="ts">
function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    md: "📝",
    ts: "📘",
    js: "📒",
    vue: "💚",
    rs: "🦀",
    toml: "⚙️",
    json: "📋",
    css: "🎨",
    html: "🌐",
    py: "🐍",
    go: "🐹",
    sh: "💲",
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    svg: "🖼️",
    gif: "🖼️",
  };
  return map[ext] ?? "📄";
}
</script>

<style scoped>
.tree-node {
  user-select: none;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  cursor: pointer;
  border-radius: 4px;
  margin: 0 4px;
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: background-color var(--transition);
}

.node-row:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.node-row.is-active {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.chevron {
  width: 12px;
  font-size: 11px;
  color: var(--color-text-muted);
  display: inline-block;
  transform: rotate(0deg);
  transition: transform var(--transition);
  flex-shrink: 0;
}

.chevron.open {
  transform: rotate(90deg);
}

.chevron-spacer {
  width: 12px;
  flex-shrink: 0;
}

.node-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.node-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.git-badge {
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono);
  padding: 0 3px;
  border-radius: 3px;
  flex-shrink: 0;
}

.status-modified { color: var(--git-modified); }
.status-added    { color: var(--git-added); }
.status-deleted  { color: var(--git-deleted); }
</style>
