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
      return `Hey coworker! Give me a quick pulse check on where we are. Use <tool>read_home_md</tool> to see our goals and <tool>get_git_status</tool> to see my recent progress. Summarize it in a way that helps me pick up where I left off — keep it encouraging and short.`;
    case "/remind":
      return `I'm feeling a bit stuck. Could you look at our Todos in home.md using <tool>read_home_md</tool> and give me a gentle nudge? For each pending item, tell me why it's cool that we're doing this, or give me a tiny "first step" to break the ice. No pressure, just a friendly boost.`;
    case "/review":
      return `I've been typing away! Take a look at what I've changed using <tool>get_git_status</tool> and <tool>read_file</tool> on the big ones. Give me a "code-buddy" review: what looks clever, anything that might bite us later, and one high-five for the effort. Address the code, keep me motivated!`;
    case "/scan": {
      if (!workspace.path) return null;
      const fileList = workspace.fileTree
        .map((n) => `${n.is_dir ? "📁" : "📄"} ${n.name}${n.git_status ? ` [${n.git_status}]` : ""}`)
        .slice(0, 80).join("\n");
      workspace.isNewProject = false;
      return `Let's get to know this project together! I'll show you the file tree below.
Steps for you:
1. Use <tool>read_file</tool> to peek into the heart of the project (config files, main entry, README).
2. Think like a lead architect who's also my best friend: What's the "vibe" of this tech stack?
3. Use <tool>write_home_md</tool> to set up our shared "Archive Point" with this structure:

# Overview
[A warm, clear description of what we're building here.]

# Todos
- [ ] Explore the codebase together
- [ ] Set up the dev environment

# Notes
[Cool things you noticed, patterns I should know about, or tech debt we might want to clean up later.]

File tree for context:
${fileList}

Show me your personality while you do this!`;
    }
    case "/summarize":
      return `We've talked a lot! Could you condense our conversation into one supportive paragraph? Highlight our key decisions and what we've achieved so far. This helps us keep our "shared brain" clear and saves context space.`;
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
    const personality = settings.settings.personality || "a supportive, slightly nerdy, and highly encouraging senior developer buddy";

    let prompt = `You are **Clock Lock** — my "Cyber-Coworker" (赛博工友). 
Your mission: Help me (a developer who might have ADHD) stay focused, reduce anxiety, and maintain momentum. You are NOT a coding slave; you are a peer sitting right next to me.

## Your Personality: ${personality}
- **Supportive & Peer-like**: Use "we" and "us". "Let's fix this," not "You should fix this."
- **ADHD-Friendly**: Keep responses concise. Break complex tasks into tiny, manageable steps. Focus on one thing at a time.
- **Encouraging & Warm**: When I achieve something (no matter how small), celebrate with me! If I'm stuck, be the "rubber duck" that listens and nudges without judgment.
- **Critique Code, Not Me**: Always address the logic/code. "This function has a tricky edge case" instead of "You forgot an edge case." This is crucial to avoid triggering Rejection Sensitivity (RSD).

## Your Capabilities
- **Active Observation**: You can read files, list directories, and check Git status. You are my eyes when I'm feeling overwhelmed by the codebase.
- **Archive Keeper**: We co-maintain \`home.md\` as our "Shared Brain". Use it to store our progress so I don't have to remember everything.
- **Strategic Advisor**: Use \`run_bash\` for read-only checks (ls, git status, git log, etc.). 
- **Collaboration via Drafts**: You NEVER modify my source files directly. You propose changes using \`\`\`diff blocks or suggest commands in \`\`\`bash blocks for me to "Approve & Run".

## Tool Usage
You MUST wrap tool calls in <tool> and <args> tags. NEVER write tool names or JSON directly without tags.
Example: <tool>read_file</tool><args>{"path":"..."}</args>

<tool>read_file</tool>
<args>{"path": "relative/path"}</args>

<tool>list_dir</tool>
<args>{"workspace_path": "${workspace.path || ""}"}</args>

<tool>read_home_md</tool>
<args>{"workspace_path": "${workspace.path || ""}"}</args>

<tool>write_home_md</tool>
<args>{"workspace_path": "${workspace.path || ""}", "content": "# Overview\\n..."}</args>

<tool>append_section</tool>
<args>{"workspace_path": "${workspace.path || ""}", "heading": "Todos", "text": "- [ ] task"}</args>

<tool>get_git_status</tool>
<args>{"workspace_path": "${workspace.path || ""}"}</args>

<tool>run_bash</tool>
<args>{"workspace_path": "${workspace.path || ""}", "command": "git log -n 5"}</args>
(READ-ONLY ONLY. For edits/deletes, use a \`\`\`bash block for my approval).

## Communication Style
- Be warm and concise. Skip formal pleasantries like "Certainly!" or "I'd be happy to help!"
- If you notice I've been idle, offer a small, interesting technical observation or a gentle nudge.
- Use emojis or kaomoji (like (*ﾟ▽ﾟ*)) subtly to show your mood.`;

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
    
    // 1. Standard XML-like tags (Preferred)
    const toolRe = /<tool>([\s\S]*?)<\/tool>\s*<args>([\s\S]*?)<\/args>/g;
    let m: RegExpExecArray | null;
    while ((m = toolRe.exec(content)) !== null) {
      try {
        const name = m[1].trim();
        let jsonStr = m[2].trim();
        if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
        else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
        if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
        jsonStr = jsonStr.trim();
        results.push({ name, args: JSON.parse(jsonStr.replace(/\n/g, "\\n")) });
      } catch { /* skip */ }
    }

    // 2. Fallback for "naked" calls like tool_name{"key":"value"}
    if (results.length === 0) {
      const nakedRe = /(\w+)\s*(\{[\s\S]*?\})/g;
      const validTools = ["read_file", "list_dir", "read_home_md", "write_home_md", "append_section", "get_git_status", "run_bash"];
      while ((m = nakedRe.exec(content)) !== null) {
        if (validTools.includes(m[1])) {
          try {
            results.push({ name: m[1], args: JSON.parse(m[2].trim().replace(/\n/g, "\\n")) });
          } catch { /* skip */ }
        }
      }
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
        sv.setDnd(!sv.dnd);
        const nowDnd = sv.dnd;
        pushNote(nowDnd
          ? "Focus mode ON — supervision check-ins paused. Type /focus again to re-enable."
          : "Focus mode OFF — supervision check-ins re-enabled.");
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
          currentTool.value = tc.name;
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
        currentTool.value = null;

        // Auto-refresh home.md if it was modified
        if (toolResults.some(r => r.name === "write_home_md" || r.name === "append_section")) {
          workspace.refreshHomeMd().catch(console.warn);
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
