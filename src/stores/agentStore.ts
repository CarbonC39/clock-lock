import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "./workspaceStore";
import { useSettingsStore } from "./settingsStore";
import { useSupervisionStore } from "./supervisionStore";

export type AgentState = "idle" | "thinking" | "happy" | "sleepy" | "excited";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system-note" | "tool";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: string;
  toolName?: string;
  toolResult?: string;
}

// ── Slash commands ──
const SLASH_COMMANDS: Record<string, string> = {
  "/status": "status",
  "/remind": "remind", 
  "/review": "review",
  "/scan": "scan-old",
  "/summarize": "summarize",
  "/focus": "focus",
  "/help": "help",
};

export function getSlashCommands() {
  return Object.entries(SLASH_COMMANDS).map(([cmd, id]) => ({ cmd, id }));
}

function expandSlashCommand(cmd: string, workspace: ReturnType<typeof useWorkspaceStore>): string | null {
  switch (cmd) {
    case "/status":
      return `Give a brief status update. Read home.md to check progress, then check git status. Summarize what's been done and what's pending.`;
    case "/remind":
      return `Read home.md and list all unchecked tasks from the Progress section. For each one, give a one-sentence nudge.`;
    case "/review":
      return `Review recent git changes. Read any modified files that look important, then give a concise code review with specific suggestions.`;
    case "/scan": {
      if (!workspace.path) return null;
      const fileList = workspace.fileTree
        .map((n) => `${n.is_dir ? "📁" : "📄"} ${n.name}${n.git_status ? ` [${n.git_status}]` : ""}`)
        .slice(0, 50).join("\n");
      workspace.isNewProject = false;
      return `Scan this project and write home.md using tools. File tree:\n${fileList}\n\n1. Use <tool>read_file</tool> on a few key files (package.json, main entry, config files)\n2. Use <tool>write_home_md</tool> to save this template:\n\n# Overview\n[2-3 sentences about the project]\n\n# Notes\n[Any observations about tools, structure, interesting files]\n\n# Progress\n- [ ] Review the codebase\n- [ ] Set up the development environment`;
    }
    case "/summarize":
      return `Summarize our conversation so far into a compact paragraph. Include key decisions, what we've done, and what's pending. This summary will replace older messages to save context space.`;
    case "/focus":
      const sv = useSupervisionStore();
      sv.setDnd(!sv.dnd);
      return null;
    case "/help":
      return null;
    default:
      return null;
  }
}

