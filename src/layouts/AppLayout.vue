<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import Topbar from "../components/Topbar.vue";
import FileTree from "../components/FileTree.vue";
import WorkspaceHome from "../components/WorkspaceHome.vue";
import AgentChat from "../components/AgentChat.vue";
import { useWorkspaceStore } from "../stores/workspaceStore";

const workspace = useWorkspaceStore();

function handleOpenWorkspace() {
  workspace.openWorkspace();
}

const LEFT_DEFAULT = 220;
const RIGHT_DEFAULT = 300;
const LEFT_MIN = 180;
const RIGHT_MIN = 280;

const leftWidth = ref(LEFT_DEFAULT);
const rightWidth = ref(RIGHT_DEFAULT);

let dragging: "left" | "right" | null = null;
let startX = 0;
let startWidth = 0;

function onDividerMouseDown(side: "left" | "right", e: MouseEvent) {
  dragging = side;
  startX = e.clientX;
  startWidth = side === "left" ? leftWidth.value : rightWidth.value;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}

function onMouseMove(e: MouseEvent) {
  if (!dragging) return;
  const delta = e.clientX - startX;
  if (dragging === "left") {
    leftWidth.value = Math.max(LEFT_MIN, startWidth + delta);
  } else {
    rightWidth.value = Math.max(RIGHT_MIN, startWidth - delta);
  }
}

function onMouseUp() {
  dragging = null;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
}

onUnmounted(() => {
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
});
</script>

<template>
  <div class="app-layout">
    <Topbar />

    <div class="panels">
      <!-- Left panel -->
      <div class="panel panel-left" :style="{ width: leftWidth + 'px' }">
        <FileTree />
      </div>

      <!-- Left divider -->
      <div class="divider" @mousedown="onDividerMouseDown('left', $event)" />

      <!-- Center panel -->
      <div class="panel panel-center">
        <WorkspaceHome @open-workspace="handleOpenWorkspace" />
      </div>

      <!-- Right divider -->
      <div class="divider" @mousedown="onDividerMouseDown('right', $event)" />

      <!-- Right panel -->
      <div class="panel panel-right" :style="{ width: rightWidth + 'px' }">
        <AgentChat />
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg);
  overflow: hidden;
}

.panels {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-left {
  flex-shrink: 0;
  background-color: var(--color-sidebar-bg);
  border-right: 1px solid var(--color-border);
}

.panel-center {
  flex: 1;
  min-width: 0;
  background-color: var(--color-bg);
}

.panel-right {
  flex-shrink: 0;
  background-color: var(--color-sidebar-bg);
  border-left: 1px solid var(--color-border);
}

.divider {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background-color: transparent;
  transition: background-color var(--transition);
  z-index: 10;
}

.divider:hover {
  background-color: var(--color-accent-blue);
  opacity: 0.4;
}
</style>
