import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "./workspaceStore";
import { useSettingsStore } from "./settingsStore";

export type AgentState = "idle" | "thinking" | "happy" | "sleepy" | "excited";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system-note";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: string;
}

export const useAgentStore = defineStore("agent", () => {
  const messages = ref<ChatMessage[]>([]);
  const state = ref<AgentState>("idle");
  const isBusy = ref(false);

  function setState(s: AgentState) { state.value = s; }

  function buildSystemPrompt(): string {
    const workspace = useWorkspaceStore();
    const settings = useSettingsStore();
    const personality = settings.settings.personality || "helpful and encouraging senior developer";

    let prompt = `You are an AI developer companion integrated into Clock Lock.
Your personality: ${personality}.

Guidelines:
- Be concise and practical. Aim for short responses unless depth is needed.
- When suggesting shell commands, wrap them in \`\`\`bash code blocks so they can be run directly.
- Critique the problem or the code — never the developer.
- Add a brief word of encouragement with technical feedback.
- If proposing file edits, describe them clearly.`;

    if (workspace.homeMdContent?.trim()) {
      prompt += `\n\n## Project context\n${workspace.homeMdContent.slice(0, 3000)}`;
    }

    return prompt;
  }

  function buildApiMessages() {
    const settings = useSettingsStore();
    const history = messages.value
      .filter(m => m.role === "user" || m.role === "assistant")
      .filter(m => !m.isStreaming && !m.error)
      .slice(-settings.settings.max_context_messages)
      .map(m => ({ role: m.role, content: m.content }));

    return [
      { role: "system", content: buildSystemPrompt() },
      ...history,
    ];
  }

  async function sendMessage(text: string) {
    if (!text.trim() || isBusy.value) return;

    const settings = useSettingsStore();
    if (!settings.settings.base_url) {
      pushNote("Configure the AI provider in Settings first.");
      return;
    }

    // Add user message
    messages.value.push({
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    });

    // Add placeholder assistant message
    const assistantId = crypto.randomUUID();
    messages.value.push({
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
    });

    isBusy.value = true;
    state.value = "thinking";

    const assistant = messages.value.find(m => m.id === assistantId)!;

    // Subscribe to streaming chunks
    const unlistenChunk = await listen<{ id: string; content: string }>(
      "chat-chunk",
      (event) => {
        if (event.payload.id === assistantId) {
          assistant.content += event.payload.content;
        }
      }
    );

    const unlistenError = await listen<{ id: string; error: string }>(
      "chat-error",
      (event) => {
        if (event.payload.id === assistantId) {
          assistant.error = event.payload.error;
          assistant.content = event.payload.error;
        }
      }
    );

    try {
      await invoke("chat_stream", {
        msgId: assistantId,
        messages: buildApiMessages(),
        baseUrl: settings.settings.base_url,
        apiKey: settings.settings.api_key,
        model: settings.settings.model,
        maxTokens: settings.settings.max_tokens,
      });
      state.value = "happy";
      setTimeout(() => { if (state.value === "happy") state.value = "idle"; }, 4000);
    } catch (e) {
      assistant.content = assistant.content || `Error: ${e}`;
      assistant.error = String(e);
      state.value = "idle";
    } finally {
      assistant.isStreaming = false;
      isBusy.value = false;
      unlistenChunk();
      unlistenError();
    }
  }

  function pushNote(text: string) {
    messages.value.push({
      id: crypto.randomUUID(),
      role: "system-note",
      content: text,
      timestamp: Date.now(),
    });
  }

  function clear() {
    messages.value = [];
    state.value = "idle";
    isBusy.value = false;
  }

  return { messages, state, isBusy, setState, sendMessage, clear };
});
