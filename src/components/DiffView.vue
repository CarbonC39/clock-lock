<script setup lang="ts">
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { FileText, Check, AlertCircle, Loader2 } from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";

const props = defineProps<{
  diffText: string;
}>();

const emit = defineEmits<{ applied: [] }>();

const workspace = useWorkspaceStore();

type ApplyState = "idle" | "applying" | "done" | "error";
const applyState = ref<ApplyState>("idle");
const applyError = ref("");

interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: "context" | "add" | "remove" | "header";
  content: string;
}

const filePath = computed(() => {
  const match = props.diffText.match(/^\+\+\+ b\/(.+)$/m);
  return match ? match[1].trim() : null;
});

const fileName = computed(() => {
  return filePath.value?.split("/").pop() ?? "unknown file";
});

const hunks = computed((): DiffHunk[] => {
  const result: DiffHunk[] = [];
  const lines = props.diffText.split("\n");
  let current: DiffHunk | null = null;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (current) result.push(current);
      current = {
        oldStart: parseInt(hunkMatch[1]),
        oldCount: parseInt(hunkMatch[2] || "1"),
        newStart: parseInt(hunkMatch[3]),
        newCount: parseInt(hunkMatch[4] || "1"),
        lines: [],
      };
      current.lines.push({ type: "header", content: line });
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+")) {
      current.lines.push({ type: "add", content: line.slice(1) });
    } else if (line.startsWith("-")) {
      current.lines.push({ type: "remove", content: line.slice(1) });
    } else if (line.startsWith(" ") || line === "") {
      current.lines.push({
        type: "context",
        content: line.startsWith(" ") ? line.slice(1) : line,
      });
    }
  }
  if (current) result.push(current);
  return result;
});

function computeNewContent(original: string): string {
  const sorted = [...hunks.value].sort((a, b) => b.oldStart - a.oldStart);
  const result = original.split("\n");

  for (const hunk of sorted) {
    const newLines: string[] = [];
    let oldLineCount = 0;
    for (const line of hunk.lines) {
      if (line.type === "header") continue;
      if (line.type === "context" || line.type === "remove") {
        oldLineCount++;
      }
      if (line.type === "context" || line.type === "add") {
        newLines.push(line.content);
      }
    }
    // new-file diffs have oldStart=0, splice at start of array
    const start = Math.max(0, hunk.oldStart - 1);
    result.splice(start, oldLineCount, ...newLines);
  }

  return result.join("\n");
}

async function apply() {
  if (!filePath.value || !workspace.path) return;
  applyState.value = "applying";
  applyError.value = "";

  try {
    const fullPath = workspace.path.replace(/[/\\]$/, "").replace(/\\/g, "/") + "/" + filePath.value;
    let original = "";
    try {
      original = await invoke<string>("read_file", { path: fullPath });
    } catch {
      original = "";
    }
    const newContent = computeNewContent(original);

    await invoke("write_file_with_backup", {
      workspacePath: workspace.path,
      filePath: fullPath,
      content: newContent,
    });

    applyState.value = "done";
    emit("applied");
    await workspace.refreshTree();

    // Refresh selected file content if it's the same file
    if (workspace.selectedFilePath === fullPath) {
      workspace.selectedFileContent = newContent;
    }
  } catch (e) {
    applyState.value = "error";
    applyError.value = String(e);
  }
}

function cancel() {
  applyState.value = "idle";
  applyError.value = "";
}
</script>

<template>
  <div class="diff-view">
    <!-- Header -->
    <div class="diff-header">
      <div class="diff-file-info">
        <FileText :size="12" />
        <span class="diff-filename">{{ fileName }}</span>
        <span v-if="filePath !== fileName" class="diff-path">{{ filePath }}</span>
      </div>
      <div class="diff-actions">
        <template v-if="applyState === 'idle'">
          <button class="apply-btn" @click="apply">Apply changes</button>
        </template>
        <template v-else-if="applyState === 'applying'">
          <span class="status-label applying">
            <Loader2 :size="12" class="spin" /> Applying...
          </span>
        </template>
        <template v-else-if="applyState === 'done'">
          <span class="status-label done">
            <Check :size="12" /> Applied
          </span>
          <button class="undo-btn" @click="cancel">Dismiss</button>
        </template>
        <template v-else>
          <span class="status-label error">
            <AlertCircle :size="12" />
            {{ applyError || "Failed" }}
          </span>
          <button class="retry-btn" @click="apply">Retry</button>
          <button class="undo-btn" @click="cancel">Dismiss</button>
        </template>
      </div>
    </div>

    <!-- Diff content -->
    <div class="diff-body">
      <template v-for="(hunk, hi) in hunks" :key="hi">
        <div
          v-for="(line, li) in hunk.lines"
          :key="`${hi}-${li}`"
          class="diff-line"
          :class="`diff-${line.type === 'header' ? 'hunk-header' : line.type}`"
        >
          <span v-if="line.type === 'header'" class="line-num">&nbsp;</span>
          <span v-else-if="line.type === 'add'" class="line-num">+</span>
          <span v-else-if="line.type === 'remove'" class="line-num">-</span>
          <span v-else class="line-num">&nbsp;</span>
          <span class="line-content">{{ line.content }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.diff-view {
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-accent-purple);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin: 6px 0;
  font-size: 12px;
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--color-surface) 80%, var(--color-bg));
  border-bottom: 1px solid var(--color-border);
  gap: 8px;
}

.diff-file-info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--color-text-secondary);
}

.diff-filename {
  font-weight: 600;
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: nowrap;
}

.diff-path {
  font-size: 10px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.apply-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  background: var(--color-accent-blue);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: opacity var(--transition);
  white-space: nowrap;
}
.apply-btn:hover { opacity: 0.85; }

.status-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.status-label.done { color: var(--color-accent-green); }
.status-label.error { color: var(--color-accent-red); }
.status-label.applying { color: var(--color-text-muted); }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.undo-btn,
.retry-btn {
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
}
.undo-btn:hover,
.retry-btn:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text-primary);
}

/* ── Diff lines ── */
.diff-body {
  background: var(--editor-bg, var(--color-surface));
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.65;
}

.diff-line {
  display: flex;
  min-height: 20px;
}

.diff-add {
  background: color-mix(in srgb, var(--color-accent-green) 12%, transparent);
  color: color-mix(in srgb, var(--color-accent-green) 85%, var(--color-text-primary));
}

.diff-remove {
  background: color-mix(in srgb, var(--color-accent-red) 10%, transparent);
  color: color-mix(in srgb, var(--color-accent-red) 85%, var(--color-text-primary));
}

.diff-hunk-header {
  background: color-mix(in srgb, var(--color-accent-purple) 8%, transparent);
  color: var(--color-accent-purple);
  font-weight: 600;
  padding: 2px 0;
}

.diff-context { color: var(--color-text-secondary); }

.line-num {
  width: 20px;
  flex-shrink: 0;
  text-align: center;
  color: var(--color-text-muted);
  user-select: none;
  padding-left: 4px;
}

.diff-add .line-num {
  color: var(--color-accent-green);
}

.diff-remove .line-num {
  color: var(--color-accent-red);
}

.line-content {
  flex: 1;
  white-space: pre;
  padding-right: 8px;
  overflow: hidden;
}
</style>
