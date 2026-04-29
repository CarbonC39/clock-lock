import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

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
  const fileTree = ref<FileNode[]>([]);
  const homeMdPath = ref<string | null>(null);
  const homeMdContent = ref<string>("");
  const selectedFilePath = ref<string | null>(null);
  const selectedFileContent = ref<string | null>(null);
  const isLoading = ref(false);

  async function openWorkspace() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected) return;
    await loadWorkspace(selected as string);
  }

  async function loadWorkspace(dirPath: string) {
    isLoading.value = true;
    path.value = dirPath;
    name.value = dirPath.replace(/\\/g, "/").split("/").pop() ?? dirPath;

    try {
      const [tree, [mdPath, mdContent]] = await Promise.all([
        invoke<FileNode[]>("list_dir", { workspacePath: dirPath }),
        invoke<[string, string]>("ensure_home_md", { workspacePath: dirPath }),
      ]);
      fileTree.value = tree;
      homeMdPath.value = mdPath;
      homeMdContent.value = mdContent;
    } finally {
      isLoading.value = false;
    }

    invoke("start_watching", { workspacePath: dirPath }).catch(console.warn);
    invoke("set_last_workspace", { workspacePath: dirPath }).catch(console.warn);
  }

  async function refreshTree() {
    if (!path.value) return;
    const tree = await invoke<FileNode[]>("list_dir", { workspacePath: path.value });
    fileTree.value = tree;
  }

  async function saveHomeMd(content: string) {
    if (!homeMdPath.value) return;
    homeMdContent.value = content;
    await invoke("write_file", { path: homeMdPath.value, content });
  }

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
    fileTree,
    homeMdPath,
    homeMdContent,
    selectedFilePath,
    selectedFileContent,
    isLoading,
    openWorkspace,
    loadWorkspace,
    refreshTree,
    saveHomeMd,
    selectFile,
    clear,
  };
});
