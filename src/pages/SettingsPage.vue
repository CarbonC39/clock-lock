<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Cloud, Server, Check } from "lucide-vue-next";
import { useSettingsStore } from "../stores/settingsStore";

const router = useRouter();
const store = useSettingsStore();
const saved = ref(false);
const showKey = ref(false);

onMounted(() => store.load());

async function save() {
  await store.save();
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}
</script>

<template>
  <div class="settings-page">
    <!-- Header -->
    <div class="settings-header">
      <button class="back-btn" @click="router.push('/')">
        <ArrowLeft :size="14" />
      </button>
      <h1 class="settings-title">Settings</h1>
    </div>

    <div class="settings-body">
      <!-- ── AI Provider ── -->
      <section class="section">
        <h2 class="section-title">AI Provider</h2>

        <div class="provider-tabs">
          <button
            class="provider-tab"
            :class="{ active: store.settings.provider === 'cloud' }"
            @click="store.switchProvider('cloud')"
          >
            <Cloud :size="14" />
            Cloud (OpenAI-compatible)
          </button>
          <button
            class="provider-tab"
            :class="{ active: store.settings.provider === 'ollama' }"
            @click="store.switchProvider('ollama')"
          >
            <Server :size="14" />
            Local (Ollama)
          </button>
        </div>

        <div class="field-group">
          <label class="field-label">Endpoint URL</label>
          <input
            v-model="store.settings.base_url"
            class="field-input"
            type="url"
            placeholder="https://api.openai.com/v1"
            spellcheck="false"
          />
        </div>

        <div v-if="store.settings.provider === 'cloud'" class="field-group">
          <label class="field-label">API Key</label>
          <div class="input-with-toggle">
            <input
              v-model="store.settings.api_key"
              class="field-input"
              :type="showKey ? 'text' : 'password'"
              placeholder="sk-…"
              spellcheck="false"
            />
            <button class="toggle-key-btn" @click="showKey = !showKey">
              {{ showKey ? "Hide" : "Show" }}
            </button>
          </div>
          <p class="field-hint">Stored locally in the app data folder. Never leaves your machine.</p>
        </div>

        <div class="field-group">
          <label class="field-label">Model</label>
          <input
            v-model="store.settings.model"
            class="field-input"
            type="text"
            :placeholder="store.settings.provider === 'ollama' ? 'llama3.2' : 'gpt-4o-mini'"
            spellcheck="false"
          />
        </div>
      </section>

      <!-- ── Agent Personality ── -->
      <section class="section">
        <h2 class="section-title">Agent Personality</h2>
        <div class="field-group">
          <label class="field-label">Personality prompt</label>
          <textarea
            v-model="store.settings.personality"
            class="field-input field-textarea"
            rows="3"
            placeholder="e.g. encouraging senior developer who keeps things brief"
          />
          <p class="field-hint">Injected into the agent's system prompt to shape its tone and style.</p>
        </div>
      </section>

      <!-- Save button -->
      <div class="save-row">
        <button class="save-btn" @click="save">
          <Check v-if="saved" :size="14" />
          {{ saved ? "Saved!" : "Save Settings" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
  overflow: hidden;
}

/* ── Header ── */
.settings-header {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 52px;
  padding: 0 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition);
}
.back-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.settings-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

/* ── Body ── */
.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px 60px;
  max-width: 560px;
}

/* ── Section ── */
.section {
  margin-bottom: 36px;
}

.section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin: 0 0 16px;
}

/* ── Provider tabs ── */
.provider-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.provider-tab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition);
}

.provider-tab:hover {
  border-color: var(--color-accent-blue);
  color: var(--color-text-primary);
}

.provider-tab.active {
  background: color-mix(in srgb, var(--color-accent-blue) 12%, var(--color-surface));
  border-color: var(--color-accent-blue);
  color: var(--color-accent-blue);
  font-weight: 600;
}

/* ── Fields ── */
.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.field-input {
  padding: 8px 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color var(--transition);
  width: 100%;
}
.field-input:focus { border-color: var(--color-accent-blue); }
.field-input::placeholder { color: var(--color-text-muted); }

.field-textarea {
  resize: vertical;
  line-height: 1.55;
  min-height: 72px;
}

.field-hint {
  font-size: 11.5px;
  color: var(--color-text-muted);
  margin: 0;
  line-height: 1.5;
}

.input-with-toggle {
  display: flex;
  gap: 6px;
}

.input-with-toggle .field-input { flex: 1; }

.toggle-key-btn {
  padding: 0 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
}
.toggle-key-btn:hover {
  border-color: var(--color-accent-blue);
  color: var(--color-accent-blue);
}

/* ── Save ── */
.save-row {
  display: flex;
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 24px;
  font-size: 13px;
  font-weight: 600;
  background: var(--color-accent-blue);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: opacity var(--transition);
}
.save-btn:hover { opacity: 0.85; }
</style>
