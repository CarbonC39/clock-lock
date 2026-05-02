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

    invoke("start_supervision").catch(console.warn);

    unlistenCheckin = await listen("supervision-checkin", async () => {
      if (dnd.value) return;
      const agent = useAgentStore();
      if (agent.isBusy) return;

      const settings = useSettingsStore();
      if (!settings.settings.base_url) return;
      const prompt =
        "You are the Clock Lock supervisor. The user has been idle for a while. Send a brief, friendly check-in message (1-2 sentences). Be encouraging but not pushy. Do NOT reply with anything else.";

      try {
        const resp = await fetch(
          `${settings.settings.base_url}/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(settings.settings.api_key
                ? { Authorization: `Bearer ${settings.settings.api_key}` }
                : {}),
            },
            body: JSON.stringify({
              model: settings.settings.model,
              messages: [{ role: "user", content: prompt }],
              max_tokens: 80,
              temperature: 0.8,
            }),
          }
        );

        if (resp.ok) {
          const data = (await resp.json()) as {
            choices: { message: { content: string } }[];
          };
          const checkinText =
            data.choices?.[0]?.message?.content?.trim() ??
            "Hey! Just checking in. How are things going?";

          let granted = false;
          try {
            granted = await isPermissionGranted();
            if (!granted) granted = (await requestPermission()) === "granted";
          } catch {
            // gracefully handle permission rejection or non-Tauri env
            console.warn("Could not request notification permission");
          }

          if (granted) {
            try { sendNotification({ title: "Clock Lock", body: checkinText }); } catch {}
          }

          agent.pushNote(`[Supervisor] ${checkinText}`);
          agent.state = "sleepy";

          // Reset activity so it doesn't re-trigger immediately
          reportActivity();
        }
      } catch {
        // silently fail
      }
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
