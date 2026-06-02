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

// ── Check-in phrase pool ──────────────────────────────────────────────────
// Most check-ins are drawn from this rotating pool of complete sentences — no
// API call at trigger time, no template slots. The pool is occasionally
// refilled with one batched call, and a stored seed keeps it working offline.
const SEED_POOL: string[] = [
  "Hey, just checking in — how's it going over there?",
  "Taking a breather? Totally fine. I'm here whenever you're ready to dive back in.",
  "No pressure at all, but I'm around if you want to pick things back up.",
  "Hope you're doing okay! Whenever you're ready, I'll be right here.",
  "Psst — still with me? Even a tiny next step counts.",
  "You've been away a bit. Want to ease back in with something small?",
  "Just a gentle nudge from your desk buddy. No rush though.",
  "Hey friend, the code's not going anywhere. Come back whenever feels right.",
  "Checking in! Sometimes stepping away is exactly what helps. Ready when you are.",
  "Still here, still rooting for you. Want to tackle one little thing?",
  "Hope your break was good — I kept your spot warm.",
  "Whenever you're back, we can start wherever feels easiest.",
  "Quiet over here — everything alright? I'm around if you need a hand.",
  "No deadlines from me. Just happy to keep you company when you return.",
  "Hey, it's been a minute! Want me to help you find your footing again?",
  "Take all the time you need. I'll be right here when you're ready to roll.",
  "Gentle ping! One small step is plenty to get rolling again.",
  "Missed you a little. Ready to get back into it, or still recharging?",
];

const POOL_KEY = "sv-checkin-pool";
const USED_KEY = "sv-checkin-used";
const GROUNDED_DAY_KEY = "sv-checkin-grounded-day";
const COUNT_KEY = "sv-checkin-count";
const GROUNDED_EVERY = 5; // try a fresh, grounded line on every Nth check-in…
const POOL_MIN_UNUSED = 5; // …and refill the pool when it runs this low.

function loadPool(): string[] {
  try {
    const p = JSON.parse(localStorage.getItem(POOL_KEY) || "null");
    if (Array.isArray(p) && p.length) return p as string[];
  } catch { /* fall through */ }
  return SEED_POOL;
}
function loadUsed(): string[] {
  try {
    const u = JSON.parse(localStorage.getItem(USED_KEY) || "[]");
    return Array.isArray(u) ? (u as string[]) : [];
  } catch { return []; }
}
function saveUsed(u: string[]) {
  localStorage.setItem(USED_KEY, JSON.stringify(u.slice(-40)));
}

let refilling = false;
async function refillPool(baseUrl: string, apiKey: string | undefined, model: string): Promise<void> {
  if (refilling) return;
  refilling = true;
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            "You are Clock Lock, a warm peer coworker for ADHD developers.",
            "Write 15 short, gentle check-in messages for when the user has been away from their work for a while.",
            "Vary the tone (playful, caring, encouraging, calm) and length. Keep each to 1-2 sentences.",
            "Each message must be complete and self-contained — NO placeholders, NO names, NO blanks to fill in, no emojis.",
            'Reply with ONLY a JSON array of strings, e.g. ["...", "..."].',
          ].join(" "),
        }],
        max_tokens: 600,
        temperature: 0.9,
      }),
    });
    if (!resp.ok) return;
    const data = (await resp.json()) as { choices: { message: { content: string } }[] };
    const arr = parseSentenceArray(data.choices?.[0]?.message?.content ?? "");
    if (arr.length) {
      const merged = Array.from(new Set([...loadPool(), ...arr])).slice(-40);
      localStorage.setItem(POOL_KEY, JSON.stringify(merged));
    }
  } catch { /* keep existing pool */ } finally {
    refilling = false;
  }
}

