<script setup lang="ts">
import { watch, onUnmounted } from "vue";
import { useUiStore } from "../stores/uiStore";
import SettingsPage from "../pages/SettingsPage.vue";

const ui = useUiStore();

function close() {
  ui.setSettings(false);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}

watch(() => ui.settingsOpen, (open) => {
  if (open) window.addEventListener("keydown", onKey);
  else window.removeEventListener("keydown", onKey);
});

onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Transition name="settings-drawer" :duration="{ enter: 300, leave: 240 }">
    <div v-if="ui.settingsOpen" class="drawer-root">
      <aside class="panel">
        <SettingsPage embedded @close="close" />
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
/* Non-blocking: root passes pointer events through to the chat behind; only the
   panel is interactive. Closes via the header X or Esc (no dimming backdrop). */
.drawer-root {
  position: absolute;
  inset: 0;
  z-index: 300;
  pointer-events: none;
}

.panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(500px, 90vw);
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  pointer-events: auto;
}

/* ── Slide transition ── */
.settings-drawer-enter-active .panel { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.settings-drawer-leave-active .panel { transition: transform 0.24s cubic-bezier(0.4, 0, 1, 1); }
.settings-drawer-enter-from .panel,
.settings-drawer-leave-to .panel { transform: translateX(101%); }

</style>
