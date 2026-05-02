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
interface SlashCommand {
  id: string;
  label: string;   // what the chip shows
  cmd: string;     // what gets sent
  bar: boolean;    // show in shortcuts bar
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "status",    label: "/status",    cmd: "/status",    bar: true  },
  { id: "remind",    label: "/remind",    cmd: "/remind",    bar: true  },
  { id: "review",    label: "/review",    cmd: "/review",    bar: true  },
  { id: "scan",      label: "/scan",      cmd: "/scan",      bar: true  },
  { id: "summarize", label: "/summarize", cmd: "/summarize", bar: true  },
  { id: "focus",     label: "/focus",     cmd: "/focus",     bar: false }, // typed only
  { id: "help",      label: "/help",      cmd: "/help",      bar: false }, // typed only
];

export function getSlashCommands() {
  return SLASH_COMMANDS.filter((sc) => sc.bar);
}

function expandSlashCommand(cmd: string, workspace: ReturnType<typeof useWorkspaceStore>): string | null {
  switch (cmd) {
    case "/status":
      return `Give a brief status update on this project. Use <tool>read_home_md</tool> to check the Todos section, then <tool>get_git_status</tool> to see recent changes. Summarize: what's done, what's in progress, what's next. Keep it short — 3-5 lines max.`;
    case "/remind":
      return `Read home.md with <tool>read_home_md</tool> and list every unchecked task from the Todos section. For each one, give a one-sentence nudge about why it matters or a tip to get unstuck. Be encouraging.`;
    case "/review":
      return `Review the latest changes. Use <tool>get_git_status</tool> to see modified files, then <tool>read_file</tool> on the most important ones. Give a concise code review: what looks good, specific concerns, and one actionable suggestion. Address the code, not the developer.`;
    case "/scan": {
      if (!workspace.path) return null;
      const fileList = workspace.fileTree
        .map((n) => `${n.is_dir ? "📁" : "📄"} ${n.name}${n.git_status ? ` [${n.git_status}]` : ""}`)
        .slice(0, 60).join("\n");
      workspace.isNewProject = false;
      return `Scan this project and write a home.md overview using tools.\n\nFile tree:\n${fileList}\n\nSteps:\n1. Use <tool>read_file</tool> on key files (package.json / Cargo.toml / README, main entry point, one or two interesting source files)\n2. Use <tool>write_home_md</tool> with this exact structure:\n\n# Overview\n[2-3 sentences describing what the project is and does]\n\n# Todos\n- [ ] Review the codebase\n- [ ] Set up development environment\n\n# Notes\n[Key observations: tech stack, interesting patterns, anything worth remembering]\n\nWrite it now.`;
    }
    case "/summarize":
      return `Summarize our conversation so far into one compact paragraph. Include: key decisions made, work completed, and what's still pending. This will help preserve context as the conversation grows.`;
    case "/focus": {
      const sv = useSupervisionStore();
      sv.setDnd(!sv.dnd);
      return null;
    }
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
  let cancelRequested = false;
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

    let prompt = `You are **Clock Lock** — an AI developer companion. Think of yourself as a supportive senior coworker sitting next to the user: you help them understand their own project, stay organized, and keep momentum. You are NOT an autonomous coding agent. You read, suggest, and collaborate — you don't modify source code or run arbitrary commands.

Personality: ${personality}.

## What you can do
- **Read the project** — read files, list directories, search, check git status.
- **Maintain home.md** — the project knowledge base. You and the user co-edit it. Prefer \`append_section\` for targeted additions; use \`write_home_md\` only when restructuring.
- **Run read-only shell queries** — use \`run_bash\` for safe lookups (ls, git log, git status, etc.).
- **Suggest** — for commands that modify anything, output them as \`\`\`bash blocks for the user to approve. For code edits, use \`\`\`diff blocks. Never modify source files directly.

## Tools
Write tool calls inline. Results arrive in the next turn — use them before responding.

<tool>read_file</tool>
<args>{"path": "relative/or/absolute/path"}</args>

<tool>list_dir</tool>
<args>{"workspace_path": "${workspace.path || ""}"}</args>

<tool>search_files</tool>
<args>{"workspace_path": "${workspace.path || ""}", "pattern": "keyword or filename", "limit": 20}</args>

<tool>read_home_md</tool>
<args>{"workspace_path": "${workspace.path || ""}"}</args>

<tool>write_home_md</tool>
<args>{"workspace_path": "${workspace.path || ""}", "content": "# Overview\\n\\n..."}</args>

<tool>append_section</tool>
<args>{"workspace_path": "${workspace.path || ""}", "heading": "Todos", "text": "- [ ] new item"}</args>

<tool>get_git_status</tool>
<args>{"workspace_path": "${workspace.path || ""}"}</args>

<tool>search_memory</tool>
<args>{"workspace_hash": "${workspace.hash || ""}", "query": "search terms", "limit": 5}</args>

<tool>run_bash</tool>
<args>{"workspace_path": "${workspace.path || ""}", "command": "git log --oneline -10", "shell_path": "${settings.settings.shell_path || ""}"}</args>
— Read-only only. For anything that creates/modifies/deletes, use a \`\`\`bash block instead.

## Communication style
- Address the problem, not the person. "This function has an off-by-one error" not "you made a mistake."
- Include a brief word of encouragement in technical feedback — it makes a real difference.
- Be concise: skip pleasantries, get to the point, stay warm.
- When you need information, use tools — don't guess.`;

    if (workspace.homeMdContent?.trim()) {
      prompt += `\n\n## Project home.md\n${workspace.homeMdContent.slice(0, 4000)}`;
    }

    const sel = workspace.selectedFilePath;
    if (sel && sel !== workspace.homeMdPath) {
      const fileName = sel.replace(/\\/g, "/").split("/").pop() ?? sel;
      if (workspace.selectedFileContent !== null) {
        const snippet = workspace.selectedFileContent.slice(0, 2000);
        const truncated = workspace.selectedFileContent.length > 2000;
        prompt += `\n\n## Currently open file: ${fileName}\n\`\`\`\n${snippet}${truncated ? "\n... (truncated)" : ""}\n\`\`\``;
      } else {
        prompt += `\n\n## Currently open file: ${fileName} (binary)`;
      }
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
    const displayText = trimmed; // always show what the user typed in the chat bubble
    if (trimmed.startsWith("/")) {
      const expanded = expandSlashCommand(trimmed, useWorkspaceStore());
      if (expanded !== null) {
        userText = expanded;
      } else if (trimmed === "/focus") {
        const sv = useSupervisionStore();
        const nowDnd = sv.dnd;
        pushNote(nowDnd
          ? "Focus mode OFF — supervision check-ins re-enabled."
          : "Focus mode ON — supervision check-ins paused. Type /focus again to re-enable.");
        return;
      } else if (trimmed === "/help") {
        pushNote(
          "Available commands:\n" +
          "  /status   — project status summary\n" +
          "  /remind   — list pending todos with nudges\n" +
          "  /review   — code review of recent git changes\n" +
          "  /scan     — scan project and write home.md overview\n" +
          "  /summarize — compress this conversation\n" +
          "  /focus    — toggle supervision Do-Not-Disturb"
        );
        return;
      }
    }

    isBusy.value = true;
    state.value = "thinking";
    if (happyTimeoutId) { clearTimeout(happyTimeoutId); happyTimeoutId = null; }

    // Snooze detection — only if a supervisor check-in appears in the last 3 messages
    const prevMsg = messages.value.slice(-3).reverse().find(
      (m) => m.role === "system-note" && m.content.startsWith("[Supervisor]") && !m.content.startsWith("[Supervisor ✓]")
    );
    if (prevMsg) {
      tryParseSnooze(trimmed).catch(() => {});
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: "user", content: displayText, timestamp: Date.now(),
    };
    messages.value.push(userMsg);
    persistMessage(userMsg);

    // Build the messages array for the API — we'll grow it across tool rounds
    const systemMsg = await buildSystemPrompt();
    const limit = settings.settings.max_context_messages;
    const historyMsgs = messages.value
      .slice(0, -1) // exclude the current user message just pushed
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-limit)
      .map((m) => ({ role: m.role as string, content: m.content }));
    const apiMessages: { role: string; content: string }[] = [
      systemMsg,
      ...historyMsgs,
      { role: "user", content: userText },
    ];

    // Tool call loop
    cancelRequested = false;
    let success = true;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (cancelRequested) { success = false; break; }
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

  function stopGeneration() {
    cancelRequested = true;
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

  return { messages, state, isBusy, sendMessage, stopGeneration, pushNote, clear, loadConversation };
});
