import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useAgentStore } from "./agentStore";
import { useSettingsStore } from "./settingsStore";
import { useWorkspaceStore } from "./workspaceStore";

export const useSupervisionStore = defineStore("supervision", () => {
  const dnd = ref(localStorage.getItem("sv-dnd") === "true");
  const isRunning = ref(false);
  const idleHours = ref(
    parseInt(localStorage.getItem("sv-idle-hours") ?? "48", 10)
  );
  const lastActivityMs = ref<number>(
    Date.now() - (Number(localStorage.getItem("sv-idle-hours")) || 48) * 3_600_000
  );
  const snoozeUntil = ref<number>(
    Number(localStorage.getItem("sv-snooze-until")) || 0
  );

  function setDnd(v: boolean) {
    dnd.value = v;
    localStorage.setItem("sv-dnd", v ? "true" : "false");
    invoke("configure_supervision", { idleHours: idleHours.value, dnd: v }).catch(() => {});
  }

  function setIdleHours(h: number) {
    idleHours.value = h;
    localStorage.setItem("sv-idle-hours", String(h));
    invoke("configure_supervision", { idleHours: idleHours.value, dnd: dnd.value }).catch(() => {});
  }

  function setSnooze(durationMs: number) {
    const until = Date.now() + durationMs;
    snoozeUntil.value = until;
    localStorage.setItem("sv-snooze-until", String(until));
  }

  function reportActivity() {
    lastActivityMs.value = Date.now();
    invoke("report_activity").catch(() => {});
  }

  let unlistenCheckin: (() => void) | null = null;

  async function start() {
    if (isRunning.value) return;
    isRunning.value = true;

    invoke("configure_supervision", { idleHours: idleHours.value, dnd: dnd.value }).catch(() => {});
    invoke("start_supervision").catch(console.warn);

    unlistenCheckin = await listen("supervision-checkin", async () => {
      if (dnd.value) return;
      const agent = useAgentStore();
      if (agent.isBusy) return;

      // Snooze gate
      if (Date.now() < snoozeUntil.value) { reportActivity(); return; }

      const workspace = useWorkspaceStore();
      const settings = useSettingsStore();

      const idleMinutes = Math.round((Date.now() - lastActivityMs.value) / 60_000);
      const topTodo = workspace.homeData?.todos.find(t => !t.done)?.text ?? null;
      const workspaceName = workspace.name ?? "your project";

      const FALLBACK = "Hey — you've been away for a while. No rush, just checking in. How are things going?";
      let checkinText = FALLBACK;

      if (settings.settings.base_url) {
        try {
          const resp = await fetch(`${settings.settings.base_url}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(settings.settings.api_key ? { Authorization: `Bearer ${settings.settings.api_key}` } : {}),
            },
            body: JSON.stringify({
              model: settings.settings.model,
              messages: [{
                role: "user",
                content: [
                  `You are Clock Lock, a warm peer coworker for ADHD developers.`,
                  `The user has been away from "${workspaceName}" for ${idleMinutes} minutes.`,
                  topTodo ? `Their top todo is: "${topTodo}".` : "",
                  `Write one short, natural check-in — like a coworker pinging on Slack.`,
                  `Reference the idle time and todo if present, but keep it gentle and non-pressuring.`,
                  `No emojis. No bullet points. Reply with only the message text, 1-2 sentences max.`,
                ].filter(Boolean).join(" "),
              }],
              max_tokens: 80,
              temperature: 0.8,
            }),
          });
          if (resp.ok) {
            const data = (await resp.json()) as { choices: { message: { content: string } }[] };
            checkinText = data.choices?.[0]?.message?.content?.trim() || FALLBACK;
          }
        } catch { /* fallback */ }
      }

      // OS notification (best-effort)
      try {
        let granted = await isPermissionGranted();
        if (!granted) granted = (await requestPermission()) === "granted";
        if (granted) sendNotification({ title: "Clock Lock", body: checkinText });
      } catch { /* not available */ }

      agent.pushCheckin(checkinText, { idleMinutes, topTodo });
      agent.setState("sleepy");
      reportActivity();
    });
  }

  function stop() {
    if (unlistenCheckin) {
      unlistenCheckin();
      unlistenCheckin = null;
    }
    invoke("stop_supervision").catch(() => {});
    isRunning.value = false;
  }

  return {
    dnd,
    isRunning,
    idleHours,
    snoozeUntil,
    setDnd,
    setIdleHours,
    setSnooze,
    reportActivity,
    start,
    stop,
  };
});
