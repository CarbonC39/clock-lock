<script setup lang="ts">
import { ref } from "vue";
import { useAgentStore } from "../stores/agentStore";

const agent = useAgentStore();
const inputText = ref("");

// Pet state display map
const petFace: Record<string, string> = {
  idle: "(・ω・)",
  thinking: "(・・ ) ...",
  happy: "(＾▽＾)",
  sleepy: "(-.-) zzz",
  excited: "(*ﾟ▽ﾟ*)",
};
</script>

<template>
  <div class="agent-chat">
    <!-- Panel header with pet character -->
    <div class="panel-header">
      <span class="pet-face">{{ petFace[agent.state] }}</span>
      <span class="panel-title">Agent</span>
    </div>

    <!-- Message area -->
    <div class="message-area">
      <div class="intro-message">
        <p>Hi! Open a workspace and I'll help you track progress, answer questions, and keep you moving.</p>
      </div>
      <!-- Messages render here in M4 -->
    </div>

    <!-- Input area -->
    <div class="input-area">
      <textarea
        v-model="inputText"
        class="chat-input"
        placeholder="Message agent... (M4)"
        rows="3"
        disabled
      />
      <button class="send-btn" disabled>Send</button>
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

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.pet-face {
  font-size: 12px;
  color: var(--color-accent-purple);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

/* Message area */
.message-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.intro-message {
  padding: 10px 12px;
  background-color: var(--color-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.intro-message p {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* Input area */
.input-area {
  padding: 10px 12px;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.chat-input {
  width: 100%;
  resize: none;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  font-size: 13px;
  font-family: var(--font-sans);
  color: var(--color-text-primary);
  line-height: 1.5;
  outline: none;
  transition: border-color var(--transition);
}

.chat-input:focus {
  border-color: var(--color-accent-blue);
}

.chat-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  align-self: flex-end;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  background-color: var(--color-accent-blue);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: opacity var(--transition);
}

.send-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
