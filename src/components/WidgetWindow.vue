<script setup lang="ts">
import { ref, computed } from "vue";
import { marked } from "marked";
import { Maximize2, SendHorizonal, CheckCircle2, Activity, Bell, Repeat2 } from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAgentStore } from "../stores/agentStore";
import AgentPet from "./AgentPet.vue";

marked.setOptions({ gfm: true, breaks: true });

const emit = defineEmits<{ restore: [] }>();

const workspace = useWorkspaceStore();
const agent = useAgentStore();

const quickInput = ref("");
const showBubble = ref(true);

const petState = computed<"idle" | "thinking" | "happy" | "sleepy" | "excited">(() => {
  if (!workspace.path) return "sleepy";
  if (agent.state === "excited") return "excited";
  if (agent.isBusy) return "thinking";
  if (agent.state === "happy") return "happy";
  return "idle";
});

const statusLine = computed(() => {
  if (!workspace.path) return "OFFLINE";
  if (agent.currentTool) {
    const tools: Record<string, string> = {
      read_file: "READING",
      list_dir: "SCANNING",
      read_home_md: "CHECKING",
      update_overview: "SAVING",
      add_todo: "SAVING",
      append_notes: "SAVING",
      get_git_status: "GIT CHECK",
      run_bash: "SHELL",
    };
    return tools[agent.currentTool] ?? "BUSY";
  }
  return agent.state.toUpperCase();
});

const lastAgentMsg = computed(() => {
  const msg = [...agent.messages].reverse().find(m => m.role === "assistant");
  return msg ? msg.content : null;
});

const lastAgentMsgHtml = computed(() => {
  if (!lastAgentMsg.value) return "";
  // Truncate to avoid overflow in the tiny widget screen
  const text = lastAgentMsg.value.length > 400
    ? lastAgentMsg.value.slice(0, 400) + "…"
    : lastAgentMsg.value;
  return marked.parse(text) as string;
});

const firstTodo = computed(() => {
  return workspace.homeData?.todos.find(t => !t.done)?.text ?? null;
});

async function sendQuick(text?: string) {
  const val = text || quickInput.value.trim();
  if (!val || agent.isBusy) return;
  quickInput.value = "";
  showBubble.value = true;
  await agent.sendMessage(val);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendQuick();
  }
}

function interact() {
  const triggers = ["How are we doing?", "Give me a high-five!", "Status report"];
  sendQuick(triggers[Math.floor(Math.random() * triggers.length)]);
}
</script>

<template>
  <div class="tamagotchi-shell">
    <div class="device-body" data-tauri-drag-region>
      
      <!-- TOP SCREEN: Maximized -->
      <div class="device-screen">
        <div class="screen-header">
          <div class="pet-wrapper" @click="interact">
            <AgentPet :state="petState" size="sm" />
          </div>
          <div class="status-box">
            <span class="status-text">{{ statusLine }}</span>
          </div>
          <button class="restore-btn" @click="emit('restore')">
            <Maximize2 :size="10" />
          </button>
        </div>

        <div class="screen-main">
          <!-- Full Agent Response -->
          <div v-if="lastAgentMsg && showBubble" class="agent-response" @click="showBubble = false" v-html="lastAgentMsgHtml"></div>

          <!-- Task View -->
          <div v-else class="task-view">
            <div v-if="firstTodo" class="todo-card">
              <span class="todo-label">GOAL</span>
              <p class="todo-text">{{ firstTodo }}</p>
              <button class="complete-btn" @click="workspace.completeFirstTodo()">
                <CheckCircle2 :size="14" />
              </button>
            </div>
            <div v-else class="empty-view">
              <p>COZY TIME (*ﾟ▽ﾟ*)</p>
            </div>
          </div>
        </div>
      </div>

      <!-- MIDDLE: Buttons -->
      <div class="physical-controls">
        <button class="btn-control" @click="sendQuick('/status')" title="Status update">
          <Activity :size="15" />
        </button>
        <button class="btn-control" @click="sendQuick('/remind')" title="Remind me of my todo">
          <Bell :size="15" />
        </button>
        <button
          class="btn-control"
          :title="showBubble ? 'Show current goal' : 'Show last reply'"
          @click="showBubble = !showBubble"
        >
          <Repeat2 :size="15" />
        </button>
      </div>

      <!-- BOTTOM: External Input Bar -->
      <div class="external-input-area">
        <div class="input-container">
          <span class="prompt-icon">></span>
          <input
            v-model="quickInput"
            class="external-input"
            placeholder="COMMAND..."
            :disabled="agent.isBusy"
            @keydown="onKeydown"
          />
          <button class="send-icon-btn" :disabled="!quickInput.trim()" @click="sendQuick()">
            <SendHorizonal :size="12" />
          </button>
        </div>
      </div>

      <div class="keychain-loop"></div>
    </div>
  </div>
