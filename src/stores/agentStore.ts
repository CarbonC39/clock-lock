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
  const convId = ref<string | null>(null);

  // ── Conversation lifecycle ──

  async function loadConversation() {
    const workspace = useWorkspaceStore();
    if (!workspace.hash) return;

    convId.value = await invoke<string>("ensure_conversation", {
      workspaceHash: workspace.hash,
    });

    const records = await invoke<
      { id: number; role: string; content: string }[]
    >("load_messages", {
      workspaceHash: workspace.hash,
      convId: convId.value,
      limit: 100,
    });

    messages.value = records.map((r) => ({
      id: `db-${r.id}`,
      role: r.role as ChatMessage["role"],
      content: r.content,
      timestamp: Date.now(),
    }));
  }

  async function persistMessage(msg: ChatMessage) {
    const workspace = useWorkspaceStore();
    if (!workspace.hash || !convId.value) return;
    await invoke("save_message", {
      workspaceHash: workspace.hash,
      convId: convId.value,
      role: msg.role,
      content: msg.content,
    }).catch(console.warn);
  }

  // ── System prompt (enhanced with M5 context) ──

  async function buildSystemPrompt(): Promise<{
    role: string;
    content: string;
  }> {
    const workspace = useWorkspaceStore();
    const settings = useSettingsStore();
    const personality =
      settings.settings.personality || "helpful and encouraging senior developer";

    let prompt = `You are an AI developer companion integrated into Clock Lock.
Your personality: ${personality}.

Guidelines:
- Be concise and practical. Aim for short responses unless depth is needed.
- When suggesting shell commands, wrap them in \`\`\`bash code blocks so they can be run directly.
- When proposing file edits, wrap them in \`\`\`diff code blocks with --- a/ and +++ b/ headers.
- Critique the problem or the code — never the developer.
- Add a brief word of encouragement with technical feedback.`;

    // Inject project context (home.md)
    if (workspace.homeMdContent?.trim()) {
      prompt += `\n\n## Project context\n${workspace.homeMdContent.slice(0, 4000)}`;
    }

    // Inject git status
    if (workspace.path) {
      try {
        const git = await invoke<{
          is_repo: boolean;
          branch?: string;
          modified: number;
          added: number;
          deleted: number;
          untracked: number;
        }>("get_git_status", { workspacePath: workspace.path });
        if (git.is_repo) {
          prompt += `\n\n## Git status\nBranch: ${git.branch ?? "HEAD"}
Modified: ${git.modified} | Added: ${git.added} | Deleted: ${git.deleted} | Untracked: ${git.untracked}`;
        }
      } catch {
        // ignore
      }
    }

    // Inject relevant past messages (FTS search against recent user query)
    if (workspace.hash && messages.value.length > 0) {
      try {
        const lastUserMsg = [...messages.value]
          .reverse()
          .find((m) => m.role === "user");
        if (lastUserMsg) {
          const results = await invoke<
            { id: number; role: string; content: string }[]
          >("search_messages", {
            workspaceHash: workspace.hash,
            query: lastUserMsg.content.slice(0, 200),
            limit: 3,
          });
          if (results.length > 0) {
            prompt += "\n\n## Related past context";
            for (const r of results) {
              prompt += `\n[${r.role}]: ${r.content.slice(0, 500)}`;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return { role: "system", content: prompt };
  }

  // ── Chat ──

  async function sendMessage(text: string) {
    if (!text.trim() || isBusy.value) return;

    const settings = useSettingsStore();
    if (!settings.settings.base_url) {
      pushNote("Configure the AI provider in Settings first.");
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };
    messages.value.push(userMsg);
    persistMessage(userMsg);

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
    };
    messages.value.push(assistantMsg);

    isBusy.value = true;
    state.value = "thinking";

    const assistant = messages.value.find((m) => m.id === assistantId)!;

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
      const systemMsg = await buildSystemPrompt();
      const history = messages.value
        .filter((m) => m.role === "user" || m.role === "assistant")
        .filter((m) => !m.isStreaming && !m.error && m.id !== assistantId)
        .slice(-settings.settings.max_context_messages)
        .map((m) => ({ role: m.role, content: m.content }));

      await invoke("chat_stream", {
        msgId: assistantId,
        messages: [systemMsg, ...history],
        baseUrl: settings.settings.base_url,
        apiKey: settings.settings.api_key,
        model: settings.settings.model,
        maxTokens: settings.settings.max_tokens,
      });

      persistMessage({
        ...assistant,
        id: assistantId,
        timestamp: Date.now(),
      });
      state.value = "happy";
      setTimeout(() => {
        if (state.value === "happy") state.value = "idle";
      }, 4000);
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
    const note: ChatMessage = {
      id: crypto.randomUUID(),
      role: "system-note",
      content: text,
      timestamp: Date.now(),
    };
    messages.value.push(note);
  }

  function clear() {
    const workspace = useWorkspaceStore();
    if (workspace.hash && convId.value) {
      invoke("clear_conversation", {
        workspaceHash: workspace.hash,
        convId: convId.value,
      }).catch(console.warn);
    }
    messages.value = [];
    state.value = "idle";
    isBusy.value = false;
  }

  return { messages, state, isBusy, sendMessage, pushNote, clear, loadConversation };
});
