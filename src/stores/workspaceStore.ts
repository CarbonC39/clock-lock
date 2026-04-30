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

export const useWorkspaceStore = defineStore("workspace", () => {
  const path = ref<string | null>(null);
  const name = ref<string | null>(null);
  const hash = ref<string | null>(null);
  const fileTree = ref<FileNode[]>([]);
  const homeMdPath = ref<string | null>(null);
  const homeMdContent = ref<string>("");
  const selectedFilePath = ref<string | null>(null);
  const selectedFileContent = ref<string | null>(null);
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

      // Detect new project (template just created, but project has files)
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

    // M5: Load conversation history
    const agent = useAgentStore();
    agent.loadConversation().catch(console.warn);
  }

  async function refreshTree() {
    if (!path.value) return;
    const tree = await invoke<FileNode[]>("list_dir", { workspacePath: path.value });
    fileTree.value = tree;
  }

  async function _saveHomeMd(content: string) {
    if (!homeMdPath.value) return;
    homeMdContent.value = content;
    await invoke("write_file", { path: homeMdPath.value, content });
  }

  const saveHomeMd = useDebounceFn(_saveHomeMd, 500);

  async function selectFile(filePath: string) {
    selectedFilePath.value = filePath;
    try {
      selectedFileContent.value = await invoke<string>("read_file", { path: filePath });
    } catch (e: unknown) {
      if (e === "binary") {
        selectedFileContent.value = null;
      } else {
        selectedFileContent.value = String(e);
      }
    }
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
    isLoading,
    isNewProject,
    openWorkspace,
    loadWorkspace,
    refreshTree,
    saveHomeMd,
    selectFile,
    clear,
  };
});
