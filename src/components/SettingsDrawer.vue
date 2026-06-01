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
  <Transition name="settings-drawer">
    <div v-if="ui.settingsOpen" class="drawer-root">
      <div class="backdrop" @click="close" />
      <aside class="panel">
        <SettingsPage embedded @close="close" />
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-root {
  position: absolute;
  inset: 0;
  z-index: 300;
}

.backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--color-bg) 40%, rgba(0, 0, 0, 0.35));
  backdrop-filter: blur(1.5px);
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
}

/* ── Slide transition ── */
.settings-drawer-enter-active .panel,
.settings-drawer-leave-active .panel { transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1); }
.settings-drawer-enter-from .panel,
.settings-drawer-leave-to .panel { transform: translateX(100%); }

.settings-drawer-enter-active .backdrop,
.settings-drawer-leave-active .backdrop { transition: opacity 0.24s ease; }
.settings-drawer-enter-from .backdrop,
.settings-drawer-leave-to .backdrop { opacity: 0; }
</style>
