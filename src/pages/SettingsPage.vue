<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowLeft, X, Cloud, Server, Check, Sun, Moon, Monitor,
  Plug, Bot, Palette, SlidersHorizontal,
} from "lucide-vue-next";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import { useSupervisionStore } from "../stores/supervisionStore";

type SettingsTab = "provider" | "agent" | "appearance" | "behavior";
const tab = ref<SettingsTab>("provider");
const TABS: { id: SettingsTab; label: string; icon: any }[] = [
  { id: "provider", label: "Provider", icon: Plug },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "behavior", label: "Behavior", icon: SlidersHorizontal },
];

const props = defineProps<{ embedded?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const store = useSettingsStore();
const ui = useUiStore();
const sv = useSupervisionStore();

const showKey = ref(false);

// ── Saved toast (non-blocking feedback for the debounced auto-save) ──
const showSavedToast = ref(false);
let toastTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => store.savedAt, () => {
  showSavedToast.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { showSavedToast.value = false; }, 1500);
});

// Idle check-in threshold — minutes, covering short to long, with a Custom input.
const IDLE_PRESETS: { label: string; m: number }[] = [
  { label: "30m", m: 30 },
  { label: "1h", m: 60 },
  { label: "4h", m: 240 },
  { label: "1d", m: 1440 },
  { label: "2d", m: 2880 },
];

// Shared "presets + Custom" group helper: tracks whether the current value is a
// preset, the Custom input state, and clamps on commit.
function useCustomPreset(
  presets: number[],
  get: () => number,
  commit: (v: number) => void,
  min: number,
  max: number
) {
  const customOpen = ref(false);
  const customValue = ref(get());
  watch(() => get(), v => { customValue.value = v; });
  const customActive = computed(() => !presets.includes(get()));
  function commitCustom() {
    let v = customValue.value;
    if (isNaN(v) || v < min) v = min;
    if (v > max) v = max;
    customValue.value = v;
    commit(v);
  }
  // reactive() unwraps the refs in templates so `group.customOpen` reads as a bool.
  return reactive({ customOpen, customValue, customActive, commitCustom });
}

const idleGroup = useCustomPreset(
  IDLE_PRESETS.map(p => p.m),
  () => sv.idleMinutes,
  v => sv.setIdleThreshold(v, true),
  1, 20160
);

onMounted(() => store.load());

function goBack() {
  if (props.embedded) emit("close");
  else router.push("/");
}

// ── Git tracking / self check-in: push to backend (persistence handled by the
//    settingsStore deep-watch auto-save) ──

function applyGitTracking() {
  sv.setGitTracking(
    store.settings.git_tracking_enabled,
    store.settings.git_tracking_commit_threshold,
    store.settings.git_tracking_min_interval_minutes
  );
}
function toggleGitTracking() {
  store.settings.git_tracking_enabled = !store.settings.git_tracking_enabled;
  applyGitTracking();
}
function setGitThreshold(v: number) {
  store.settings.git_tracking_commit_threshold = v;
  applyGitTracking();
}
function setGitInterval(v: number) {
  store.settings.git_tracking_min_interval_minutes = v;
  applyGitTracking();
}

function applySelfCheckin() {
  sv.setSelfCheckin(
    store.settings.agent_self_checkin_enabled,
    store.settings.agent_self_checkin_idle_minutes,
    store.settings.agent_self_checkin_min_interval_minutes
  );
}
function toggleSelfCheckin() {
  store.settings.agent_self_checkin_enabled = !store.settings.agent_self_checkin_enabled;
  applySelfCheckin();
}
function setSelfCheckinIdle(v: number) {
  store.settings.agent_self_checkin_idle_minutes = v;
  applySelfCheckin();
}
function setSelfCheckinInterval(v: number) {
  store.settings.agent_self_checkin_min_interval_minutes = v;
  applySelfCheckin();
}

