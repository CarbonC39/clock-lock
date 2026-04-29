import { defineStore } from "pinia";
import { ref, computed } from "vue";

export type ThemeMode = "light" | "dark" | "system";

export const useUiStore = defineStore("ui", () => {
  const themeMode = ref<ThemeMode>(
    (localStorage.getItem("themeMode") as ThemeMode) ?? "system"
  );

  const _systemDark = ref(window.matchMedia("(prefers-color-scheme: dark)").matches);

  const isDark = computed(() =>
    themeMode.value === "system" ? _systemDark.value : themeMode.value === "dark"
  );

  const autoRestoreWorkspace = ref(localStorage.getItem("autoRestore") !== "false");

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    _systemDark.value = e.matches;
    if (themeMode.value === "system") _apply();
  });

  function _apply() {
    document.documentElement.setAttribute("data-theme", isDark.value ? "dark" : "light");
  }

  function setThemeMode(mode: ThemeMode) {
    themeMode.value = mode;
    localStorage.setItem("themeMode", mode);
    _apply();
  }

  function toggleTheme() {
    setThemeMode(isDark.value ? "light" : "dark");
  }

  function setAutoRestore(v: boolean) {
    autoRestoreWorkspace.value = v;
    localStorage.setItem("autoRestore", v ? "true" : "false");
  }

  function initTheme() {
    _apply();
  }

  return { isDark, themeMode, setThemeMode, toggleTheme, autoRestoreWorkspace, setAutoRestore, initTheme };
});