export const useAgentStore = defineStore("agent", () => {
  const messages = ref<ChatMessage[]>([]);
  const state = ref<AgentState>("idle");
  const isBusy = ref(false);
  const convId = ref<string | null>(null);
  let happyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const MAX_TOOL_ROUNDS = 5;

  // ── Conversation lifecycle ──

  async function loadConversation() {
    const workspace = useWorkspaceStore();
    if (!workspace.hash) return;

    convId.value = await invoke<string>("ensure_conversation", {
      workspaceHash: workspace.hash,
    });

    const records = await invoke<{ id: number; role: string; content: string; created_at?: number }[]>(
      "load_messages",
      { workspaceHash: workspace.hash, convId: convId.value, limit: 100 }
    );

    messages.value = records.map((r, i) => ({
      id: `db-${r.id}`,
      role: r.role as ChatMessage["role"],
      content: r.content,
      timestamp: r.created_at ? r.created_at * 1000 : Date.now() + i,
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

  // ── System prompt (tools + context) ──

  async function buildSystemPrompt(): Promise<{ role: string; content: string }> {
    const workspace = useWorkspaceStore();
    const settings = useSettingsStore();
    const personality = settings.settings.personality || "helpful and encouraging senior developer";

    let prompt = `You are an AI developer companion integrated into Clock Lock.
Your personality: ${personality}.

**Tools** — You can use these tools by writing tool blocks in your response:
<tool>read_file</tool>
<args>{"path": "relative/path/to/file"}</args>

<tool>list_dir</tool>
<args>{"workspace_path": "${workspace.path || ""}"}</args>

<tool>search_files</tool>
<args>{"workspace_path": "${workspace.path || ""}", "pattern": "filename or keyword", "limit": 20}</args>

<tool>read_home_md</tool>
<args>{"workspace_path": "${workspace.path || ""}"}</args>

<tool>write_home_md</tool>
<args>{"workspace_path": "${workspace.path || ""}", "content": "full markdown"}</args>

<tool>append_section</tool>
<args>{"workspace_path": "${workspace.path || ""}", "heading": "Notes", "text": "- [ ] new item"}</args>

<tool>get_git_status</tool>
<args>{"workspace_path": "${workspace.path || ""}"}</args>

<tool>search_memory</tool>
<args>{"workspace_hash": "${workspace.hash || ""}", "query": "search terms", "limit": 5}</args>

<tool>run_bash</tool>
<args>{"workspace_path": "${workspace.path || ""}", "command": "ls -la", "shell_path": "${settings.settings.shell_path || ""}"}</args>

When you need to see a file, use <tool>read_file</tool>. The result will be given to you in the next message.
When the user asks about project status or tasks, use <tool>read_home_md</tool> first.
When updating home.md, use <tool>write_home_md</tool> (full replacement) or <tool>append_section</tool> (add to a heading).
Use tools proactively — don't guess when you can look it up.

Guidelines:
- Be concise and practical.
- When suggesting shell commands, wrap them in \`\`\`bash code blocks.
- When proposing file edits, wrap them in \`\`\`diff code blocks with --- a/ and +++ b/ headers.
- Critique the problem, never the developer.
- Add encouragement with technical feedback.`;

    if (workspace.homeMdContent?.trim()) {
      prompt += `\n\n## Project home.md\n${workspace.homeMdContent.slice(0, 4000)}`;
    }

    if (workspace.path) {
      try {
        const git = await invoke<{ is_repo: boolean; branch?: string; modified: number; added: number; deleted: number; untracked: number }>(
          "get_git_status", { workspacePath: workspace.path }
        );
        if (git.is_repo) {
          prompt += `\n\n## Git\nBranch: ${git.branch ?? "HEAD"} | M:${git.modified} A:${git.added} D:${git.deleted} ?:${git.untracked}`;
        }
      } catch { /* ignore */ }
    }

    return { role: "system", content: prompt };
  }

  // ── Tool call parser ──
  function parseToolCalls(content: string): { name: string; args: Record<string, unknown> }[] {
    const results: { name: string; args: Record<string, unknown> }[] = [];
    const toolRe = /<tool>(\w+)<\/tool>\s*<args>([\s\S]*?)<\/args>/g;
    let m: RegExpExecArray | null;
    while ((m = toolRe.exec(content)) !== null) {
      try {
        results.push({ name: m[1], args: JSON.parse(m[2].trim()) });
      } catch { /* skip malformed */ }
    }
    return results;
  }

  function stripToolBlocks(content: string): string {
    return content.replace(/<tool>\w+<\/tool>\s*<args>[\s\S]*?<\/args>/g, "").trim();
  }

  // ── Chat ──

  function injectWorkspace(args: Record<string, unknown>): Record<string, unknown> {
    const workspace = useWorkspaceStore();
    if (!args["workspace_path"] && workspace.path) {
      args["workspace_path"] = workspace.path;
    }
    if (!args["workspace_hash"] && workspace.hash) {
      args["workspace_hash"] = workspace.hash;
    }
    return args;
  }

  async function sendMessage(text: string) {
    if (!text.trim() || isBusy.value) return;

    const settings = useSettingsStore();
    if (!settings.settings.base_url) {
      pushNote("Configure the AI provider in Settings first.");
      return;
    }

    const trimmed = text.trim();
    let userText = trimmed;
    if (trimmed.startsWith("/")) {
      const expanded = expandSlashCommand(trimmed, useWorkspaceStore());
      if (expanded !== null) {
        userText = expanded;
      } else if (trimmed === "/focus") {
        pushNote("[Supervisor] DND toggled from chat.");
        return;
      } else if (trimmed === "/help") {
        pushNote("Commands: /status /remind /review /scan /summarize /focus /help");
        return;
      }
    }

    isBusy.value = true;
    state.value = "thinking";
    if (happyTimeoutId) { clearTimeout(happyTimeoutId); happyTimeoutId = null; }

    // Snooze detection — find the last supervisor check-in (not confirmation)
    const prevMsg = [...messages.value].reverse().find(
      (m) => m.role === "system-note" && m.content.startsWith("[Supervisor]") && !m.content.startsWith("[Supervisor ✓]")
    );
    if (prevMsg) {
      tryParseSnooze(trimmed).catch(() => {});
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: "user", content: userText, timestamp: Date.now(),
    };
    messages.value.push(userMsg);
    persistMessage(userMsg);

    // Build the messages array for the API — we'll grow it across tool rounds
    const systemMsg = await buildSystemPrompt();
    const apiMessages: { role: string; content: string }[] = [
      systemMsg,
      { role: "user", content: userText },
    ];

    // Tool call loop
    let success = true;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId, role: "assistant", content: "", timestamp: Date.now(), isStreaming: true,
      };
      messages.value.push(assistantMsg);
      const assistant = messages.value.find((m) => m.id === assistantId)!;

      const unlistenChunk = await listen<{ id: string; content: string }>("chat-chunk", (event) => {
        if (event.payload.id === assistantId) assistant.content += event.payload.content;
      });
      const unlistenError = await listen<{ id: string; error: string }>("chat-error", (event) => {
        if (event.payload.id === assistantId) { assistant.error = event.payload.error; assistant.content = event.payload.error; }
      });

      try {
        await invoke("chat_stream", {
          msgId: assistantId,
          messages: apiMessages,
          baseUrl: settings.settings.base_url,
          apiKey: settings.settings.api_key,
          model: settings.settings.model,
          maxTokens: settings.settings.max_tokens,
        });

        assistant.isStreaming = false;
        unlistenChunk();
        unlistenError();

        if (assistant.error) break;

        const tools = parseToolCalls(assistant.content);
        if (tools.length === 0) {
          persistMessage({ ...assistant, id: assistantId, timestamp: Date.now() });
          break; // Done
        }

        // Strip tool blocks from display, keep any non-tool text
        const displayText = stripToolBlocks(assistant.content);
        assistant.content = displayText || "(working…)";
        persistMessage({ ...assistant, id: assistantId, timestamp: Date.now() });

        // Execute tools
        const toolResults: { name: string; result: string }[] = [];
        for (const tc of tools) {
          const args = injectWorkspace(tc.args);
          const toolMsg: ChatMessage = {
            id: crypto.randomUUID(), role: "tool", content: "", timestamp: Date.now(), toolName: tc.name,
          };
          try {
            const result = await invoke<string>("invoke_tool", { toolName: tc.name, args });
            toolMsg.toolResult = result;
            toolResults.push({ name: tc.name, result });
          } catch (e) {
            toolMsg.toolResult = `Error: ${e}`;
            toolResults.push({ name: tc.name, result: `Error: ${String(e)}` });
          }
          toolMsg.content = toolMsg.toolResult || "";
          messages.value.push(toolMsg);
        }

        // Append to API messages for next round
        apiMessages.push({ role: "assistant", content: assistant.content });
        apiMessages.push({
          role: "system",
          content: `Tool results received. Continue your response using this data:\n${toolResults.map(r => `<tool_result name="${r.name}">\n${r.result}\n</tool_result>`).join("\n")}\n\nNow continue helping the user with the information you just received. Do NOT repeat the tool calls — use the results.`,
        });
      } catch (e) {
        assistant.content = assistant.content || `Error: ${e}`;
        assistant.error = String(e);
        assistant.isStreaming = false;
        unlistenChunk();
        unlistenError();
        success = false;
        break;
      }
    }

    state.value = success ? "happy" : "idle";
    if (success) {
      happyTimeoutId = setTimeout(() => {
        if (state.value === "happy") state.value = "idle";
        happyTimeoutId = null;
      }, 4000);
    }
    isBusy.value = false;
  }

  function pushNote(text: string) {
    messages.value.push({ id: crypto.randomUUID(), role: "system-note", content: text, timestamp: Date.now() });
  }

  async function tryParseSnooze(userText: string) {
    const sv = useSupervisionStore();
    const settings = useSettingsStore();
    if (!settings.settings.base_url) return;
    try {
      const resp = await fetch(`${settings.settings.base_url}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(settings.settings.api_key ? { Authorization: `Bearer ${settings.settings.api_key}` } : {}) },
        body: JSON.stringify({ model: settings.settings.model, messages: [{ role: "system", content: 'Parse the snooze request into hours. Return ONLY JSON: {"hours": <number>, "reason": "<brief>"}. 1 week = 168h. If not a snooze, {"hours": 0}.' }, { role: "user", content: userText }], max_tokens: 40, temperature: 0 }),
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as { choices: { message: { content: string } }[] };
      const json = JSON.parse(data.choices?.[0]?.message?.content?.trim() ?? '{"hours":0}') as { hours: number; reason?: string };
      if (json.hours > 0) { sv.setIdleHours(json.hours); pushNote(`[Supervisor ✓] Snoozed for ${json.hours}h${json.reason ? ` — ${json.reason}` : ""}.`); }
    } catch { /* silent */ }
  }

  function clear() {
    const workspace = useWorkspaceStore();
    if (workspace.hash && convId.value) {
      invoke("clear_conversation", { workspaceHash: workspace.hash, convId: convId.value }).catch(console.warn);
    }
    messages.value = [];
    state.value = "idle";
    isBusy.value = false;
  }

  return { messages, state, isBusy, sendMessage, pushNote, clear, loadConversation };
});
