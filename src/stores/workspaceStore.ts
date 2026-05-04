import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useAgentStore } from "./agentStore";

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
  git_status?: string;
}

export interface SessionState {
  last_active_at: number;
  current_focus_file: string | null;
  last_summary: string | null;
}

export interface TodoItem {
  text: string;
  done: boolean;
}

export interface HomeData {
  overview: string;
  todos: TodoItem[];
  notes: string;
  last_modified: number;
}

export const useWorkspaceStore = defineStore("workspace", () => {
  const path = ref<string | null>(null);
  const name = ref<string | null>(null);
  const hash = ref<string | null>(null);
  const fileTree = ref<FileNode[]>([]);
  const homeData = ref<HomeData | null>(null);
  const selectedFilePath = ref<string | null>(null);
  const selectedFileContent = ref<string | null>(null);
  const sessionState = ref<SessionState | null>(null);
  const isLoading = ref(false);
  const isNewProject = ref(false);

  // Backward-compat computed for any remaining consumers of homeMdContent
  const homeMdContent = computed(() => {
    if (!homeData.value) return "";
    const todos = homeData.value.todos
      .map(t => `- [${t.done ? "x" : " "}] ${t.text}`)
      .join("\n") || "*No tasks yet.*";
    return `# Overview\n\n${homeData.value.overview || ""}\n\n# Todos\n\n${todos}\n\n# Notes\n\n${homeData.value.notes || ""}`;
  });

  let unlistenHomeMd: (() => void) | null = null;

  async function openWorkspace() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected) return;
    await loadWorkspace(selected as string);
  }

  async function loadWorkspace(dirPath: string) {
    isLoading.value = true;
    homeData.value = null;
    selectedFilePath.value = null;
    selectedFileContent.value = null;
    sessionState.value = null;

    // Tear down previous home.md listener
    unlistenHomeMd?.();
    unlistenHomeMd = null;

    try {
      const [tree, data, wsHash] = await Promise.all([
        invoke<FileNode[]>("list_dir", { workspacePath: dirPath }),
        invoke<HomeData>("read_home", { workspacePath: dirPath }),
        invoke<string>("get_workspace_hash", { workspacePath: dirPath }),
      ]);
      fileTree.value = tree;
      homeData.value = data;
      hash.value = wsHash;
      name.value = dirPath.replace(/\\/g, "/").split("/").pop() ?? dirPath;
      path.value = dirPath;

      try {
        sessionState.value = await invoke<SessionState | null>("get_session_state", {
          workspaceHash: wsHash,
        });
      } catch {
        sessionState.value = null;
      }

      isNewProject.value =
        !data.overview.trim() &&
        data.todos.length === 0 &&
        tree.length > 0;
    } catch (e) {
      console.error("Failed to open workspace:", e);
      throw e;
    } finally {
      isLoading.value = false;
    }

    invoke("start_watching", { workspacePath: dirPath }).catch(console.warn);
    invoke("set_last_workspace", { workspacePath: dirPath }).catch(console.warn);

    // Listen for external edits or agent changes from other windows
    unlistenHomeMd = await listen("home-md-changed", async () => {
      if (!path.value) return;
      try {
        homeData.value = await invoke<HomeData>("read_home", { workspacePath: path.value });
      } catch (e) {
        console.warn("home-md-changed refresh failed:", e);
      }
    });

    const agent = useAgentStore();
    agent.loadConversation().catch(console.warn);
  }

  async function saveSessionState(state: Partial<SessionState>) {
    if (!hash.value) return;
    const newState = {
      last_active_at: Math.floor(Date.now() / 1000),
      current_focus_file: selectedFilePath.value,
      last_summary: sessionState.value?.last_summary || null,
      ...state,
    };
    sessionState.value = newState;
    await invoke("save_session_state", {
      workspaceHash: hash.value,
      state: newState,
    }).catch(console.warn);
  }

  async function refreshTree() {
    if (!path.value) return;
    const tree = await invoke<FileNode[]>("list_dir", { workspacePath: path.value });
    fileTree.value = tree;
  }

  async function refreshHomeMd() {
    if (!path.value) return;
    try {
      homeData.value = await invoke<HomeData>("read_home", { workspacePath: path.value });
    } catch (e) {
      console.error("Failed to refresh home.md:", e);
    }
  }

  async function saveOverview(text: string) {
    if (!path.value || !homeData.value) return;
    const updated: HomeData = { ...homeData.value, overview: text };
    try {
      await invoke("save_home", { workspacePath: path.value, data: updated });
      homeData.value = await invoke<HomeData>("read_home", { workspacePath: path.value });
    } catch (e: unknown) {
      const msg = String(e);
      if (msg.includes("modified externally")) {
        await refreshHomeMd();
        console.warn("Overview save conflict — refreshed from disk");
      } else {
        throw e;
      }
    }
  }

  async function saveNotes(text: string) {
    if (!path.value || !homeData.value) return;
    const updated: HomeData = { ...homeData.value, notes: text };
    try {
      await invoke("save_home", { workspacePath: path.value, data: updated });
      homeData.value = await invoke<HomeData>("read_home", { workspacePath: path.value });
    } catch (e: unknown) {
      const msg = String(e);
      if (msg.includes("modified externally")) {
        await refreshHomeMd();
        console.warn("Notes save conflict — refreshed from disk");
      } else {
        throw e;
      }
    }
  }

  async function addTodo(text: string) {
    if (!path.value) return;
    homeData.value = await invoke<HomeData>("add_todo_cmd", { workspacePath: path.value, text });
  }

  async function toggleTodo(index: number, done: boolean) {
    if (!path.value) return;
    homeData.value = await invoke<HomeData>("toggle_todo", { workspacePath: path.value, index, done });
  }

  async function deleteTodo(index: number) {
    if (!path.value) return;
    homeData.value = await invoke<HomeData>("delete_todo", { workspacePath: path.value, index });
  }

  async function completeFirstTodo() {
    if (!homeData.value) return;
    const idx = homeData.value.todos.findIndex(t => !t.done);
    if (idx !== -1) await toggleTodo(idx, true);
  }

  async function selectFile(filePath: string) {
    selectedFilePath.value = filePath;
    saveSessionState({ current_focus_file: filePath });
    try {
      selectedFileContent.value = await invoke<string>("read_file", { path: filePath });
    } catch (e: unknown) {
      const msg = typeof e === "string" ? e : (e instanceof Error ? e.message : String(e));
      if (msg === "binary" || msg.includes("binary")) {
        selectedFileContent.value = null;
      } else {
        selectedFileContent.value = `[Error reading file: ${msg}]`;
      }
    }
  }

  function deselect() {
    selectedFilePath.value = null;
    selectedFileContent.value = null;
    saveSessionState({ current_focus_file: null });
  }

  function clear() {
    unlistenHomeMd?.();
    unlistenHomeMd = null;
    path.value = null;
    name.value = null;
    hash.value = null;
    isNewProject.value = false;
    fileTree.value = [];
    homeData.value = null;
    selectedFilePath.value = null;
    selectedFileContent.value = null;
    sessionState.value = null;
    invoke("stop_watching").catch(() => {});
  }

  return {
    path,
    name,
    hash,
    fileTree,
    homeData,
    homeMdContent,
    selectedFilePath,
    selectedFileContent,
    sessionState,
    isLoading,
    isNewProject,
    openWorkspace,
    loadWorkspace,
    refreshTree,
    refreshHomeMd,
    saveOverview,
    saveNotes,
    addTodo,
    toggleTodo,
    deleteTodo,
    completeFirstTodo,
    saveSessionState,
    selectFile,
    deselect,
    clear,
  };
});
