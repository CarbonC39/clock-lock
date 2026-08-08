import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";

export interface AgentSettings {
  provider: "cloud" | "ollama";
  base_url: string;
  api_key: string;
  model: string;
  personality: string;
  max_context_messages: number;
  max_tokens: number;
  shell_path: string;
  startup_mode: "window" | "minimized";
  close_behavior: "close" | "hide";
  home_md_mode: "appdata" | "workspace";
  git_tracking_enabled: boolean;
  git_tracking_commit_threshold: number;
  git_tracking_min_interval_minutes: number;
  agent_self_checkin_enabled: boolean;
  agent_self_checkin_idle_minutes: number;
  agent_self_checkin_min_interval_minutes: number;
  idle_enabled: boolean;
  idle_threshold_minutes: number;
}

const CLOUD_DEFAULTS = {
  base_url: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};
const OLLAMA_DEFAULTS = {
  base_url: "http://localhost:11434/v1",
  model: "llama3.2",
};

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AgentSettings>({
    provider: "cloud",
    base_url: CLOUD_DEFAULTS.base_url,
    api_key: "",
    model: CLOUD_DEFAULTS.model,
    personality: "warm and direct work partner who tracks progress and encourages action",
    max_context_messages: 30,
    max_tokens: 4096,
    shell_path: "",
    startup_mode: "window",
    close_behavior: "hide",
    home_md_mode: "appdata",
    git_tracking_enabled: false,
    git_tracking_commit_threshold: 5,
    git_tracking_min_interval_minutes: 10,
    agent_self_checkin_enabled: false,
    agent_self_checkin_idle_minutes: 25,
    agent_self_checkin_min_interval_minutes: 30,
    idle_enabled: true,
    idle_threshold_minutes: 2880,
  });

  const loaded = ref(false);
  // Dirty tracking for the auto-save flow (a non-blocking "Saved" toast).
  const dirty = ref(false);
  const savedAt = ref(0);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function doSave() {
    try {
      await invoke("save_settings", { settings: settings.value });
      dirty.value = false;
      savedAt.value = Date.now();
    } catch { /* keep dirty so the next change retries */ }
  }

  /** Debounced auto-save: settings.json is written ~600ms after the last change. */
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { doSave(); }, 600);
  }

  async function load() {
    if (loaded.value) return;
    try {
      const s = await invoke<AgentSettings>("get_settings");
      // Merge with defaults so new fields don't become undefined
      settings.value = { ...settings.value, ...s };
    } catch {
      // use defaults
    }
    loaded.value = true;
  }

  /** Immediate save (used on app teardown / sensitive fields if ever needed). */
  async function flushSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    await doSave();
  }

  function switchProvider(p: "cloud" | "ollama") {
    settings.value.provider = p;
    if (p === "ollama") {
      settings.value.base_url = OLLAMA_DEFAULTS.base_url;
      settings.value.model = OLLAMA_DEFAULTS.model;
      settings.value.api_key = "";
    } else {
      settings.value.base_url = CLOUD_DEFAULTS.base_url;
      settings.value.model = CLOUD_DEFAULTS.model;
    }
  }

  // Deep watch → auto-save. Gated by `loaded` so load() itself doesn't mark dirty.
  watch(
    () => settings.value,
    () => {
      if (!loaded.value) return;
      dirty.value = true;
      scheduleSave();
    },
    { deep: true }
  );

  return { settings, loaded, dirty, savedAt, load, save: flushSave, flushSave, switchProvider };
});