// Custom-value groups for the git / self-audit presets (same UX as the idle one).
const gitThresholdGroup = useCustomPreset(
  [3, 5, 10],
  () => store.settings.git_tracking_commit_threshold,
  setGitThreshold,
  1, 50
);
const gitIntervalGroup = useCustomPreset(
  [10, 30, 60],
  () => store.settings.git_tracking_min_interval_minutes,
  setGitInterval,
  1, 240
);
const selfCheckinIdleGroup = useCustomPreset(
  [15, 25, 45],
  () => store.settings.agent_self_checkin_idle_minutes,
  setSelfCheckinIdle,
  5, 180
);
const selfCheckinIntervalGroup = useCustomPreset(
  [30, 60, 120],
  () => store.settings.agent_self_checkin_min_interval_minutes,
  setSelfCheckinInterval,
  10, 480
);
</script>

<template>
  <div class="settings-page" :class="{ embedded }">
    <!-- Header -->
    <div class="settings-header">
      <button class="back-btn" :title="embedded ? 'Close' : 'Back'" @click="goBack">
        <component :is="embedded ? X : ArrowLeft" :size="15" />
      </button>
      <h1 class="settings-title">Settings</h1>
    </div>

    <!-- Tabs -->
    <div class="settings-tabs">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="settings-tab"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        <component :is="t.icon" :size="14" />
        <span>{{ t.label }}</span>
      </button>
    </div>

    <div class="settings-body">
        <!-- ── Provider ── -->
        <section v-show="tab === 'provider'" class="section">
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

        <!-- ── Appearance ── -->
        <section v-show="tab === 'appearance'" class="section">
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

        <!-- ── Behavior: App + Supervision ── -->
        <template v-if="tab === 'behavior'">
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

            <div class="field-group" style="margin-top: 8px">
              <label class="field-label">Launch mode</label>
              <div class="seg-tabs">
                <button class="seg-tab" :class="{ active: store.settings.startup_mode === 'window' }" @click="store.settings.startup_mode = 'window'">Window</button>
                <button class="seg-tab" :class="{ active: store.settings.startup_mode === 'minimized' }" @click="store.settings.startup_mode = 'minimized'">Minimized</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">Close button</label>
              <div class="seg-tabs">
                <button class="seg-tab" :class="{ active: store.settings.close_behavior === 'close' }" @click="store.settings.close_behavior = 'close'">Exit app</button>
                <button class="seg-tab" :class="{ active: store.settings.close_behavior === 'hide' }" @click="store.settings.close_behavior = 'hide'">Hide to tray</button>        
              </div>
              <p v-if="store.settings.close_behavior === 'close'" class="field-hint">
                Clicking the window close button fully quits the app. Use the tray icon to reopen.
              </p>
              <p v-else class="field-hint">
                Close button hides the window to the tray; the app keeps running. Quit from the tray menu.
              </p>
            </div>

            <div class="field-group">
              <label class="field-label">Home location</label>
              <div class="seg-tabs">
                <button class="seg-tab" :class="{ active: store.settings.home_md_mode === 'appdata' }" @click="store.settings.home_md_mode = 'appdata'">AppData</button>
                <button class="seg-tab" :class="{ active: store.settings.home_md_mode === 'workspace' }" @click="store.settings.home_md_mode = 'workspace'">Workspace</button>        
              </div>
              <p class="field-hint">Workspace mode saves home.md in .clock-lock/</p>
            </div>          </section>

          <!-- Supervision -->
          <section class="section">
            <h2 class="section-title">Check-in</h2>

            <div class="toggle-row">
              <div class="toggle-info">
                <span class="toggle-label">Do Not Disturb</span>
                <span class="toggle-hint">Suppress idle check-ins and notifications.</span>
              </div>
              <button
                class="toggle-btn"
                :class="{ on: sv.dnd }"
                @click="sv.setDnd(!sv.dnd)"
              >
                <span class="toggle-knob" />
              </button>
            </div>

            <div class="toggle-row" style="margin-top: 6px">
              <div class="toggle-info">
                <span class="toggle-label">Idle check-ins</span>
                <span class="toggle-hint">Master switch: whether Clock Lock checks in at all after you've been idle past the threshold below. (For the agent checking its own progress, see <em>Agent self-audit</em> below.)</span>
              </div>
              <button
                class="toggle-btn"
                :class="{ on: sv.idleEnabled }"
                @click="sv.setIdleThreshold(sv.idleMinutes, !sv.idleEnabled)"
              >
                <span class="toggle-knob" />
              </button>
            </div>

            <div class="field-group" style="margin-top: 12px">
              <label class="field-label">Idle check-in threshold</label>
              <div v-if="sv.idleEnabled" class="seg-tabs">
                <button
                  v-for="p in IDLE_PRESETS"
                  :key="p.m"
                  class="seg-tab"
                  :class="{ active: idleGroup.customActive ? false : sv.idleMinutes === p.m }"
                  @click="sv.setIdleThreshold(p.m, true)"
                >{{ p.label }}</button>
                <button
                  class="seg-tab"
                  :class="{ active: idleGroup.customActive }"
                  @click="idleGroup.customOpen = !idleGroup.customOpen"
                >Custom</button>
              </div>
              <span v-else class="field-hint">Check-ins are off. Use DND for a quick mute instead.</span>
              <div v-if="sv.idleEnabled && idleGroup.customOpen" class="custom-input-row">
                <input
                  v-model.number="idleGroup.customValue"
                  type="number"
                  min="1"
                  max="20160"
                  class="field-input custom-input"
                  @blur="idleGroup.commitCustom"
                  @keydown.enter="idleGroup.commitCustom"
                />
                <span class="field-hint">minutes (1 min – 2 weeks)</span>
              </div>
              <p v-if="sv.idleEnabled" class="field-hint">How long you can be idle before the agent gently checks in.</p>
            </div>

            <div class="toggle-row" style="margin-top: 6px">
              <div class="toggle-info">
                <span class="toggle-label">AI-written check-in messages</span>
                <span class="toggle-hint">About the <em>words</em>, not the trigger: occasionally (≤ once a day) let the AI write a fresh line about what you were working on. Off keeps the built-in phrase pool — zero API calls. Idle check-ins still fire either way.</span>
              </div>
              <button
                class="toggle-btn"
                :class="{ on: sv.checkinGrounded }"
                @click="sv.setCheckinGrounded(!sv.checkinGrounded)"
              >
                <span class="toggle-knob" />
              </button>
            </div>
          </section>

          <!-- Git tracking -->
          <section class="section">
            <h2 class="section-title">Git tracking</h2>

            <div class="toggle-row">
              <div class="toggle-info">
                <span class="toggle-label">Track new commits</span>
                <span class="toggle-hint">Watch the repo for new commits and let the agent react to what changed.</span>
              </div>
              <button
                class="toggle-btn"
                :class="{ on: store.settings.git_tracking_enabled }"
                @click="toggleGitTracking"
              >
                <span class="toggle-knob" />
              </button>
            </div>

            <div class="field-group" style="margin-top: 12px">
              <label class="field-label">Commit threshold</label>
              <div class="seg-tabs">
                <button
                  v-for="v in [3, 5, 10]"
                  :key="v"
                  class="seg-tab"
                  :class="{ active: gitThresholdGroup.customActive ? false : store.settings.git_tracking_commit_threshold === v }"
                  @click="setGitThreshold(v)"
                >{{ v }}</button>
                <button
                  class="seg-tab"
                  :class="{ active: gitThresholdGroup.customActive }"
                  @click="gitThresholdGroup.customOpen = !gitThresholdGroup.customOpen"
                >Custom</button>
              </div>
              <div v-if="gitThresholdGroup.customOpen" class="custom-input-row">
                <input
                  v-model.number="gitThresholdGroup.customValue"
                  type="number"
                  min="1"
                  max="50"
                  class="field-input custom-input"
                  @blur="gitThresholdGroup.commitCustom"
                  @keydown.enter="gitThresholdGroup.commitCustom"
                />
                <span class="field-hint">commits (1–50)</span>
              </div>
              <p class="field-hint">How many new commits accumulate before the agent takes a look.</p>
            </div>

            <div class="field-group">
              <label class="field-label">Min interval between reactions</label>
              <div class="seg-tabs">
                <button
                  v-for="v in [10, 30, 60]"
                  :key="v"
                  class="seg-tab"
                  :class="{ active: gitIntervalGroup.customActive ? false : store.settings.git_tracking_min_interval_minutes === v }"
                  @click="setGitInterval(v)"
                >{{ v }} min</button>
                <button
                  class="seg-tab"
                  :class="{ active: gitIntervalGroup.customActive }"
                  @click="gitIntervalGroup.customOpen = !gitIntervalGroup.customOpen"
                >Custom</button>
              </div>
              <div v-if="gitIntervalGroup.customOpen" class="custom-input-row">
                <input
                  v-model.number="gitIntervalGroup.customValue"
                  type="number"
                  min="1"
                  max="240"
                  class="field-input custom-input"
                  @blur="gitIntervalGroup.commitCustom"
                  @keydown.enter="gitIntervalGroup.commitCustom"
                />
                <span class="field-hint">minutes (1–240)</span>
              </div>
            </div>
          </section>

          <!-- Agent self-audit -->
          <section class="section">
            <h2 class="section-title">Agent self-audit on silence</h2>

            <div class="toggle-row">
              <div class="toggle-info">
                <span class="toggle-label">Self-audit on silence</span>
                <span class="toggle-hint">The agent reviews its own progress when it's been quiet — no file changes, no chat, no agent output. (This is about the agent's self-review, not about nudging you — see <em>Check-in</em> above.)</span>
              </div>
              <button
                class="toggle-btn"
                :class="{ on: store.settings.agent_self_checkin_enabled }"
                @click="toggleSelfCheckin"
              >
                <span class="toggle-knob" />
              </button>
            </div>

            <div class="field-group" style="margin-top: 12px">
              <label class="field-label">Silence threshold</label>
              <div class="seg-tabs">
                <button
                  v-for="v in [15, 25, 45]"
                  :key="v"
                  class="seg-tab"
                  :class="{ active: selfCheckinIdleGroup.customActive ? false : store.settings.agent_self_checkin_idle_minutes === v }"
                  @click="setSelfCheckinIdle(v)"
                >{{ v }} min</button>
                <button
                  class="seg-tab"
                  :class="{ active: selfCheckinIdleGroup.customActive }"
                  @click="selfCheckinIdleGroup.customOpen = !selfCheckinIdleGroup.customOpen"
                >Custom</button>
              </div>
              <div v-if="selfCheckinIdleGroup.customOpen" class="custom-input-row">
                <input
                  v-model.number="selfCheckinIdleGroup.customValue"
                  type="number"
                  min="5"
                  max="180"
                  class="field-input custom-input"
                  @blur="selfCheckinIdleGroup.commitCustom"
                  @keydown.enter="selfCheckinIdleGroup.commitCustom"
                />
                <span class="field-hint">minutes (5–180)</span>
              </div>
              <p class="field-hint">No file changes, no user chat, and no agent output for this long triggers a check-in.</p>
            </div>

            <div class="field-group">
              <label class="field-label">Min interval between check-ins</label>
              <div class="seg-tabs">
                <button
                  v-for="v in [30, 60, 120]"
                  :key="v"
                  class="seg-tab"
                  :class="{ active: selfCheckinIntervalGroup.customActive ? false : store.settings.agent_self_checkin_min_interval_minutes === v }"
                  @click="setSelfCheckinInterval(v)"
                >{{ v }} min</button>
                <button
                  class="seg-tab"
                  :class="{ active: selfCheckinIntervalGroup.customActive }"
                  @click="selfCheckinIntervalGroup.customOpen = !selfCheckinIntervalGroup.customOpen"
                >Custom</button>
              </div>
              <div v-if="selfCheckinIntervalGroup.customOpen" class="custom-input-row">
                <input
                  v-model.number="selfCheckinIntervalGroup.customValue"
                  type="number"
                  min="10"
                  max="480"
                  class="field-input custom-input"
                  @blur="selfCheckinIntervalGroup.commitCustom"
                  @keydown.enter="selfCheckinIntervalGroup.commitCustom"
                />
                <span class="field-hint">minutes (10–480)</span>
              </div>
            </div>
          </section>
        </template>

        <!-- ── Agent ── -->
        <section v-show="tab === 'agent'" class="section">
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
              @blur="(e) => { const v = (e.target as HTMLInputElement).valueAsNumber; if (isNaN(v) || v < 5) store.settings.max_context_messages = 30 }"
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
              @blur="(e) => { const v = (e.target as HTMLInputElement).valueAsNumber; if (isNaN(v) || v < 256) store.settings.max_tokens = 4096 }"
            />
            <p class="field-hint">Token budget per response.</p>
          </div>

          <div class="field-group field-half">
            <label class="field-label">Shell path</label>
            <input
              v-model="store.settings.shell_path"
              class="field-input"
              type="text"
              placeholder="Auto-detect (cmd / sh)"
              spellcheck="false"
            />
            <p class="field-hint">Shell executable for running bash blocks. On Windows, set to e.g. <code>C:\Program Files\Git\bin\bash.exe</code> for Git Bash.</p>
          </div>

          <div class="field-group field-half" />
        </div>
      </section>
    </div>

    <!-- Saved toast (non-blocking feedback for the debounced auto-save) -->
    <Transition name="saved-toast">
      <div v-if="showSavedToast" class="saved-toast">
        <Check :size="13" /> Saved
      </div>
    </Transition>
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
.settings-page.embedded { background: var(--color-surface); }
.settings-page.embedded .settings-header { padding: 0 18px; height: 48px; }

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

