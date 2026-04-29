<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Cloud, Server, Check, Sun, Moon, Monitor } from "lucide-vue-next";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";

const router = useRouter();
const store = useSettingsStore();
const ui = useUiStore();

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
      <!-- ── Top grid: Provider (left) + Appearance & Behavior (right) ── -->
      <div class="top-grid">

        <!-- Left: AI Provider -->
        <section class="section">
          <h2 class="section-title">AI Provider</h2>

          <div class="field-group">
            <label class="field-label">Provider</label>
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
            <p class="field-hint">Stored locally in app data. Never leaves your machine.</p>
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

        <!-- Right: Appearance + App Behavior -->
        <div class="right-col">
          <!-- Appearance -->
          <section class="section">
            <h2 class="section-title">Appearance</h2>

            <div class="field-group">
              <label class="field-label">Theme</label>
              <div class="theme-tabs">
                <button
                  class="theme-tab"
                  :class="{ active: ui.themeMode === 'light' }"
                  @click="ui.setThemeMode('light')"
                >
                  <Sun :size="13" />
                  Light
                </button>
                <button
                  class="theme-tab"
                  :class="{ active: ui.themeMode === 'system' }"
                  @click="ui.setThemeMode('system')"
                >
                  <Monitor :size="13" />
                  System
                </button>
                <button
                  class="theme-tab"
                  :class="{ active: ui.themeMode === 'dark' }"
                  @click="ui.setThemeMode('dark')"
                >
                  <Moon :size="13" />
                  Dark
                </button>
              </div>
            </div>
          </section>

          <!-- App Behavior -->
          <section class="section">
            <h2 class="section-title">App Behavior</h2>

            <div class="toggle-row">
              <div class="toggle-info">
                <span class="toggle-label">Auto-restore last workspace</span>
                <span class="toggle-hint">Re-open the previous project folder on startup.</span>
              </div>
              <button
                class="toggle-btn"
                :class="{ on: ui.autoRestoreWorkspace }"
                @click="ui.setAutoRestore(!ui.autoRestoreWorkspace)"
              >
                <span class="toggle-knob" />
              </button>
            </div>
          </section>
        </div>
      </div>

      <!-- ── Agent (full width) ── -->
      <section class="section section-full">
        <h2 class="section-title">Agent</h2>

        <div class="field-group">
          <label class="field-label">Personality prompt</label>
          <textarea
            v-model="store.settings.personality"
            class="field-input field-textarea"
            rows="3"
            placeholder="e.g. encouraging senior developer who keeps things brief"
          />
          <p class="field-hint">Injected into the system prompt to shape the agent's tone and style.</p>
        </div>

        <div class="field-row">
          <div class="field-group field-half">
            <label class="field-label">Max context messages</label>
            <input
              v-model.number="store.settings.max_context_messages"
              class="field-input"
              type="number"
              min="5"
              max="200"
              step="5"
            />
            <p class="field-hint">Past messages included per request.</p>
          </div>

          <div class="field-group field-half">
            <label class="field-label">Max response tokens</label>
            <input
              v-model.number="store.settings.max_tokens"
              class="field-input"
              type="number"
              min="256"
              max="32000"
              step="256"
            />
            <p class="field-hint">Token budget per response.</p>
          </div>

          <div class="field-group field-half" />
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
  padding: 0 32px;
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
  transition: background-color var(--transition), color var(--transition);
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
  padding: 32px 40px 60px;
}

/* ── Top 2-column grid ── */
.top-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 48px;
  margin-bottom: 4px;
}

.right-col {
  display: flex;
  flex-direction: column;
}

/* ── Section ── */
.section {
  margin-bottom: 32px;
}

.section-full {
  /* spans naturally outside the top-grid */
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin: 0 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border-soft, var(--color-border));
}

/* ── Theme tabs ── */
.theme-tabs {
  display: flex;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 3px;
  gap: 2px;
}

.theme-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  background: none;
  border: none;
  border-radius: calc(var(--radius-md) - 2px);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition);
  white-space: nowrap;
}

.theme-tab:hover { color: var(--color-text-primary); }

.theme-tab.active {
  background: var(--color-bg);
  color: var(--color-accent-blue);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.10);
}

/* ── Provider tabs ── */
.provider-tabs {
  display: flex;
  gap: 8px;
}

.provider-tab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background-color var(--transition);
  white-space: nowrap;
}

.provider-tab:hover {
  border-color: var(--color-accent-blue);
  color: var(--color-text-primary);
}

.provider-tab.active {
  background: color-mix(in srgb, var(--color-accent-blue) 10%, var(--color-surface));
  border-color: var(--color-accent-blue);
  color: var(--color-accent-blue);
}

/* ── Fields ── */
.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.field-row {
  display: flex;
  gap: 16px;
}

.field-half {
  flex: 1;
  min-width: 0;
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
  box-sizing: border-box;
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
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition);
  white-space: nowrap;
}
.toggle-key-btn:hover {
  border-color: var(--color-accent-blue);
  color: var(--color-accent-blue);
}

/* ── Toggle row ── */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.toggle-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.toggle-hint {
  font-size: 11.5px;
  color: var(--color-text-muted);
}

.toggle-btn {
  flex-shrink: 0;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: none;
  background: var(--color-border);
  cursor: pointer;
  position: relative;
  transition: background-color var(--transition);
}

.toggle-btn.on { background: var(--color-accent-blue); }

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--transition);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-btn.on .toggle-knob { transform: translateX(18px); }

/* ── Save ── */
.save-row {
  display: flex;
  padding-top: 4px;
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 28px;
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