</template>

<style scoped>
.tamagotchi-shell {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.device-body {
  position: relative;
  width: 100%;
  height: 100%;
  /* Fill the window so the (transparency-dependent) corners are the only area
     that can show through — on systems without a compositor that keeps the
     visible "black" to just the rounded corners instead of a wide margin. */
  background: linear-gradient(145deg, #ddd6fe, #fbcfe8);
  border-radius: 26px;
  border: 3px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  -webkit-app-region: drag;
}

.device-screen {
  flex: 1; /* Takes most space */
  background: #fdf6e3;
  border: 4px solid #333;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-app-region: no-drag;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1) inset;
}

.screen-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: rgba(0,0,0,0.06);
  border-bottom: 1px solid rgba(0,0,0,0.1);
  gap: 8px;
}

.status-box { flex: 1; text-align: center; }
.status-text { font-size: 9px; font-weight: 900; color: #333; letter-spacing: 0.5px; }

.screen-main {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
}
.screen-main::-webkit-scrollbar { width: 3px; }
.screen-main::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 3px; }

.agent-response {
  font-size: 11px;
  color: #111;
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
  word-break: break-word;
}
.agent-response :deep(p) { margin: 0 0 4px; }
.agent-response :deep(p:last-child) { margin-bottom: 0; }
.agent-response :deep(strong) { font-weight: 800; }
.agent-response :deep(em) { font-style: italic; }
.agent-response :deep(ul), .agent-response :deep(ol) { margin: 2px 0 4px 12px; padding: 0; }
.agent-response :deep(li) { margin-bottom: 1px; }
.agent-response :deep(code) { font-family: monospace; font-size: 10px; background: rgba(0,0,0,0.08); padding: 0 2px; border-radius: 2px; }
.agent-response :deep(pre) { display: none; } /* hide code blocks — too large for widget */
.agent-response :deep(h1), .agent-response :deep(h2), .agent-response :deep(h3) { font-size: 11px; font-weight: 800; margin: 2px 0; }

.task-view { width: 100%; }
.todo-card { display: flex; flex-direction: column; gap: 2px; position: relative; padding-right: 25px; }
.todo-label { font-size: 8px; font-weight: 900; color: #666; }
.todo-text { font-size: 11px; font-weight: 700; color: #222; font-family: var(--font-mono); }
.complete-btn { position: absolute; right: 0; top: 50%; transform: translateY(-50%); background: none; border: none; color: #2ecc71; cursor: pointer; }
.empty-view { text-align: center; font-size: 10px; font-weight: 900; color: #888; padding-top: 10px; }

/* ── Physical Controls ── */
.physical-controls {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 0;
  -webkit-app-region: no-drag;
}
.btn-control {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background: rgba(255, 255, 255, 0.72);
  border: 1.5px solid rgba(0,0,0,0.1);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 0 rgba(0,0,0,0.12);
  color: #333;
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.btn-control:hover { background: rgba(255, 255, 255, 0.9); }
.btn-control:active { transform: translateY(2px); box-shadow: none; }

/* ── External Input ── */
.external-input-area {
  padding: 0 4px;
}
.input-container {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0,0,0,0.08);
  border-radius: 8px;
  padding: 4px 8px;
  border: 1px solid rgba(255,255,255,0.3);
}
.prompt-icon { font-size: 11px; font-weight: 900; color: #e74c3c; }
.external-input {
  flex: 1;
  background: none;
  border: none;
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-mono);
  outline: none;
  color: #444;
}
.send-icon-btn { background: none; border: none; color: #333; cursor: pointer; opacity: 0.7; }
.send-icon-btn:disabled { opacity: 0.2; }

.keychain-loop {
  position: absolute;
  top: -10px;
  left: 30px;
  width: 20px;
  height: 20px;
  border: 4px solid rgba(255,255,255,0.4);
  border-radius: 50%;
  z-index: -1;
}

.restore-btn { background: none; border: none; color: #333; cursor: pointer; opacity: 0.5; }
</style>
