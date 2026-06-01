<script setup lang="ts">
import { FolderOpen, FolderTree } from "lucide-vue-next";
import Topbar from "../components/Topbar.vue";
import TodoCard from "../components/TodoCard.vue";
import OverviewCard from "../components/OverviewCard.vue";
import AgentChat from "../components/AgentChat.vue";
import FilesDrawer from "../components/FilesDrawer.vue";
import SettingsDrawer from "../components/SettingsDrawer.vue";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useUiStore } from "../stores/uiStore";

const workspace = useWorkspaceStore();
const ui = useUiStore();
</script>

<template>
  <div class="app-layout">
    <Topbar />

    <div class="workspace-area">
      <!-- Left column: project cards -->
      <aside class="left-stack">
        <template v-if="workspace.path">
          <TodoCard class="todo-slot" />
          <OverviewCard class="overview-slot" />
        </template>

        <!-- No workspace -->
        <button v-else class="open-card" @click="workspace.openWorkspace()">
          <FolderOpen :size="26" />
          <span class="open-title">Open a Workspace</span>
          <span class="open-hint">Pick a project folder to begin</span>
        </button>

        <!-- Files drawer trigger -->
        <button
          class="files-fab"
          :class="{ active: ui.filesOpen }"
          @click="ui.toggleFiles()"
        >
          <FolderTree :size="14" />
          <span>Files</span>
        </button>
      </aside>

      <!-- Center: the hero -->
      <main class="chat-hero">
        <AgentChat />
      </main>
    </div>

    <!-- Overlays -->
    <FilesDrawer />
    <SettingsDrawer />
  </div>
</template>

<style scoped>
.app-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg);
  overflow: hidden;
}

.workspace-area {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}

/* ── Left column ── */
.left-stack {
  width: 248px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.todo-slot {
  flex: 0 1 auto;
  max-height: 45%;
}
.overview-slot {
  flex: 1 1 auto;
  min-height: 0;
}

/* No-workspace card */
.open-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--color-surface);
  border: 1.5px dashed var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  color: var(--color-accent-blue);
  transition: border-color var(--transition), background-color var(--transition);
}
.open-card:hover {
  border-color: color-mix(in srgb, var(--color-accent-blue) 45%, var(--color-border));
  background: color-mix(in srgb, var(--color-accent-blue) 4%, var(--color-surface));
}
.open-title { font-size: 13px; font-weight: 700; color: var(--color-text-primary); }
.open-hint { font-size: 11.5px; color: var(--color-text-muted); }

/* ── Files trigger ── */
.files-fab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex-shrink: 0;
  padding: 9px;
  font-size: 12.5px;
  font-weight: 700;
  font-family: var(--font-sans);
  background: var(--color-surface);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition), border-color var(--transition);
}
.files-fab:hover {
  color: var(--color-accent-teal);
  border-color: color-mix(in srgb, var(--color-accent-teal) 40%, var(--color-border));
}
.files-fab.active {
  color: var(--color-accent-teal);
  background: color-mix(in srgb, var(--color-accent-teal) 10%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-accent-teal) 45%, var(--color-border));
}

/* ── Center hero ── */
.chat-hero {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
</style>
