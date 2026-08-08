import { defineStore } from "pinia";
import { ref } from "vue";
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
    close_behavior: "close",
    home_md_mode: "appdata",
    git_tracking_enabled: false,
    git_tracking_commit_threshold: 5,
    git_tracking_min_interval_minutes: 10,
    agent_self_checkin_enabled: false,
    agent_self_checkin_idle_minutes: 25,
    agent_self_checkin_min_interval_minutes: 30,
  });

  const loaded = ref(false);

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

  async function save() {
    await invoke("save_settings", { settings: settings.value });
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

  return { settings, loaded, load, save, switchProvider };
});
