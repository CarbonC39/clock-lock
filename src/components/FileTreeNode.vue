<script setup lang="ts">
import { ref, computed, type Component } from "vue";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  Settings,
  Globe,
  Database,
  Package,
  FileJson,
} from "lucide-vue-next";
import type { FileNode } from "../stores/workspaceStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

defineOptions({ name: "FileTreeNode" });

const props = defineProps<{ node: FileNode; depth?: number }>();

const workspace = useWorkspaceStore();
const isOpen = ref(!props.node.name.startsWith(".") && (props.depth ?? 0) === 0);

function toggle() {
  if (props.node.is_dir) isOpen.value = !isOpen.value;
}

function select() {
  if (!props.node.is_dir) workspace.selectFile(props.node.path);
}

const fileIconComponent = computed<Component>(() => {
  if (props.node.is_dir) return isOpen.value ? FolderOpen : Folder;
  const ext = props.node.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, Component> = {
    md: FileText, txt: FileText,
    ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode,
    vue: FileCode, svelte: FileCode,
    rs: FileCode, py: FileCode, go: FileCode, rb: FileCode,
    c: FileCode, cpp: FileCode, h: FileCode, cs: FileCode, java: FileCode,
    sh: FileCode, bash: FileCode, zsh: FileCode, fish: FileCode,
    html: Globe, css: FileCode, scss: FileCode,
    json: FileJson, yaml: File, yml: File,
    toml: Settings, ini: Settings, env: Settings,
    png: FileImage, jpg: FileImage, jpeg: FileImage,
    gif: FileImage, svg: FileImage, webp: FileImage, ico: FileImage,
    mp4: FileVideo, webm: FileVideo, mov: FileVideo,
    mp3: FileAudio, wav: FileAudio, ogg: FileAudio,
    sqlite: Database, sqlite3: Database, db: Database,
    zip: Package, tar: Package, gz: Package,
    lock: Settings,
  };
  return map[ext] ?? File;
});

const iconColor = computed<string>(() => {
  if (props.node.is_dir) return "var(--color-accent-yellow)";
  const ext = props.node.name.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx"].includes(ext)) return "var(--color-accent-blue)";
  if (["vue", "svelte"].includes(ext)) return "var(--color-accent-green)";
  if (["rs"].includes(ext)) return "var(--color-accent-red)";
  if (["md", "txt"].includes(ext)) return "var(--color-accent-purple)";
  if (["py"].includes(ext)) return "var(--color-accent-teal)";
  if (["json", "toml", "yaml", "yml"].includes(ext)) return "var(--color-accent-yellow)";
  if (["png","jpg","jpeg","gif","svg","webp","ico"].includes(ext)) return "var(--color-accent-pink)";
  if (["html"].includes(ext)) return "var(--color-accent-red)";
  if (["css","scss"].includes(ext)) return "var(--color-accent-pink)";
  return "var(--color-text-muted)";
});

const gitClass: Record<string, string> = {
  M: "git-M",
  A: "git-A",
  D: "git-D",
};
</script>

<template>
  <div class="tree-node">
    <div
      class="node-row"
      :class="[
        node.is_dir ? 'is-dir' : 'is-file',
        workspace.selectedFilePath === node.path ? 'is-active' : '',
      ]"
      :style="{ paddingLeft: `${(depth ?? 0) * 14 + 6}px` }"
      @click="node.is_dir ? toggle() : select()"
    >
      <ChevronRight
        v-if="node.is_dir"
        :size="11"
        class="chevron"
        :class="{ open: isOpen }"
      />
      <span v-else class="chevron-spacer" />

      <component
        :is="fileIconComponent"
        :size="13"
        class="node-icon"
        :style="{ color: iconColor }"
      />

      <span class="node-name">{{ node.name }}</span>

      <span
        v-if="node.git_status"
        class="git-badge"
        :class="gitClass[node.git_status] ?? 'git-M'"
      >{{ node.git_status }}</span>
    </div>

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

<style scoped>
.tree-node { user-select: none; }

.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  margin: 0 4px;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  transition: background-color var(--transition), color var(--transition);
}

.node-row:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.node-row.is-active {
  background-color: var(--color-accent-blue-dim);
  color: var(--color-accent-blue);
}

[data-theme="dark"] .node-row.is-active {
  background-color: var(--color-accent-blue-dim);
  color: var(--color-accent-blue);
}

.chevron {
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform var(--transition), color var(--transition);
}

.chevron.open { transform: rotate(90deg); }

.chevron-spacer { width: 11px; flex-shrink: 0; }

.node-icon { flex-shrink: 0; }

.node-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.is-dir .node-name { font-weight: 600; }

.git-badge {
  font-size: 9px;
  font-weight: 700;
  font-family: var(--font-mono);
  padding: 0 4px;
  border-radius: 3px;
  flex-shrink: 0;
  opacity: 0.9;
}

.git-M { color: var(--git-modified); background: color-mix(in srgb, var(--git-modified) 15%, transparent); }
.git-A { color: var(--git-added);    background: color-mix(in srgb, var(--git-added)    15%, transparent); }
.git-D { color: var(--git-deleted);  background: color-mix(in srgb, var(--git-deleted)  15%, transparent); }
</style>
