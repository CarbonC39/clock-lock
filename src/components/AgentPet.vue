<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  state: "idle" | "thinking" | "happy" | "sleepy" | "excited";
  size?: "sm" | "md" | "lg";
}>();

const petFaces: Record<string, string> = {
  idle:     "(・ω・)",
  thinking: "(・・ )…",
  happy:    "(＾▽＾)",
  sleepy:   "(-.-) zzz",
  excited:  "(*ﾟ▽ﾟ*)",
};

const emoji = computed(() => petFaces[props.state] ?? petFaces.idle);
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
  white-space: nowrap;
  user-select: none;
  display: inline-block;
  transition: color 0.4s ease;
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

/* ── Per-state animations ── */
.pet-state-idle {
  animation: pet-breathe 4s ease-in-out infinite;
}

.pet-state-thinking {
  animation: pet-think 0.85s ease-in-out infinite;
}

.pet-state-happy {
  animation: pet-happy 0.55s ease-in-out 4;
}

.pet-state-excited {
  animation: pet-excited 0.38s ease-in-out infinite;
}

.pet-state-sleepy {
  animation: pet-sleepy 3.2s ease-in-out infinite;
}

/* idle: gentle scale breathing */
@keyframes pet-breathe {
  0%, 100% { transform: scale(1);    opacity: 0.85; }
  50%       { transform: scale(1.05); opacity: 1; }
}

/* thinking: bob + fade */
@keyframes pet-think {
  0%, 100% { transform: translateY(0)   scale(1);    opacity: 0.9; }
  50%       { transform: translateY(-3px) scale(0.97); opacity: 0.55; }
}

/* happy: quick wiggle burst */
@keyframes pet-happy {
  0%   { transform: translateY(0)   rotate(0deg)  scale(1); }
  25%  { transform: translateY(-5px) rotate(-6deg) scale(1.08); }
  50%  { transform: translateY(-2px) rotate(5deg)  scale(1.04); }
  75%  { transform: translateY(-4px) rotate(-3deg) scale(1.06); }
  100% { transform: translateY(0)   rotate(0deg)  scale(1); }
}

/* excited: fast energetic bounce */
@keyframes pet-excited {
  0%, 100% { transform: translateY(0)   scale(1); }
  50%       { transform: translateY(-5px) scale(1.06); }
}

/* sleepy: slow sway + dim */
@keyframes pet-sleepy {
  0%, 100% { transform: translateY(0) rotate(-3deg); opacity: 0.6; }
  50%       { transform: translateY(3px) rotate(3deg);  opacity: 0.35; }
}
</style>