function parseSentenceArray(raw: string): string[] {
  const text = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(String).map(s => s.trim()).filter(s => s.length > 0 && s.length < 240);
    }
  } catch { /* fall through to line parsing */ }
  return text
    .split("\n")
    .map(l => l.replace(/^[\s\-*0-9.]+/, "").replace(/^["']|["',]+$/g, "").trim())
    .filter(s => s.length > 4 && s.length < 240);
}

/** Pick an unused line from the pool, rotating so lines don't repeat. */
function pickFromPool(refill?: () => void): string {
  const pool = loadPool();
  let used = loadUsed();
  let unused = pool.filter(s => !used.includes(s));
  if (!unused.length) { used = []; unused = pool; } // exhausted → reset rotation
  const choice = unused[Math.floor(Math.random() * unused.length)] ?? SEED_POOL[0];
  used.push(choice);
  saveUsed(used);
  if (refill && pool.filter(s => !used.includes(s)).length < POOL_MIN_UNUSED) refill();
  return choice;
}

function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function groundedUsedToday(): boolean { return localStorage.getItem(GROUNDED_DAY_KEY) === todayStr(); }
function markGroundedToday(): void { localStorage.setItem(GROUNDED_DAY_KEY, todayStr()); }
function bumpCount(): number {
  const n = (parseInt(localStorage.getItem(COUNT_KEY) || "0", 10) || 0) + 1;
  localStorage.setItem(COUNT_KEY, String(n));
  return n;
}

/** The occasional "treat": one live call that writes a natural, grounded line. */
async function generateGrounded(
  baseUrl: string, apiKey: string | undefined, model: string,
  ctx: { idleMinutes: number; topTodo: string | null; focusFile: string | null; workspaceName: string },
): Promise<string | null> {
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            "You are Clock Lock, a warm peer coworker for ADHD developers.",
            `The user has been away from "${ctx.workspaceName}" for about ${ctx.idleMinutes} minutes.`,
            ctx.focusFile ? `They were last working in the file "${ctx.focusFile}".` : "",
            ctx.topTodo ? `Their top todo is: "${ctx.topTodo}".` : "",
            "Write one short, natural check-in — like a coworker pinging on Slack.",
            "Weave in what they were doing if it helps, but keep it gentle and non-pressuring.",
            "No emojis, no bullet points. Reply with only the message text, 1-2 sentences max.",
          ].filter(Boolean).join(" "),
        }],
        max_tokens: 80,
        temperature: 0.8,
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { choices: { message: { content: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch { return null; }
}

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
  // Whether to spend the occasional (≤1/day) live, grounded check-in. Off → the
  // companion only ever draws from the local phrase pool (zero API calls).
  const checkinGrounded = ref(localStorage.getItem("sv-checkin-grounded-enabled") !== "false");

  function setCheckinGrounded(v: boolean) {
    checkinGrounded.value = v;
    localStorage.setItem("sv-checkin-grounded-enabled", v ? "true" : "false");
  }

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
      const { base_url, api_key, model } = settings.settings;

      const idleMinutes = Math.round((Date.now() - lastActivityMs.value) / 60_000);
      const topTodo = workspace.homeData?.todos.find(t => !t.done)?.text ?? null;
      const workspaceName = workspace.name ?? "your project";
      // What were they last working on? In-memory hint first, persisted fallback.
      const focusFile =
        agent.recentFocus?.file ??
        workspace.sessionState?.current_focus_file?.split(/[\\/]/).pop() ??
        null;

      const refill = base_url
        ? () => { refillPool(base_url, api_key, model).catch(() => {}); }
        : undefined;

      // Tier 2 (the treat): at most one fresh, grounded line per day.
      const count = bumpCount();
      const wantGrounded =
        checkinGrounded.value && !!base_url && !groundedUsedToday() &&
        (count % GROUNDED_EVERY === 0 || !!focusFile);

      let checkinText: string | null = null;
      if (wantGrounded) {
        checkinText = await generateGrounded(base_url, api_key, model, {
          idleMinutes, topTodo, focusFile, workspaceName,
        });
        if (checkinText) markGroundedToday();
      }
      // Tier 1 (default): rotate a stored pool — zero API at trigger time.
      if (!checkinText) checkinText = pickFromPool(refill);

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
    checkinGrounded,
    setDnd,
    setIdleHours,
    setSnooze,
    setCheckinGrounded,
    reportActivity,
    start,
    stop,
  };
});
