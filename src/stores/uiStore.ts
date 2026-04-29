import { defineStore } from "pinia";
import { ref } from "vue";

export const useUiStore = defineStore("ui", () => {
  const isDark = ref(localStorage.getItem("theme") === "dark");

  function toggleTheme() {
    isDark.value = !isDark.value;
    localStorage.setItem("theme", isDark.value ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", isDark.value ? "dark" : "light");
  }

  function initTheme() {
    const saved = localStorage.getItem("theme");
    if (!saved) {
      isDark.value = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    document.documentElement.setAttribute("data-theme", isDark.value ? "dark" : "light");
  }

  return { isDark, toggleTheme, initTheme };
});
