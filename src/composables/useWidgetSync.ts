import { watch } from "vue";
import { emit } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAgentStore } from "../stores/agentStore";
import { useDebounceFn } from "@vueuse/core";

let started = false;

export function useWidgetSync() {
  if (started) return;
  started = true;

  const workspace = useWorkspaceStore();
  const agent = useAgentStore();

  const sync = useDebounceFn(() => {
    emit("widget-sync", {
      workspacePath: workspace.path,
      homeMdContent: workspace.homeMdContent,
      agentState: agent.state,
      agentBusy: agent.isBusy,
    }).catch(() => {});
  }, 200);

  watch(() => workspace.path, sync);
  watch(() => workspace.homeMdContent, sync);
  watch(() => agent.state, sync);
  watch(() => agent.isBusy, sync);
  watch(() => agent.messages.length, sync); // trigger on new messages (thinking state)
}
