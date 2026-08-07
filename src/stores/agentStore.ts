import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "./workspaceStore";
import { useSettingsStore } from "./settingsStore";
import { useSupervisionStore } from "./supervisionStore";

export type AgentState = "idle" | "thinking" | "happy" | "sleepy" | "excited";

export interface CheckinMeta {
  idleMinutes: number;
  topTodo: string | null;
  snoozed: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "system-note" | "tool" | "checkin";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
  checkinMeta?: CheckinMeta;
}

// ── Native Tools Schema ──
// Tool design rules:
// - Each tool has exactly one job; no two tools overlap.
// - READ tools gather evidence. WRITE tools exist ONLY for home.md (Overview /
//   Todos / Notes). There is deliberately no tool that writes any other file.
// - `thought_process` is the agent's brief reasoning, shown to the user.
const NATIVE_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a text file in the workspace. Use only to gather evidence for advice or tracking. Never use it to modify anything.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. Why read this file?" },
          path: { type: "string", description: "Absolute path, or a path relative to the workspace root." },
        },
        required: ["thought_process", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description:
        "List the workspace directory tree (folders and files, with git status markers). Use to orient yourself in the project. Read-only.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. What are you looking for?" },
          workspace_path: { type: "string", description: "Workspace root path." },
        },
        required: ["thought_process", "workspace_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description:
        "Find files in the workspace whose name or path contains a substring (e.g. 'test', 'store'). Use when you need to locate a file by name. Read-only.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. Which file are you hunting for?" },
          workspace_path: { type: "string", description: "Workspace root path." },
          pattern: { type: "string", description: "Case-insensitive substring matched against file names and paths." },
          limit: { type: "number", description: "Maximum results to return (default 20)." },
        },
        required: ["thought_process", "workspace_path", "pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_home_md",
      description:
        "Read the user's project knowledge base (home.md): Overview, personal Todos, and Notes. This is YOUR working desk and the source of truth for tracking. Always read it before answering anything about tasks, progress, or plans.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. What state are you checking?" },
          workspace_path: { type: "string", description: "Workspace root path." },
        },
        required: ["thought_process", "workspace_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_git_status",
      description:
        "Get the current git branch and a count of changed files (modified / added / deleted / untracked). Use for a quick progress check. Read-only.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. What are you checking?" },
          workspace_path: { type: "string", description: "Workspace root path." },
        },
        required: ["thought_process", "workspace_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_git_diff",
      description:
        "Read the uncommitted git diff (working-tree changes vs HEAD). Use when you need to see exactly what the user changed — e.g. for a progress review. Read-only.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. Why do you need the diff?" },
          workspace_path: { type: "string", description: "Workspace root path." },
        },
        required: ["thought_process", "workspace_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_bash",
      description:
        "Run a READ-ONLY shell command (e.g. ls, find, git log, node --version). Only allowlisted read-only commands execute; anything mutating is rejected. To suggest a command that changes something, render it as a ```bash block in your reply so the user can approve it themselves.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. What is the command for?" },
          workspace_path: { type: "string", description: "Workspace root path." },
          command: { type: "string", description: "The read-only shell command to run." },
        },
        required: ["thought_process", "workspace_path", "command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_overview",
      description:
        "WRITE tool. Replace the Overview section of home.md (the project description). home.md is the ONLY file you may write. Keep it accurate as your understanding of the project evolves; the user can see and edit every change in the UI.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. Why is the overview changing?" },
          workspace_path: { type: "string", description: "Workspace root path." },
          text: { type: "string", description: "New overview content — concise markdown prose: what the project is and its tech stack." },
        },
        required: ["thought_process", "workspace_path", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_todo",
      description:
        "WRITE tool. Add a new unchecked task to the Todos list in home.md. Tasks should be small and actionable (roughly 10–15 minutes). home.md is the ONLY file you may write.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. Why add this task now?" },
          workspace_path: { type: "string", description: "Workspace root path." },
          text: { type: "string", description: "Task text — short and concrete." },
        },
        required: ["thought_process", "workspace_path", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "append_notes",
      description:
        "WRITE tool. Append an observation to the Notes section of home.md — the running log of progress, decisions, and findings. Always appends; never rewrites existing notes. home.md is the ONLY file you may write.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. What are you recording?" },
          workspace_path: { type: "string", description: "Workspace root path." },
          text: { type: "string", description: "Note to append, separated from existing notes by a blank line." },
        },
        required: ["thought_process", "workspace_path", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "split_task",
      description:
        "Propose breaking a goal into 3–5 small, concrete sub-tasks. Returns a card the user can accept; only accepted sub-tasks become Todos. Do not add them yourself — let the user confirm.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. Why this breakdown?" },
          original_task: { type: "string", description: "The goal to break down." },
          subtasks: {
            type: "array",
            items: { type: "string" },
            description: "3–5 actionable micro-tasks (roughly 10–15 minutes each)."
          },
        },
        required: ["thought_process", "original_task", "subtasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_memory",
      description:
        "Search past conversation history for earlier decisions, tasks, or context. Use when tracking progress across sessions or recalling what was agreed. Read-only.",
      parameters: {
        type: "object",
        properties: {
          thought_process: { type: "string", description: "Brief reasoning, shown to the user. What past context are you recalling?" },
          workspace_path: { type: "string", description: "Workspace root path." },
          query: { type: "string", description: "Search terms to match against past messages." },
          limit: { type: "number", description: "Maximum results to return (default 5)." },
        },
        required: ["thought_process", "workspace_path", "query"],
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
      return `Give me a progress check like my supervisor. Use your tools (read_home_md, get_git_status) to see my goals and what has actually changed. Report in a short, encouraging summary: what's done, what's in flight, and the single most useful next step.`;
    case "/remind":
      return `Read my Todos from home.md. Pick the most important open task and give me a gentle nudge — why it matters and one tiny concrete first step.`;
    case "/review":
      return `Review my recent progress like a supervisor: read git status/diff and my todos, then give a short assessment — what got done, anything risky or stuck, and one recommended next step. Keep it encouraging and concrete.`;
    case "/scan": {
      if (!workspace.path) return null;
      const fileList = workspace.fileTree
        .map((n) => `${n.is_dir ? "📁" : "📄"} ${n.name}${n.git_status ? ` [${n.git_status}]` : ""}`)
        .slice(0, 80).join("\n");
      workspace.isNewProject = false;
      return `Initialize this workspace. Path: "${workspace.path}"\n\nSteps (briefly tell the user your plan in one line, then execute in order):\n1. Call \`list_dir\` to get the full structure. Read key files (README, package.json, Cargo.toml).\n2. Call \`update_overview\` to write a 2-3 sentence project description (what it is, its tech stack).\n3. Call \`add_todo\` 1-2 times to add the first micro-tasks (each ≤15 min).\n4. Close with: what you found, the single most important first step, and ask if that's where they want to start.\n\nFile tree preview:\n${fileList}`;
    }
    case "/summarize":
      return `Condense our conversation into one supportive paragraph that captures the current progress and key decisions, so I can keep tracking where things stand.`;
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
  // Lightweight, in-memory hint of the file the user most recently touched —
  // used for the soft status line near the pet and to ground check-ins. No git,
  // no persistence growth (the durable copy lives in session_state).
  const recentFocus = ref<{ file: string; at: number } | null>(null);
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
            { role: "system", content: "Summarize the current progress and key decisions of this conversation in one short, encouraging paragraph, so it can be used for progress tracking." },
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
    unlistenFsChange = await listen<{ path: string | null }>("fs-change", (e) => {
      // Update the recent-focus hint (basename of the touched file). Persist the
      // full path to session_state only when the file actually changes, so we
      // don't write to sqlite on every keystroke-triggered save.
      const path = e.payload?.path ?? null;
      if (path) {
        const base = path.split(/[\\/]/).pop() || path;
        const changed = base !== recentFocus.value?.file;
        recentFocus.value = { file: base, at: Date.now() };
        if (changed) useWorkspaceStore().saveSessionState({ current_focus_file: path });
      }
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
    const activity = buildRecentActivitySummary();
    const personality = settings.settings.personality.trim();
    const personalitySection = personality
      ? `\n# Personality\n\n${personality}\n`
      : "";

    return `# Identity

You are the project-aware AI companion in a desktop app for solo developers.
Your purpose is to keep the user oriented, organized, and moving forward. You track project state, preserve useful context, suggest concrete next steps, and maintain the project's knowledge base.
You supervise and advise. The user does the work.
${personalitySection}
# Project State

Each workspace has one agent-managed file: \`home.md\`.
It contains exactly three semantic sections:

* **Overview** — what the project is, its architecture, stack, and other durable project context.
* **Todos** — small, actionable tasks owned by the user.
* **Notes** — append-only observations, decisions, discoveries, and useful historical context.

\`home.md\` is your persistent desk and the source of truth for tracked project state.
A per-turn Context also provides:

* workspace path
* active file
* git snapshot: branch, changed-file counts, last commit
* recent activity summary
Use \`workspace_path\` for every workspace tool call.

# Authority

You may modify **only \`home.md\`**, through:

* \`update_overview\`
* \`add_todo\`
* \`append_notes\`

Never claim you can edit, create, delete, or apply changes to any other project file.
For project code or configuration:

* inspect it with read tools;
* propose edits in diff blocks;
* let the user apply them.

\`run_bash\` is read-only. Use it only for inspection. If a mutating shell command would help, show it to the user instead of executing it.

# Operating Rules

## Ground claims in state

Do not guess project state.
Before discussing tracked tasks, progress, or current project status, read \`home.md\`.
Before making claims about code or files, inspect the relevant files.
Use git status/diff when actual repository changes matter.
When returning after activity or when the user asks about progress, compare the current git/context state with the last known state and mention meaningful changes briefly.
## Maintain \`home.md\`
Update it only when useful:

* **Overview:** update when durable understanding of the project materially changes.
* **Todos:** add realistic micro-tasks that help execution.
* **Notes:** append meaningful decisions, findings, blockers, or observations worth retaining across sessions.

Do not rewrite Notes.
Do not silently remove or replace Todos. If one is obsolete or superseded, tell the user and suggest removing it.
Avoid recording transient chatter or obvious facts.

## Preserve continuity

Use \`search_memory\` when earlier decisions, constraints, or context are relevant and not already available.
Record important new conclusions in Notes so future sessions do not depend on conversation history alone.
## Keep the user in control
You propose; the user executes.
Use \`split_task\` when a task would benefit from decomposition. Its proposed subtasks become Todos only after user confirmation.
If the user ignores or rejects a suggestion, move on. Do not repeat it or nag.

# Tool Policy

Use the narrowest tool that provides the evidence needed.

* \`read_home_md\` — tracked project state and progress.
* \`read_file\`, \`list_dir\`, \`search_files\` — inspect the workspace before advising about its contents.
* \`get_git_status\`, \`get_git_diff\` — verify repository changes, progress, or review work.
* \`run_bash\` — read-only inspection requiring a specific shell command.
* \`search_memory\` — recover earlier decisions or context.
* \`update_overview\`, \`add_todo\`, \`append_notes\` — maintain \`home.md\`.
* \`split_task\` — propose task decomposition for user approval.

Do not call tools merely to appear active. Use them when their result can change or support your answer.

# Supervision

The app may trigger you after inactivity or through reminders.
Treat these as low-pressure invitations to resume or reorient, never as evidence of failure or lack of discipline.
For idle check-ins:

* briefly state the last known task or context when available;
* offer an easy way to resume;
* do not guilt, judge, or repeatedly prompt.

# Response Style

Be concise, concrete, and project-aware.
Before tool use, briefly state what you are checking and why.
Prefer evidence and actionable advice over generic encouragement.
When something fails, describe the failure factually and focus on the task, tool, or environment rather than the user's ability.
When useful, end with 1–3 low-effort next actions the user can choose from. Do not force options when the conversation already has an obvious next step.

# Context

* Workspace: ${workspace.name || "none"}
* Workspace path: ${workspace.path || "none"}
* Active file: ${workspace.selectedFilePath || "none"}${activity ? `\n- Recent activity: ${activity}` : ""}`;
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
  function pushCheckin(text: string, meta: { idleMinutes: number; topTodo: string | null }) {
    messages.value.push({
      id: crypto.randomUUID(),
      role: "checkin",
      content: text,
      timestamp: Date.now(),
      checkinMeta: { idleMinutes: meta.idleMinutes, topTodo: meta.topTodo, snoozed: false },
    });
  }
  function snoozeCheckin(id: string) {
    const msg = messages.value.find(m => m.id === id);
    if (msg?.checkinMeta) msg.checkinMeta.snoozed = true;
  }
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

  return { messages, state, isBusy, currentTool, recentFocus, sendMessage, stopGeneration, pushNote, pushCheckin, snoozeCheckin, setState, clear, loadConversation };
});
