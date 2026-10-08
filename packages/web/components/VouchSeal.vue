<script setup lang="ts">
/**
 * The signature element: a guilloché "vouch seal" — the interwoven line
 * engraving used on banknotes, passports and certificates of authenticity,
 * generated as a band of phase-shifted concentric waves (the real technique).
 * Deterministic (no random) so SSR and client hydrate identically.
 */
const props = withDefaults(
  defineProps<{ hash?: string; label?: string; size?: number }>(),
  { hash: "0x9F4C·A1B2", label: "Attestation", size: 380 },
);

const CX = 200;
const CY = 200;
const hashLines = computed(() => props.hash.match(/.{1,20}/g) || [""]);

// A guilloché band: many concentric wavy rings, each rotated a touch in phase,
// so the crests interlace into a woven rope between two radii.
function band(inner: number, outer: number, rings: number, lobes: number, amp: number, dphase: number) {
  const out: { d: string; brass: boolean }[] = [];
  const steps = 720;
  for (let k = 0; k < rings; k++) {
    const R0 = inner + (outer - inner) * (k / (rings - 1));
    const phase = k * dphase;
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const th = (2 * Math.PI * i) / steps;
      const rr = R0 + amp * Math.cos(lobes * th + phase);
      d += (i === 0 ? "M" : "L") + (CX + rr * Math.cos(th)).toFixed(2) + "," + (CY + rr * Math.sin(th)).toFixed(2);
    }
    out.push({ d: d + "Z", brass: k % 6 === 0 });
  }
  return out;
}

// outer woven band + a finer inner counter-band for the doubled engraving look
const outerBand = band(98, 144, 16, 19, 6.5, 0.42);
const innerBand = band(92, 100, 5, 30, 2.2, -0.6);

function ring(rr: number) {
  return `M ${CX},${CY - rr} a ${rr},${rr} 0 1,1 0,${2 * rr} a ${rr},${rr} 0 1,1 0,${-2 * rr}`;
}
const ringText = "HUMAN-VOUCHED · ANONYMOUS · UNIQUE · STELLAR · ZK · ";
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 400 400"
    role="img"
    aria-label="HumanVouch authenticity seal"
    class="seal-reveal block"
  >
    <defs>
      <radialGradient id="seal-core" cx="50%" cy="44%" r="62%">
        <stop offset="0%" stop-color="#16203030" />
        <stop offset="62%" stop-color="#121a28" />
        <stop offset="100%" stop-color="#0b0e14" />
      </radialGradient>
      <path :id="`ring-${size}`" :d="ring(166)" fill="none" />
    </defs>

    <!-- outer rule -->
    <circle :cx="CX" :cy="CY" r="180" fill="none" stroke="#283446" stroke-width="0.75" />
    <circle :cx="CX" :cy="CY" r="150" fill="none" stroke="#283446" stroke-width="0.5" />

    <!-- ring caption, between the rules -->
    <text fill="#B08D57" font-family="IBM Plex Mono, monospace" font-size="10.5" letter-spacing="3.2">
      <textPath :href="`#ring-${size}`" startOffset="0">{{ ringText }}</textPath>
    </text>

    <!-- the woven guilloché, turning very slowly -->
    <g class="seal-spin">
      <path
        v-for="(p, i) in outerBand"
        :key="`o${i}`"
        :d="p.d"
        fill="none"
        :stroke="p.brass ? '#B08D57' : '#5b80bd'"
        :stroke-width="p.brass ? 0.55 : 0.45"
        :opacity="p.brass ? 0.5 : 0.45"
      />
      <path
        v-for="(p, i) in innerBand"
        :key="`i${i}`"
        :d="p.d"
        fill="none"
        stroke="#5b80bd"
        stroke-width="0.4"
        opacity="0.4"
      />
    </g>

    <!-- minted core -->
    <circle :cx="CX" :cy="CY" r="86" fill="url(#seal-core)" stroke="#2b4a7e" stroke-width="0.75" />
    <circle :cx="CX" :cy="CY" r="79" fill="none" stroke="#B08D57" stroke-width="0.5" opacity="0.65" />

    <text :x="CX" :y="hash.length > 20 ? CY - 28 : CY - 22" text-anchor="middle" fill="#B08D57" font-family="IBM Plex Mono, monospace" font-size="20">✓</text>
    <text text-anchor="middle" fill="#ECE6D8" font-family="IBM Plex Mono, monospace"
          :font-size="hash.length > 20 ? 10 : 15" :letter-spacing="hash.length > 20 ? 0 : 1">
      <tspan v-for="(line, i) in hashLines" :key="i" :x="CX"
             :y="hash.length > 20 ? CY - 10 + i * 12 : CY + 8">{{ line }}</tspan>
    </text>
    <text :x="CX" :y="hash.length > 20 ? CY + 44 : CY + 30" text-anchor="middle" fill="#AEA994" font-family="IBM Plex Mono, monospace" font-size="8.5" letter-spacing="3.5">{{ label.toUpperCase() }}</text>
  </svg>
</template>
