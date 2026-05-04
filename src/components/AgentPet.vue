<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from "vue";

const props = defineProps<{
  state: "idle" | "thinking" | "happy" | "sleepy" | "excited";
  size?: "sm" | "md" | "lg";
}>();

const frame = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const animations: Record<string, { frames: string[], interval: number }> = {
  idle: {
    frames: [
      "(・ω・)", "(・ω・)", "(・ω・)", "(・ω・)", "(・ω・)", "(・ω・)", "(・ω・)",
      "(－ω－)", // blink
      "(・ω・)", "(・ω・)", "(・ω・)",
      "(・ω・)", "(・ω・)", "(・ω・)"
    ],
    interval: 400
  },
  thinking: {
    frames: [
      "(・・ )   ", "(・・ ) . ", "(・・ ) ..", "(・・ )..."
    ],
    interval: 500
  },
  happy: {
    frames: [
      "(＾▽＾)", "(＾▽＾)", "( ^▽^)", "( ^▽^)"
    ],
    interval: 300
  },
  sleepy: {
    frames: [
      "( ˘ω˘)    ", "( ˘ω˘) z  ", "( ˘ω˘) zz ", "( ˘ω˘) zzz"
    ],
    interval: 800
  },
  excited: {
    frames: [
      "(*ﾟ▽ﾟ*)", "(☆▽☆)"
    ],
    interval: 300
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
  transition: color 0.4s ease;
  min-width: 6ch;
}

.pet-sm  { font-size: 12px; }
.pet-md  { font-size: 20px; line-height: 1; }
.pet-lg  { font-size: 36px; }

/* ── Per-state colors ── */
.pet-state-idle     { color: var(--color-accent-purple); }
.pet-state-thinking { color: var(--color-accent-blue); }
.pet-state-happy    { color: var(--color-accent-green); }
.pet-state-sleepy   { color: var(--color-text-muted); }
.pet-state-excited  { color: var(--color-accent-pink); }
</style>
