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

export const useSupervisionStore = defineStore("supervision", () => {
  const dnd = ref(localStorage.getItem("sv-dnd") === "true");
  const isRunning = ref(false);
  const idleHours = ref(
    parseInt(localStorage.getItem("sv-idle-hours") ?? "48", 10)
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

  function reportActivity() {
    invoke("report_activity").catch(() => {});
  }

  let unlistenCheckin: (() => void) | null = null;

  async function start() {
    if (isRunning.value) return;
    isRunning.value = true;

    // Sync persisted settings to Rust before starting (Rust defaults to 48h)
    invoke("configure_supervision", { idleHours: idleHours.value, dnd: dnd.value }).catch(() => {});
    invoke("start_supervision").catch(console.warn);

    unlistenCheckin = await listen("supervision-checkin", async () => {
      if (dnd.value) return;
      const agent = useAgentStore();
      if (agent.isBusy) return;

      const settings = useSettingsStore();
      const FALLBACK = "Hey — you've been away for a while. No rush, just checking in. How are things going?";
      let checkinText = FALLBACK;

      // Try AI-generated message; fall back to built-in if unavailable or unconfigured
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
                content: "You are Clock Lock, a peer coworker for ADHD developers. The user has been away from their project for a while. Write one short, natural check-in — like a coworker pinging you on Slack. No emojis. Reply with only the message text.",
              }],
              max_tokens: 80,
              temperature: 0.8,
            }),
          });
          if (resp.ok) {
            const data = (await resp.json()) as { choices: { message: { content: string } }[] };
            checkinText = data.choices?.[0]?.message?.content?.trim() || FALLBACK;
          }
        } catch { /* use fallback */ }
      }

      // OS notification (best-effort)
      try {
        let granted = await isPermissionGranted();
        if (!granted) granted = (await requestPermission()) === "granted";
        if (granted) sendNotification({ title: "Clock Lock", body: checkinText });
      } catch { /* not available in this environment */ }

      agent.pushNote(`Clock Lock: ${checkinText}`);
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
    setDnd,
    setIdleHours,
    reportActivity,
    start,
    stop,
  };
});
