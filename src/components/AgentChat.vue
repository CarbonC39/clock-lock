<script setup lang="ts">
import { ref, nextTick, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { SendHorizonal, Settings2, Trash2, ScanEye, ChevronDown, ChevronUp } from "lucide-vue-next";
import { useAgentStore, getSlashCommands } from "../stores/agentStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useSupervisionStore } from "../stores/supervisionStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import ChatMessage from "./ChatMessage.vue";
import AgentPet from "./AgentPet.vue";

const router = useRouter();
const agent = useAgentStore();
const settings = useSettingsStore();
const sv = useSupervisionStore();
const workspace = useWorkspaceStore();

const inputText = ref("");
const messagesEl = ref<HTMLDivElement>();
const shortcutsOpen = ref(false);

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
  });
}

watch(() => agent.messages.length, scrollToBottom);
watch(
  () => agent.messages[agent.messages.length - 1]?.content,
  scrollToBottom
);

async function send() {
  const text = inputText.value.trim();
  if (!text || agent.isBusy) return;
  inputText.value = "";
  await agent.sendMessage(text);
  sv.reportActivity();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

onMounted(() => {
  sv.start();
});
</script>

<template>
  <div class="agent-chat">
    <!-- ── Header ── -->
    <div class="panel-header">
      <AgentPet :state="agent.state" size="sm" />
      <span class="panel-title">Agent</span>
      <div class="header-actions">
        <button
          v-if="agent.messages.length"
          class="hdr-btn"
          title="Clear chat"
          @click="agent.clear()"
        >
          <Trash2 :size="12" />
        </button>
        <button
          class="hdr-btn"
          title="Settings"
          @click="router.push('/settings')"
        >
          <Settings2 :size="12" />
        </button>
      </div>
    </div>

    <!-- ── Messages ── -->
    <div ref="messagesEl" class="messages">
      <!-- Intro when empty -->
      <div v-if="!agent.messages.length" class="intro">
        <AgentPet :state="agent.state" size="lg" />
        <p class="intro-text">
          Hi! I'm your AI workspace companion.<br>
          Open a workspace and ask me anything about your project.
        </p>
        <div v-if="!settings.settings.api_key && settings.settings.provider === 'cloud'" class="setup-hint">
          Configure your API key in
          <button class="link-btn" @click="router.push('/settings')">Settings</button>
          to get started.
        </div>
      </div>

      <!-- Init scan prompt -->
      <div
        v-if="workspace.isNewProject && !agent.messages.length && settings.settings.base_url"
        class="scan-prompt"
      >
        <p>
          This looks like a new project. I can scan the files and write an overview to <strong>home.md</strong>.
        </p>
        <button class="scan-btn" :disabled="agent.isBusy" @click="agent.scanProject()">
          <ScanEye :size="14" />
          {{ agent.isBusy ? "Scanning…" : "Scan &amp; summarize" }}
        </button>
      </div>

      <ChatMessage
        v-for="msg in agent.messages"
        :key="msg.id"
        :message="msg"
      />
    </div>

    <!-- ── Input ── -->
    <div class="input-area">
      <!-- Slash shortcuts -->
      <div class="shortcuts-bar">
        <button class="shortcuts-toggle" @click="shortcutsOpen = !shortcutsOpen">
          <component :is="shortcutsOpen ? ChevronDown : ChevronUp" :size="10" />
          Quick actions
        </button>
        <div v-if="shortcutsOpen" class="shortcuts-list">
          <button
            v-for="sc in getSlashCommands()"
            :key="sc.id"
            class="shortcut-chip"
            @click="inputText = sc.cmd"
          >
            {{ sc.cmd }}
          </button>
        </div>
      </div>

      <div class="input-row" :class="{ disabled: agent.isBusy }">
        <textarea
          v-model="inputText"
          class="chat-input"
          placeholder="Ask me anything… (Enter to send)"
          rows="1"
          :disabled="agent.isBusy"
          @keydown="onKeydown"
          @input="(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }"
        />
        <button
          class="send-btn"
          :disabled="agent.isBusy || !inputText.trim()"
          @click="send"
        >
          <SendHorizonal :size="14" />
        </button>
      </div>
      <div class="input-footer">
        <span class="model-badge">
          {{ settings.settings.provider === "ollama" ? "Ollama" : "Cloud" }}
          · {{ settings.settings.model }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Header ── */
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  flex: 1;
}

.header-actions {
  display: flex;
  gap: 2px;
}

.hdr-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--transition), background-color var(--transition);
}
.hdr-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

/* ── Messages ── */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  text-align: center;
  padding: 20px;
}

.intro-text {
  font-size: 13px;
  color: var(--color-text-muted);
  line-height: 1.6;
  margin: 0;
}

.setup-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  margin-top: 4px;
}

.link-btn {
  background: none;
  border: none;
  color: var(--color-accent-blue);
  cursor: pointer;
  font-size: inherit;
  padding: 0;
  text-decoration: underline;
}

/* ── Scan prompt ── */
.scan-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px;
  background: color-mix(in srgb, var(--color-accent-purple) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-purple) 20%, transparent);
  border-radius: var(--radius-md);
  text-align: center;
}

.scan-prompt p {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.55;
  margin: 0;
}

.scan-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 18px;
  font-size: 12px;
  font-weight: 600;
  background: var(--color-accent-purple);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: opacity var(--transition);
}
.scan-btn:hover:not(:disabled) { opacity: 0.85; }
.scan-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Shortcuts bar ── */
.shortcuts-bar {
  padding: 0 0 6px;
}

.shortcuts-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  font-size: 10px;
  font-weight: 600;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity var(--transition);
}
.shortcuts-toggle:hover { opacity: 1; }

.shortcuts-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-top: 4px;
}

.shortcut-chip {
  padding: 2px 8px;
  font-size: 11px;
  font-family: var(--font-mono);
  font-weight: 500;
  background: color-mix(in srgb, var(--color-accent-purple) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-purple) 16%, transparent);
  border-radius: var(--radius-sm);
  color: var(--color-accent-purple);
  cursor: pointer;
  transition: all var(--transition);
}
.shortcut-chip:hover {
  background: color-mix(in srgb, var(--color-accent-purple) 16%, transparent);
  border-color: var(--color-accent-purple);
}

/* ── Input ── */
.input-area {
  border-top: 1px solid var(--color-border);
  padding: 8px 10px 6px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.input-row {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  transition: border-color var(--transition);
  overflow: hidden;
}

.input-row:focus-within {
  border-color: var(--color-accent-blue);
}

.input-row.disabled {
  opacity: 0.5;
}

.chat-input {
  flex: 1;
  resize: none;
  background: transparent;
  border: none;
  padding: 8px 10px;
  font-size: 13px;
  font-family: var(--font-sans);
  color: var(--color-text-primary);
  line-height: 1.5;
  outline: none;
  min-height: 36px;
  max-height: 120px;
  overflow-y: auto;
}
.chat-input:disabled { cursor: not-allowed; }
.chat-input::placeholder { color: var(--color-text-muted); }

.send-btn {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 36px;
  padding-bottom: 9px;
  flex-shrink: 0;
  background: none;
  border: none;
  border-left: 1px solid var(--color-border);
  color: var(--color-accent-blue);
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition);
}
.send-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent-blue) 8%, transparent);
}
.send-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.input-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.model-badge {
  font-size: 10.5px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}
</style>
