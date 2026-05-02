import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useDebounceFn } from "@vueuse/core";
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

export const useWorkspaceStore = defineStore("workspace", () => {
  const path = ref<string | null>(null);
  const name = ref<string | null>(null);
  const hash = ref<string | null>(null);
  const fileTree = ref<FileNode[]>([]);
  const homeMdPath = ref<string | null>(null);
  const homeMdContent = ref<string>("");
  const selectedFilePath = ref<string | null>(null);
  const selectedFileContent = ref<string | null>(null);
  const sessionState = ref<SessionState | null>(null);
  const isLoading = ref(false);
  const isNewProject = ref(false);

  async function openWorkspace() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected) return;
    await loadWorkspace(selected as string);
  }

  async function loadWorkspace(dirPath: string) {
    isLoading.value = true;
    homeMdPath.value = null;
    homeMdContent.value = "";
    selectedFilePath.value = null;
    selectedFileContent.value = null;
    sessionState.value = null;

    try {
      const [tree, [mdPath, mdContent], wsHash] = await Promise.all([
        invoke<FileNode[]>("list_dir", { workspacePath: dirPath }),
        invoke<[string, string]>("ensure_home_md", { workspacePath: dirPath }),
        invoke<string>("get_workspace_hash", { workspacePath: dirPath }),
      ]);
      fileTree.value = tree;
      homeMdPath.value = mdPath;
      homeMdContent.value = mdContent;
      hash.value = wsHash;
      name.value = dirPath.replace(/\\/g, "/").split("/").pop() ?? dirPath;
      path.value = dirPath;

      // Fetch session state
      try {
        sessionState.value = await invoke<SessionState | null>("get_session_state", {
          workspaceHash: wsHash,
        });
      } catch {
        sessionState.value = null;
      }

      // Detect new project
      isNewProject.value =
        mdContent.includes("Describe your project here.") &&
        tree.length > 0;
    } catch (e) {
      console.error("Failed to open workspace:", e);
      throw e;
    } finally {
      isLoading.value = false;
    }

    invoke("start_watching", { workspacePath: dirPath }).catch(console.warn);
    invoke("set_last_workspace", { workspacePath: dirPath }).catch(console.warn);

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
      const [, mdContent] = await invoke<[string, string]>("ensure_home_md", { workspacePath: path.value });
      homeMdContent.value = mdContent;
    } catch (e) {
      console.error("Failed to refresh home.md:", e);
    }
  }

  async function _saveHomeMd(content: string) {
    if (!homeMdPath.value) return;
    homeMdContent.value = content;
    await invoke("write_file", { path: homeMdPath.value, content });
  }

  const saveHomeMd = useDebounceFn(_saveHomeMd, 500);

  async function completeFirstTodo() {
    if (!homeMdContent.value) return;
    const lines = homeMdContent.value.split("\n");
    let inSection = false;
    let found = false;
    const newLines = lines.map(line => {
      if (/^#\s+(todo|progress)/i.test(line)) { inSection = true; return line; }
      if (/^#\s+/.test(line)) { inSection = false; return line; }
      if (inSection && !found) {
        if (line.trim().startsWith("- [ ]")) {
          found = true;
          return line.replace("- [ ]", "- [x]");
        }
      }
      return line;
    });
    if (found) {
      await _saveHomeMd(newLines.join("\n"));
    }
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
    path.value = null;
    name.value = null;
    hash.value = null;
    isNewProject.value = false;
    fileTree.value = [];
    homeMdPath.value = null;
    homeMdContent.value = "";
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
    homeMdPath,
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
    saveHomeMd,
    saveSessionState,
    completeFirstTodo,
    selectFile,
    deselect,
    clear,
  };
});
