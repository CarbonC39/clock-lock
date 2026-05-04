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
  role: "user" | "assistant" | "system" | "system-note" | "tool";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

// ── Native Tools Schema ──
const NATIVE_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the content of a specific file.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Mandatory: Why are we reading this file?" },
          path: { type: "string", description: "Relative or absolute path to the file." },
        },
        required: ["thought_process", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and directories in a workspace.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Mandatory: What are we looking for in this directory?" },
          workspace_path: { type: "string" },
        },
        required: ["thought_process", "workspace_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_home_md",
      description: "Read the user's project knowledge base (home.md): their Overview, personal Todos, and Notes.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Mandatory: Context check." },
          workspace_path: { type: "string" },
        },
        required: ["thought_process", "workspace_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_context",
      description: "Fetch specific technical context like Git diffs or environment info.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Why do we need this context?" },
          type: { type: "string", enum: ["git_diff"], description: "The type of context to fetch." },
          workspace_path: { type: "string" },
        },
        required: ["thought_process", "type", "workspace_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_overview",
      description: "Replace the Overview section in home.md with a new project description.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Mandatory: Why is this update necessary?" },
          workspace_path: { type: "string" },
          text: { type: "string", description: "New overview content (markdown prose)." },
        },
        required: ["thought_process", "workspace_path", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_todo",
      description: "Add a new unchecked task to the user's Todos list in home.md.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Mandatory: Why add this task now?" },
          workspace_path: { type: "string" },
          text: { type: "string", description: "Task description (short, actionable)." },
        },
        required: ["thought_process", "workspace_path", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "append_notes",
      description: "Append new text to the Notes section in home.md. Never replaces existing notes.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Mandatory: What observation to record." },
          workspace_path: { type: "string" },
          text: { type: "string", description: "Text to append (separated from prior notes by a blank line)." },
        },
        required: ["thought_process", "workspace_path", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "split_task",
      description: "Break down a complex goal into 3-5 tiny, manageable sub-tasks (10-15 mins each).",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Why do these steps make sense for an ADHD workflow?" },
          original_task: { type: "string", description: "The task to break down." },
          subtasks: {
            type: "array",
            items: { type: "string" },
            description: "List of micro-tasks. Must be actionable and small."
          },
        },
        required: ["thought_process", "original_task", "subtasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_git_status",      description: "Check the current Git branch and modified files summary.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Mandatory: Understanding recent progress." },
          workspace_path: { type: "string" },
        },
        required: ["thought_process", "workspace_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_bash",
      description: "Run safe read-only bash commands (git log, ls, etc.).",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Mandatory: Strategy for this query." },
          workspace_path: { type: "string" },
          command: { type: "string" },
        },
        required: ["thought_process", "workspace_path", "command"],
      },
    },
  },
];

// ── Slash commands ──
interface SlashCommand {
  id: string;
  label: string;
  cmd: string;
  bar: boolean;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "status",    label: "/status",    cmd: "/status",    bar: true  },
  { id: "remind",    label: "/remind",    cmd: "/remind",    bar: true  },
  { id: "review",    label: "/review",    cmd: "/review",    bar: true  },
  { id: "scan",      label: "/scan",      cmd: "/scan",      bar: true  },
  { id: "summarize", label: "/summarize", cmd: "/summarize", bar: true  },
  { id: "focus",     label: "/focus",     cmd: "/focus",     bar: false },
  { id: "help",      label: "/help",      cmd: "/help",      bar: false },
];

export function getSlashCommands() {
  return SLASH_COMMANDS.filter((sc) => sc.bar);
}

