import { defineStore } from "pinia";
import { ref } from "vue";

export type AgentState = "idle" | "thinking" | "happy" | "sleepy" | "excited";

export const useAgentStore = defineStore("agent", () => {
  const state = ref<AgentState>("idle");
  const isStreaming = ref(false);

  function setState(s: AgentState) {
    state.value = s;
  }

  return { state, isStreaming, setState };
});
