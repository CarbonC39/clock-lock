<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from "vue";

const props = defineProps<{
  state: "idle" | "thinking" | "happy" | "sleepy" | "excited";
  size?: "sm" | "md" | "lg" | "xl";
}>();

const frame = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

// One stable identity per state — only a subtle blink or trailing chars animate,
// so the face never morphs into a different character.
const animations: Record<string, { frames: string[], interval: number }> = {
  idle: {
    // Same face, the occasional slow blink
    frames: ["(・ω・)", "(・ω・)", "(・ω・)", "(・ω・)", "(・ω・)", "(－ω－)"],
    interval: 600
  },
  thinking: {
    // Same face, animated trailing dots
    frames: ["(・ω・)   ", "(・ω・).  ", "(・ω・).. ", "(・ω・)..."],
    interval: 420
  },
  happy: {
    frames: ["(＾▽＾)"],
    interval: 1000
  },
  sleepy: {
    // Same face, growing zzz
    frames: ["( ˘ω˘)    ", "( ˘ω˘) z  ", "( ˘ω˘) zz ", "( ˘ω˘) zzz"],
    interval: 760
  },
  excited: {
    frames: ["(☆▽☆)"],
    interval: 1000
  },
};

function startAnimation() {
  if (timer) clearInterval(timer);
  frame.value = 0;
  const anim = animations[props.state] || animations.idle;
  timer = setInterval(() => {
    frame.value = (frame.value + 1) % anim.frames.length;
  }, anim.interval);
}

onMounted(startAnimation);
onUnmounted(() => { if (timer) clearInterval(timer); });

watch(() => props.state, startAnimation);

const emoji = computed(() => {
  const anim = animations[props.state] || animations.idle;
  return anim.frames[frame.value % anim.frames.length] || anim.frames[0];
});

const sizeClass = computed(() => `pet-${props.size ?? "md"}`);
</script>

<template>
  <span class="agent-pet" :class="[sizeClass, `pet-state-${state}`]">
    {{ emoji }}
  </span>
</template>

<style scoped>
.agent-pet {
  font-family: var(--font-mono);
  white-space: pre;
  user-select: none;
  display: inline-block;
  text-align: center;
  /* Fixed box + centered glyphs: kaomoji chars (full-width ・ω＾▽ …) don't share
     an advance width, so without a reserved box each frame would nudge the
     surrounding layout. A fixed width keeps siblings perfectly still while the
     face animates; the glyphs just re-center inside it. */
  transition: color 0.4s ease;
}

.pet-sm  { font-size: 12px; width: 6em; }
.pet-md  { font-size: 22px; line-height: 1; width: 7em; }
.pet-lg  { font-size: 50px; line-height: 1.1; width: 7.5em; }
.pet-xl  { font-size: 22px; line-height: 1; letter-spacing: 0.02em; width: 7em; }

/* ── Per-state colors ── */
.pet-state-idle     { color: var(--color-accent-purple); }
.pet-state-thinking { color: var(--color-accent-blue); }
.pet-state-happy    { color: var(--color-accent-green); }
.pet-state-sleepy   { color: var(--color-text-muted); }
.pet-state-excited  { color: var(--color-accent-pink); }
</style>
