<script setup lang="ts">
import type { ThemeConfig } from '~/types/domain'
import { contrastRatio } from '~/utils/themes'
const props = defineProps<{ theme: ThemeConfig; name?: string }>()
const ratio = computed(() => contrastRatio(props.theme.colors.text, props.theme.colors.surface))
const photo = `${useRuntimeConfig().app.baseURL}demo/gios-start.jpeg`
const style = computed(() => ({ ...Object.fromEntries(Object.entries(props.theme.colors).map(([key,value]) => [`--t-${key}`,value])), '--t-heading': props.theme.typography.heading === 'serif' ? 'Georgia, serif' : 'Arial, sans-serif', '--t-radius': {none:'0px',small:'4px',medium:'14px'}[props.theme.shape.radius], '--t-shadow': props.theme.shape.shadow === 'subtle' ? '0 8px 20px #00000012' : 'none' }))
</script>
<template>
  <section class="theme-preview" :class="[`texture-${theme.decoration.texture}`,`frame-${theme.decoration.imageFrame}`]" :style="style" aria-label="Live theme preview">
    <small>ON THE STAND / LIVE PREVIEW</small><h2>{{ name || 'A build worth keeping.' }}</h2>
    <figure><img :src="photo" alt="Gios bicycle used to preview your theme"><figcaption>The object that started the story.</figcaption></figure>
    <article><span class="stage">INSPECTION</span><h3>Back at the bench</h3><p>A good afternoon in the workshop. Cleaned the frame, checked the bearings and made a plan for the next session.</p><small>01 OCT / 1h 30m</small><div class="chips"><span>Workshop notes</span><span>Parts &amp; materials</span></div><button type="button">+ Workshop log</button></article>
    <p class="contrast" role="status">Ink / surface contrast: {{ ratio.toFixed(1) }}:1 {{ ratio < 4.5 ? '— low contrast; try darker ink or lighter paper.' : '— readable body text.' }}</p>
  </section>
</template>
<style scoped>
.theme-preview{padding:28px;background:var(--t-background);color:var(--t-text);border:1px solid var(--t-border);border-radius:var(--t-radius);font-family:Arial,sans-serif}.theme-preview small{font-family:monospace;color:var(--t-muted)}h2,h3{font-family:var(--t-heading);color:var(--t-primary)}h2{font-size:2.4rem;margin:18px 0}figure{margin:0 0 22px}img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:var(--t-radius)}figcaption{font:12px monospace;color:var(--t-muted);margin-top:8px}article{padding:22px;background:var(--t-surface);border:1px solid var(--t-border);border-radius:var(--t-radius);box-shadow:var(--t-shadow)}h3{font-size:1.5rem;margin:12px 0}p{line-height:1.6}.stage{color:var(--t-accent);font:12px monospace}.chips{display:flex;gap:12px;flex-wrap:wrap;color:var(--t-secondary);font-size:12px;margin:18px 0}button{padding:10px 16px;background:var(--t-primary);color:var(--t-surface);border:0;border-radius:var(--t-radius)}.contrast{font-size:12px;margin-bottom:0}.texture-grid{background-image:linear-gradient(var(--t-border) 1px,transparent 1px),linear-gradient(90deg,var(--t-border) 1px,transparent 1px);background-size:28px 28px}.texture-paper{background-image:repeating-linear-gradient(11deg,#00000004 0 1px,transparent 1px 5px)}.frame-bordered figure{border:1px solid var(--t-border);padding:8px}.frame-print figure{padding:10px 10px 20px;background:var(--t-surface);box-shadow:var(--t-shadow);transform:rotate(-1deg)}
</style>
