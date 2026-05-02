<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { Play, ShieldAlert, ShieldCheck, ShieldX, RotateCw } from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useSettingsStore } from "../stores/settingsStore";

const props = defineProps<{ command: string }>();

type Safety = "safe" | "unsafe" | "blocked";
type RunState = "idle" | "running" | "done" | "error";

const workspace = useWorkspaceStore();
const settings = useSettingsStore();
const safety = ref<Safety>("unsafe");
const runState = ref<RunState>("idle");
const stdout = ref("");
const stderr = ref("");
const didAutoRun = ref(false);

onMounted(async () => {
  const cls = await invoke<string>("classify_command", { command: props.command });
  safety.value = cls as Safety;
  if (cls === "safe" && !didAutoRun.value) {
    didAutoRun.value = true;
    await run();
  }
});

async function run() {
  if (safety.value === "blocked" || runState.value === "running") return;
  runState.value = "running";
  stdout.value = "";
  stderr.value = "";

  // Log user-approved bash runs (skip auto-runs)
  if (!didAutoRun.value && workspace.hash) {
    invoke("log_event", {
      workspaceHash: workspace.hash,
      eventType: "bash-run",
      description: `Ran: ${props.command}`,
    }).catch(() => {});
  }

  try {
    const result = await invoke<{ stdout: string; stderr: string; success: boolean; blocked: boolean }>(
      "run_command",
      {
        command: props.command,
        workspacePath: workspace.path ?? undefined,
        shellPath: settings.settings.shell_path || undefined,
      }
    );
    stdout.value = result.stdout;
    stderr.value = result.stderr;
    runState.value = result.success ? "done" : "error";
  } catch (e) {
    stderr.value = String(e);
    runState.value = "error";
  }
}
</script>

<template>
  <div class="bash-block" :class="`safety-${safety}`">
    <div class="bash-header">
      <div class="bash-label">
        <ShieldCheck v-if="safety === 'safe'" :size="11" class="safety-icon" />
        <ShieldAlert v-else-if="safety === 'unsafe'" :size="11" class="safety-icon" />
        <ShieldX v-else :size="11" class="safety-icon" />
        <span>bash</span>
      </div>

      <div class="bash-controls">
        <span v-if="runState === 'running'" class="run-label">Running…</span>

        <button
          v-else-if="safety === 'unsafe' && runState === 'idle'"
          class="approve-btn"
          @click="run"
        >
          <Play :size="10" /> Approve &amp; Run
        </button>

        <button
          v-else-if="runState === 'done' || runState === 'error'"
          class="rerun-btn"
          title="Re-run"
          @click="run"
        >
          <RotateCw :size="10" />
        </button>
      </div>
    </div>

    <pre class="bash-code"><code>{{ command }}</code></pre>

    <div v-if="runState !== 'idle'" class="bash-output">
      <div v-if="runState === 'running'" class="output-spinner">
        <span class="dot-pulse" />
      </div>
      <template v-else>
        <pre v-if="stdout" class="output-stdout">{{ stdout }}</pre>
        <pre v-if="stderr" class="output-stderr">{{ stderr }}</pre>
        <div v-if="!stdout && !stderr" class="output-empty">(no output)</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.bash-block {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin: 6px 0;
  font-size: 12px;
}

/* Safety border accent */
.safety-safe   { border-left: 3px solid var(--color-accent-green); }
.safety-unsafe { border-left: 3px solid var(--color-accent-yellow); }
.safety-blocked{ border-left: 3px solid var(--color-accent-red);  }

.bash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  background: color-mix(in srgb, var(--color-surface) 80%, var(--color-bg));
  border-bottom: 1px solid var(--color-border);
}

.bash-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.safety-safe   .safety-icon { color: var(--color-accent-green); }
.safety-unsafe .safety-icon { color: var(--color-accent-yellow); }
.safety-blocked .safety-icon { color: var(--color-accent-red); }

.bash-controls { display: flex; align-items: center; gap: 6px; }

.run-label {
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
}

.approve-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  background: color-mix(in srgb, var(--color-accent-yellow) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent-yellow) 40%, transparent);
  color: var(--color-accent-yellow);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
}
.approve-btn:hover {
  background: var(--color-accent-yellow);
  color: var(--color-bg);
}

.rerun-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition);
}
.rerun-btn:hover { color: var(--color-text-primary); border-color: var(--color-text-muted); }

.bash-code {
  margin: 0;
  padding: 10px 14px;
  background: var(--editor-bg, var(--color-surface));
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  color: var(--color-text-primary);
  overflow-x: auto;
  white-space: pre;
}

.bash-code code { background: none; border: none; padding: 0; color: inherit; font-size: inherit; }

.bash-output {
  border-top: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 70%, var(--color-surface));
  max-height: 260px;
  overflow-y: auto;
}

.output-spinner {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  gap: 6px;
}

.dot-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent-blue);
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50%       { opacity: 1;   transform: scale(1.1); }
}

.output-stdout,
.output-stderr {
  margin: 0;
  padding: 8px 14px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.output-stdout { color: var(--color-text-secondary); }
.output-stderr { color: var(--color-accent-red); }

.output-empty {
  padding: 8px 14px;
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
}
</style>
