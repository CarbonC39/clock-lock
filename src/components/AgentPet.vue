<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  state: "idle" | "thinking" | "happy" | "sleepy" | "excited";
  size?: "sm" | "md" | "lg";
}>();

const petFaces: Record<string, string> = {
  idle: "(・ω・)",
  thinking: "(・・ )  ···",
  happy: "(＾▽＾)",
  sleepy: "(-.-) zzz",
  excited: "(*ﾟ▽ﾟ*)",
};

const emoji = computed(() => petFaces[props.state] ?? petFaces.idle);

const sizeClass = computed(() => `pet-${props.size ?? "md"}`);
</script>

<template>
  <span class="agent-pet" :class="[sizeClass, `pet-${state}`]">
    {{ emoji }}
  </span>
</template>

<style scoped>
.agent-pet {
  font-family: var(--font-mono);
  color: var(--color-accent-purple);
  white-space: nowrap;
  user-select: none;
  display: inline-block;
}

.pet-sm  { font-size: 12px; }
.pet-md  { font-size: 22px; }
.pet-lg  { font-size: 36px; }

.pet-thinking { animation: pet-think 1.2s ease-in-out infinite; }
.pet-sleepy   { animation: pet-float 3s ease-in-out infinite; }

@keyframes pet-think {
  0%, 100% { opacity: 1; transform: translateY(0); }
  50%      { opacity: 0.6; transform: translateY(-2px); }
}

@keyframes pet-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
}
</style>