/* ── Tabs ── */
.settings-tabs {
  display: flex;
  gap: 2px;
  padding: 8px 14px 0;
  border-bottom: 1px solid var(--color-border-soft);
  flex-shrink: 0;
  overflow-x: auto;
}

.settings-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 12.5px;
  font-weight: 700;
  font-family: var(--font-sans);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--transition), border-color var(--transition);
}
.settings-tab:hover { color: var(--color-text-secondary); }
.settings-tab.active {
  color: var(--color-accent-blue);
  border-bottom-color: var(--color-accent-blue);
}

/* ── Body ── */
.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px 60px;
}

.settings-page.embedded .settings-body { padding: 22px 22px 60px; }

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
  flex-wrap: wrap;
  gap: 16px;
}

.field-half {
  flex: 1 1 180px;
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

/* ── Seg-tabs (Launch mode / Close button) ── */
.seg-tabs {
  display: flex;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 3px;
  gap: 2px;
}

.seg-tab {
  flex: 1;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  background: none;
  border: none;
  border-radius: calc(var(--radius-md) - 2px);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition);
  white-space: nowrap;
  text-align: center;
}

.seg-tab:hover { color: var(--color-text-primary); }

.seg-tab.active {
  background: var(--color-bg);
  color: var(--color-accent-blue);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.10);
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

.custom-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.custom-input {
  width: 120px;
  flex-shrink: 0;
}

/* ── Saved toast ── */
.saved-toast {
  position: fixed;
  top: 16px;
  right: 24px;
  z-index: 400;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 99px;
  box-shadow: var(--shadow-sm);
  pointer-events: none;
}
.saved-toast svg { color: var(--color-accent-green); }

.saved-toast-enter-active,
.saved-toast-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.saved-toast-enter-from,
.saved-toast-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
