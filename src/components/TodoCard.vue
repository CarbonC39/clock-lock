<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus, X, CheckSquare } from "lucide-vue-next";
import { useWorkspaceStore } from "../stores/workspaceStore";

const workspace = useWorkspaceStore();

const todos = computed(() => workspace.homeData?.todos ?? []);
const doneCount = computed(() => todos.value.filter(t => t.done).length);

const editing = ref<{ index: number; text: string } | null>(null);
const newText = ref("");
const showAdd = ref(false);

function startEdit(i: number) {
  editing.value = { index: i, text: todos.value[i].text };
}
function commitEdit() {
  editing.value = null;
}
function submitNew() {
  const text = newText.value.trim();
  if (!text) { showAdd.value = false; return; }
  newText.value = "";
  showAdd.value = false;
  workspace.addTodo(text);
}
function onNewKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") { e.preventDefault(); submitNew(); }
  if (e.key === "Escape") { showAdd.value = false; newText.value = ""; }
}
</script>

<template>
  <div class="card todo-card">
    <div class="card-head">
      <CheckSquare :size="13" class="head-icon" />
      <span class="head-title">Todos</span>
      <span v-if="todos.length" class="head-count">{{ doneCount }}/{{ todos.length }}</span>
      <button class="add-btn" title="Add task" @click="showAdd = true; newText = ''">
        <Plus :size="14" />
      </button>
    </div>

    <div class="card-body">
      <div v-if="showAdd" class="new-row">
        <input
          v-model="newText"
          class="new-input"
          placeholder="New task…"
          autofocus
          @keydown="onNewKeydown"
          @blur="submitNew"
        />
      </div>

      <div
        v-for="(todo, i) in todos"
        :key="i"
        class="task-row"
        :class="{ done: todo.done }"
      >
        <button
          class="task-check"
          :class="{ on: todo.done }"
          @click="workspace.toggleTodo(i, !todo.done)"
        >
          <span v-if="todo.done" class="check-mark" />
        </button>

        <input
          v-if="editing && editing.index === i"
          v-model="editing.text"
          class="task-edit-input"
          @blur="commitEdit"
          @keydown.enter="commitEdit"
          @keydown.escape="editing = null"
          @click.stop
        />
        <span v-else class="task-text" @dblclick="startEdit(i)">{{ todo.text || "…" }}</span>

        <button class="task-remove" title="Remove" @click="workspace.deleteTodo(i)">
          <X :size="10" />
        </button>
      </div>

      <p v-if="!todos.length && !showAdd" class="empty-hint">
        No tasks yet. Hit <span class="kbd">+</span> or ask the agent.
      </p>
    </div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--color-border-soft);
  flex-shrink: 0;
}
.head-icon { color: var(--color-accent-teal); flex-shrink: 0; }
.head-title {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--color-text-primary);
  flex: 1;
}
.head-count {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-accent-teal);
  background: color-mix(in srgb, var(--color-accent-teal) 12%, transparent);
  padding: 1px 6px;
  border-radius: 99px;
}
.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition);
}
.add-btn:hover { background: var(--color-surface-hover); color: var(--color-accent-teal); }

.card-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 5px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  transition: background-color var(--transition);
}
.task-row:hover { background: color-mix(in srgb, var(--color-accent-teal) 6%, transparent); }
.task-row:hover .task-remove { opacity: 1; }
.task-row.done .task-text { text-decoration: line-through; color: var(--color-text-muted); opacity: 0.7; }

.task-check {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1.5px solid var(--color-border);
  border-radius: 3px;
  cursor: pointer;
  padding: 0;
  transition: all var(--transition);
}
.task-check:hover { border-color: var(--color-accent-teal); }
.task-check.on { background: var(--color-accent-teal); border-color: var(--color-accent-teal); }
.check-mark {
  display: block;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) translate(-1px, -1px);
}

.task-text {
  flex: 1;
  color: var(--color-text-secondary);
  line-height: 1.45;
  word-break: break-word;
  cursor: default;
}
.task-edit-input,
.new-input {
  flex: 1;
  width: 100%;
  padding: 3px 7px;
  background: var(--color-input-bg);
  border: 1px solid var(--color-accent-teal);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: 12.5px;
  font-family: var(--font-sans);
  line-height: 1.45;
  outline: none;
  min-width: 0;
  box-sizing: border-box;
}
.new-row { padding: 2px 5px 4px; }

.task-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  background: none;
  border: none;
  border-radius: 3px;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  padding: 0;
  transition: all var(--transition);
}
.task-remove:hover { background: color-mix(in srgb, var(--color-accent-red) 12%, transparent); color: var(--color-accent-red); }

.empty-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  font-style: italic;
  padding: 6px 5px;
  line-height: 1.5;
  margin: 0;
}
.kbd {
  font-family: var(--font-mono);
  font-style: normal;
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0 4px;
  font-size: 11px;
}
</style>