function expandSlashCommand(cmd: string, workspace: ReturnType<typeof useWorkspaceStore>): string | null {
  switch (cmd) {
    case "/status":
      return `Give me a pulse check. Use your tools to see our goals and my recent progress. Summarize it encouragingly and short.`;
    case "/remind":
      return `Read my Todos from home.md. Pick the most important one and give me a gentle nudge. Why does it matter? Suggest one tiny concrete first step.`;
    case "/review":
      return `Look at what I've changed. Give me a code-buddy review: what's clever, what's tricky, and one high-five.`;
    case "/scan": {
      if (!workspace.path) return null;
      const fileList = workspace.fileTree
        .map((n) => `${n.is_dir ? "📁" : "📄"} ${n.name}${n.git_status ? ` [${n.git_status}]` : ""}`)
        .slice(0, 80).join("\n");
      workspace.isNewProject = false;
      return `Initialize this workspace. Path: "${workspace.path}"\n\nSteps (briefly tell the user your plan in one line, then execute in order):\n1. Call \`list_dir\` to get the full structure. Read key files (README, package.json, Cargo.toml).\n2. Call \`update_overview\` to write a 2-3 sentence project description (what it is, its tech stack).\n3. Call \`add_todo\` 1-2 times to add the first micro-tasks (each ≤15 min).\n4. Close with: what you found, the single most important first step, and ask if that's where they want to start.\n\nFile tree preview:\n${fileList}`;
    }
    case "/summarize":
      return `Condense our conversation into one supportive paragraph. Highlight key decisions and achievements.`;
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
  const currentTool = ref<string | null>(null);
  const convId = ref<string | null>(null);
  let happyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let cancelRequested = false;
  let msgCounter = 0;
  let lastSummarizeAt = 0;
  let unlistenFsChange: (() => void) | null = null;
  const MAX_TOOL_ROUNDS = 5;

  async function summarizeConversation() {
    const now = Date.now();
    if (now - lastSummarizeAt < 60_000) return;
    lastSummarizeAt = now;
    const workspace = useWorkspaceStore();
    const settings = useSettingsStore();
    if (!messages.value.length || !workspace.hash) return;

    try {
      // Use a hidden specialized prompt for summarization
      const response = await fetch(`${settings.settings.base_url}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.settings.api_key}`
        },
        body: JSON.stringify({
          model: settings.settings.model,
          messages: [
            { role: "system", content: "Summarize the key progress and decisions of this conversation in one short, encouraging paragraph." },
            ...messages.value.slice(-10).map(m => ({ role: m.role, content: m.content }))
          ],
          temperature: 0.3,
          max_tokens: 150
        })
      });
      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content;
      if (summary) {
        workspace.saveSessionState({ last_summary: summary });
      }
    } catch (e) {
      console.warn("Auto-summarization failed:", e);
    }
  }

  async function loadConversation() {
    const workspace = useWorkspaceStore();
    if (!workspace.hash) return;
    convId.value = await invoke<string>("ensure_conversation", { workspaceHash: workspace.hash });
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

    // Cold Start Recovery logic
    if (workspace.sessionState) {
      const now = Math.floor(Date.now() / 1000);
      const idleSecs = now - workspace.sessionState.last_active_at;
      if (idleSecs > 1800) { // > 30 mins
        const fileName = workspace.sessionState.current_focus_file?.split("/").pop() || "the project";
        pushNote(`Welcome back! You were last working on ${fileName}. Shall we pick up where we left off?`);
      }
    }
    // Update active timestamp
    workspace.saveSessionState({});

    unlistenFsChange?.();
    unlistenFsChange = await listen("fs-change", () => {
      if (isBusy.value) return;
      if (happyTimeoutId) clearTimeout(happyTimeoutId);
      state.value = "happy";
      happyTimeoutId = setTimeout(() => { if (state.value === "happy") state.value = "idle"; happyTimeoutId = null; }, 3000);
    });
  }

  async function persistMessage(msg: ChatMessage) {
    const workspace = useWorkspaceStore();
    if (!workspace.hash || !convId.value) return;
    await invoke("save_message", {
      workspaceHash: workspace.hash,
      convId: convId.value,
      role: msg.role,
      content: msg.content || "",
    }).catch(console.warn);
  }

  function buildRecentActivitySummary(): string {
    const recent = messages.value.slice(-20);
    const errorCount = recent.filter(m =>
      m.error ||
      (m.role === "tool" && m.content?.startsWith("Error:")) ||
      (m.role === "assistant" && /\berror\b/i.test(m.content ?? ""))
    ).length;
    const toolRounds = recent.filter(m => m.role === "tool").length;
    const lastSummary = useWorkspaceStore().sessionState?.last_summary;

    const parts: string[] = [];
    if (errorCount >= 3) parts.push(`User has hit ${errorCount} errors recently — may be stuck or frustrated.`);
    else if (toolRounds >= 8) parts.push(`Dense tool-call session — complex task in progress.`);
    if (lastSummary) parts.push(`Previous session: ${lastSummary}`);
    return parts.join(" ");
  }

  async function buildSystemPrompt(): Promise<string> {
    const workspace = useWorkspaceStore();
    const settings = useSettingsStore();
    const personality = settings.settings.personality || "pragmatic and warm senior developer";
    const activity = buildRecentActivitySummary();

    return `You are **Clock Lock** — a cyber-coworker for ADHD developers. You are a peer, not a servant or a mentor.

## Personality
${personality}. Direct and literal — no vague metaphors. High predictability: say what you will do before doing it.

## On errors and frustration
When the user hits errors or expresses frustration, respond factually and without implying personal fault. Attribute problems to the environment or the task, not the person.
Example: "Dependency conflicts like this are common — nothing to do with your code. Let's trace it."

## After every response
End with 1–3 concrete, low-effort next options so the user is never left with a blank prompt.

## home.md
Three fixed sections — do not invent others:
- **Overview**: project description (call \`update_overview\` to change it)
- **Todos**: user's task list (call \`add_todo\` to add tasks; the user manages completion)
- **Notes**: running log (call \`append_notes\` to add observations — never replaces, only appends)

## Tools
Use tools only when you need evidence. Prefer \`read_file\` over \`run_bash\` for reading files.
Use the workspace_path from context for every tool call.
Edits → \`\`\`diff\`\`\` blocks. Mutating shell commands → \`\`\`bash\`\`\` blocks (user approves before execution).

## Context
- Workspace: ${workspace.name || "none"}
- Workspace path: ${workspace.path || "none"}
- Active file: ${workspace.selectedFilePath || "none"}${activity ? `\n- Recent activity: ${activity}` : ""}`;
  }

  function injectWorkspace(args: Record<string, any>): Record<string, any> {
    const workspace = useWorkspaceStore();
    if (!workspace.path) return args;
    const wp: string = args["workspace_path"] ?? "";
    // Override if missing, relative, or clearly wrong (doesn't start with workspace path prefix)
    const isAbsolute = /^([A-Za-z]:[\\/]|\/)/.test(wp);
    if (!wp || !isAbsolute) {
      args["workspace_path"] = workspace.path;
    }
    return args;
  }

  async function sendMessage(text: string) {
    if (!text.trim() || isBusy.value) return;
    const settings = useSettingsStore();
    const workspace = useWorkspaceStore();
    if (!settings.settings.base_url) { pushNote("Configure AI in Settings first."); return; }

    const trimmed = text.trim();
    let userText = trimmed;
    if (trimmed.startsWith("/")) {
      const expanded = expandSlashCommand(trimmed, workspace);
      if (expanded) userText = expanded;
      else if (trimmed === "/focus") {
        const sv = useSupervisionStore();
        sv.setDnd(!sv.dnd);
        pushNote(sv.dnd ? "Focus mode ON." : "Focus mode OFF.");
        return;
      } else if (trimmed === "/help") {
        pushNote("Available: /status, /remind, /review, /scan, /summarize, /focus");
        return;
      }
    }

    isBusy.value = true;
    state.value = "thinking";
    if (happyTimeoutId) { clearTimeout(happyTimeoutId); happyTimeoutId = null; }

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed, timestamp: Date.now() };
    messages.value.push(userMsg);
    persistMessage(userMsg);

    const apiMessages: any[] = [
      { role: "system", content: await buildSystemPrompt() },
      ...messages.value
        .slice(0, -1)
        .filter(m => {
          if (!["user", "assistant", "system", "tool"].includes(m.role)) return false;
          // Drop orphaned tool-chain fragments loaded from DB (only role+content persisted).
          const isDbLoaded = m.id.startsWith("db-");
          if (isDbLoaded) {
            if (m.role === "tool" && !m.tool_call_id) return false;
            if (m.role === "assistant" && !m.content?.trim() && !m.tool_calls) return false;
          }
          return true;
        })
        .slice(-settings.settings.max_context_messages)
        .map(m => ({
          role: m.role,
          content: m.content || "",
          ...(m.tool_calls   ? { tool_calls:   m.tool_calls }   : {}),
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          ...(m.name         ? { name:         m.name }         : {}),
        })),
      { role: "user", content: userText },
    ];

    cancelRequested = false;
    let success = true;

    // Loop runs up to MAX_TOOL_ROUNDS tool-calling rounds, then one guaranteed text-only round.
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      if (cancelRequested) { success = false; break; }
      const isTextOnlyRound = round === MAX_TOOL_ROUNDS;
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", timestamp: Date.now(), isStreaming: true };
      messages.value.push(assistantMsg);

      const assistant = messages.value.find(m => m.id === assistantId)!;
      let toolCalls: any[] = [];

      const unlistenChunk = await listen<{ id: string; content?: string; tool_calls?: any[] }>("chat-chunk", (event) => {
        if (event.payload.id !== assistantId) return;
        if (event.payload.content) assistant.content += event.payload.content;
        if (event.payload.tool_calls) {
          event.payload.tool_calls.forEach((delta: any) => {
            const index = delta.index;
            if (!toolCalls[index]) toolCalls[index] = { id: delta.id, type: "function", function: { name: "", arguments: "" } };
            if (delta.id) toolCalls[index].id = delta.id;
            if (delta.function?.name) toolCalls[index].function.name += delta.function.name;
            if (delta.function?.arguments) toolCalls[index].function.arguments += delta.function.arguments;
          });
        }
      });

      const unlistenError = await listen<{ id: string; error: string }>("chat-error", (event) => {
        if (event.payload.id === assistantId) { assistant.error = event.payload.error; assistant.content = event.payload.error; }
      });

      try {
        await invoke("chat_stream", {
          msgId: assistantId,
          messages: apiMessages,
          // Empty tools array on the final round forces a text-only response from the model.
          tools: isTextOnlyRound ? [] : NATIVE_TOOLS,
          baseUrl: settings.settings.base_url,
          apiKey: settings.settings.api_key,
          model: settings.settings.model,
          maxTokens: settings.settings.max_tokens,
        });

        assistant.isStreaming = false;
        unlistenChunk();
        unlistenError();
        if (assistant.error) break;

        if (toolCalls.length === 0 || isTextOnlyRound) {
          persistMessage({ ...assistant, id: assistantId, timestamp: Date.now() });
          break;
        }

        assistant.tool_calls = toolCalls;
        persistMessage({ ...assistant, id: assistantId, timestamp: Date.now() });
        apiMessages.push({ role: "assistant", content: assistant.content || "", tool_calls: toolCalls });

        for (const tc of toolCalls) {
          currentTool.value = tc.function.name;
          let args: any;
          try {
            args = JSON.parse(tc.function.arguments);
          } catch (e) {
            const errorMsg = "Invalid JSON in arguments. Please escape all paths and retry.";
            const toolMsg: ChatMessage = { id: crypto.randomUUID(), role: "tool", content: errorMsg, tool_call_id: tc.id, name: tc.function.name, timestamp: Date.now() };
            messages.value.push(toolMsg);
            apiMessages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: errorMsg });
            continue;
          }

          const finalArgs = injectWorkspace(args);
          let result: string;
          try {
            if (tc.function.name === "split_task") {
              // Return raw args so the UI can render the task card
              result = tc.function.arguments;
            } else {
              result = await invoke<string>("invoke_tool", { toolName: tc.function.name, args: finalArgs });
            }
          } catch (e) {
            result = `Error: ${e}`;
          }

          const toolMsg: ChatMessage = { id: crypto.randomUUID(), role: "tool", content: result, tool_call_id: tc.id, name: tc.function.name, timestamp: Date.now() };
          messages.value.push(toolMsg);
          apiMessages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: result });

          if (["update_overview", "add_todo", "append_notes"].includes(tc.function.name)) {
            workspace.refreshHomeMd().catch(console.warn);
          }
        }
        currentTool.value = null;
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
      msgCounter++;
      if (msgCounter >= 5) {
        msgCounter = 0;
        summarizeConversation().catch(console.warn);
      }
      happyTimeoutId = setTimeout(() => { if (state.value === "happy") state.value = "idle"; happyTimeoutId = null; }, 4000);
    }
    isBusy.value = false;
  }

  function stopGeneration() { cancelRequested = true; }
  function pushNote(text: string) { messages.value.push({ id: crypto.randomUUID(), role: "system-note", content: text, timestamp: Date.now() }); }
  function setState(s: AgentState) { state.value = s; }
  function clear() {
    unlistenFsChange?.();
    unlistenFsChange = null;
    msgCounter = 0;
    const workspace = useWorkspaceStore();
    if (workspace.hash && convId.value) invoke("clear_conversation", { workspaceHash: workspace.hash, convId: convId.value }).catch(console.warn);
    messages.value = [];
    state.value = "idle";
    isBusy.value = false;
  }

  return { messages, state, isBusy, currentTool, sendMessage, stopGeneration, pushNote, setState, clear, loadConversation };
});
