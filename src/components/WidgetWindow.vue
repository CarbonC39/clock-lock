<script setup lang="ts">
import { ref, computed } from "vue";
import { Maximize2, SendHorizonal, CheckCircle2 } from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAgentStore } from "../stores/agentStore";
import AgentPet from "./AgentPet.vue";

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
      read_file: "READING...",
      list_dir: "SCANNING...",
      read_home_md: "CHECKING GOALS...",
      write_home_md: "UPDATING...",
      get_git_status: "GIT CHECK...",
      run_bash: "BASH RUN...",
    };
    return tools[agent.currentTool] ?? "WORKING...";
  }
  if (agent.isBusy) return "THINKING...";
  return agent.state.toUpperCase();
});

const lastAgentMsg = computed(() => {
  const msg = [...agent.messages].reverse().find(m => m.role === "assistant");
  if (!msg) return null;
  return msg.content.length > 80 ? msg.content.slice(0, 77) + "..." : msg.content;
});

const firstTodo = computed(() => {
  if (!workspace.homeMdContent) return null;
  const lines = workspace.homeMdContent.split("\n");
  let inSection = false;
  for (const line of lines) {
    if (/^#\s+(todo|progress)/i.test(line)) { inSection = true; continue; }
    if (/^#\s+/.test(line)) { inSection = false; continue; }
    if (inSection) {
      const m = line.match(/^-\s*\[ \]\s+(.+)/);
      if (m) return m[1].trim();
    }
  }
  return null;
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
  const triggers = ["How are we doing?", "Give me a high-five!", "I'm working hard!", "Status check"];
  const rand = triggers[Math.floor(Math.random() * triggers.length)];
  sendQuick(rand);
}
</script>

<template>
  <div class="tamagotchi-shell">
    <div class="device-body" data-tauri-drag-region>
      
      <div class="device-screen">
        <!-- Header: Status + Pet -->
        <div class="screen-header">
          <div class="pet-wrapper" @click="interact">
            <AgentPet :state="petState" size="sm" />
          </div>
          <div class="status-box">
            <div class="status-dot" :class="agent.isBusy ? 'busy' : 'ready'"></div>
            <span class="status-text">{{ statusLine }}</span>
          </div>
          <button class="restore-btn" @click="emit('restore')">
            <Maximize2 :size="10" />
          </button>
        </div>

        <!-- Main Area -->
        <div class="screen-main">
          <div v-if="lastAgentMsg && showBubble" class="speech-bubble" @click="showBubble = false">
            <p>{{ lastAgentMsg }}</p>
          </div>

          <div class="task-view" v-else>
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

        <!-- Integrated Input -->
        <div class="screen-input-area">
          <input
            v-model="quickInput"
            class="lcd-input"
            placeholder="ASK ME..."
            :disabled="agent.isBusy"
            @keydown="onKeydown"
          />
        </div>
      </div>

      <!-- Labeled Physical Controls -->
      <div class="physical-controls">
        <div class="control-group">
          <button class="btn-circle" @click="sendQuick('/status')">
            <Maximize2 :size="10" style="transform: rotate(45deg)" />
          </button>
          <span class="control-label">STATUS</span>
        </div>
        <div class="control-group">
          <button class="btn-circle" @click="sendQuick('/remind')">
            <span style="font-size: 10px">♥</span>
          </button>
          <span class="control-label">NUDGE</span>
        </div>
        <div class="control-group">
          <button class="btn-circle" @click="showBubble = !showBubble">
            <span style="font-size: 10px">💬</span>
          </button>
          <span class="control-label">VIEW</span>
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
  width: 240px;
  height: 130px;
  background: linear-gradient(145deg, #ddd6fe, #fbcfe8);
  border-radius: 40px;
  border: 3px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  padding: 12px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  -webkit-app-region: drag;
}

.device-screen {
  flex: 1;
  background: #fdf6e3;
  border: 4px solid #333;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

/* ── Header ── */
.screen-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: rgba(0,0,0,0.06);
  border-bottom: 1px solid rgba(0,0,0,0.1);
  gap: 8px;
}

.pet-wrapper { cursor: pointer; }

.status-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
}

.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.status-dot.ready { background: #2ecc71; box-shadow: 0 0 4px #2ecc71; }
.status-dot.busy  { background: #e74c3c; box-shadow: 0 0 4px #e74c3c; animation: pulse 1s infinite; }

@keyframes pulse { 50% { opacity: 0.5; } }

.status-text {
  font-size: 9px;
  font-weight: 900;
  color: #333;
  letter-spacing: 0.5px;
}

/* ── Main Area ── */
.screen-main {
  flex: 1;
  position: relative;
  padding: 8px;
  background-image: radial-gradient(#000 0.5px, transparent 0.5px);
  background-size: 3px 3px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.speech-bubble {
  background: #fff;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 10px;
  color: #333;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  animation: popIn 0.2s ease-out;
}

@keyframes popIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }

.task-view {
  width: 100%;
}

.todo-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
  padding-right: 25px;
}

.todo-label { font-size: 8px; font-weight: 900; color: #666; }
.todo-text {
  font-size: 11px;
  font-weight: 700;
  color: #222;
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.complete-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #2ecc71;
  cursor: pointer;
}

.empty-view { text-align: center; font-size: 10px; font-weight: 900; color: #888; }

/* ── Footer / Input ── */
.screen-input-area {
  padding: 4px 8px;
  background: rgba(0,0,0,0.08);
  border-top: 1px solid rgba(0,0,0,0.1);
}

.lcd-input {
  width: 100%;
  background: rgba(255,255,255,0.4);
  border: 1px solid rgba(0,0,0,0.2);
  border-radius: 4px;
  font-size: 10px;
  font-family: var(--font-mono);
  padding: 2px 6px;
  outline: none;
  color: #222;
}
.lcd-input::placeholder { color: #888; }

/* ── Physical Controls ── */
.physical-controls {
  display: flex;
  justify-content: space-around;
  padding: 0 10px;
}

.control-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.btn-circle {
  width: 24px;
  height: 24px;
  background: rgba(255,255,255,0.7);
  border: 2px solid rgba(0,0,0,0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 0 rgba(0,0,0,0.15);
  -webkit-app-region: no-drag;
}
.btn-circle:active { transform: translateY(1px); box-shadow: none; }

.control-label {
  font-size: 8px;
  font-weight: 900;
  color: rgba(0,0,0,0.4);
  letter-spacing: 0.5px;
}

.keychain-loop {
  position: absolute;
  top: -10px;
  left: 25px;
  width: 20px;
  height: 20px;
  border: 4px solid rgba(255,255,255,0.4);
  border-radius: 50%;
  z-index: -1;
}

.restore-btn {
  background: none;
  border: none;
  color: #333;
  cursor: pointer;
  opacity: 0.5;
}
.restore-btn:hover { opacity: 1; }
</style>
