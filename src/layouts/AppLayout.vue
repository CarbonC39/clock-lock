<script setup lang="ts">
import { FolderOpen } from "lucide-vue-next";
import Topbar from "../components/Topbar.vue";
import TodoCard from "../components/TodoCard.vue";
import OverviewCard from "../components/OverviewCard.vue";
import AgentChat from "../components/AgentChat.vue";
import FilesPane from "../components/FilesPane.vue";
import SettingsDrawer from "../components/SettingsDrawer.vue";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useUiStore } from "../stores/uiStore";

const workspace = useWorkspaceStore();
const ui = useUiStore();
</script>

<template>
  <div class="app-layout">
    <Topbar />

    <main class="tab-content">
      <!-- Tab 1: Chat -->
      <AgentChat v-show="ui.currentTab === 'chat'" />

      <!-- Tab 2: Files -->
      <FilesPane v-show="ui.currentTab === 'files'" />

      <!-- Tab 3: Notes (Todos left 280px, Overview right flex:1) -->
      <div v-show="ui.currentTab === 'notes'" class="notes-tab">
        <template v-if="workspace.path">
          <TodoCard class="notes-todos" />
          <OverviewCard class="notes-overview" />
        </template>
        <button v-else class="open-card" @click="workspace.openWorkspace()">
          <FolderOpen :size="26" />
          <span>Open a Workspace</span>
        </button>
      </div>

      <!-- No workspace overlay for Chat / Files tabs -->
      <button
        v-if="!workspace.path && ui.currentTab !== 'notes'"
        class="open-card"
        @click="workspace.openWorkspace()"
      >
        <FolderOpen :size="26" />
        <span>Open a Workspace</span>
      </button>
    </main>

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

.tab-content {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

/* Each tab panel fills the content area, touching the topbar bottom so the
   active tab (in the topbar) fuses with the panel. height:auto lets top/bottom
   define the size (components' height:100% would ignore bottom and overflow). */
.tab-content :deep(.agent-chat),
.tab-content :deep(.files-pane),
.tab-content :deep(.notes-tab) {
  position: absolute;
  inset: 0 12px 12px;
  height: auto;
}

/* ── Notes tab: left TodoCard + right OverviewCard ── */
.notes-tab {
  display: flex;
  gap: 12px;
}
.notes-todos {
  width: 280px;
  flex-shrink: 0;
}
.notes-overview {
  flex: 1;
  min-width: 0;
}

/* No-workspace card (overlay) */
.open-card {
  position: absolute;
  inset: 0 12px 12px;
  z-index: 5;
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
</style>
