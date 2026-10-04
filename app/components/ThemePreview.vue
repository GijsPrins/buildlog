<script setup lang="ts">
import type { ThemeConfig } from '~/types/domain'
import { contrastRatio, themeFont } from '~/utils/themes'
const props = defineProps<{ theme: ThemeConfig; name?: string; photoSrc?: string }>()
const ratio = computed(() => contrastRatio(props.theme.colors.text, props.theme.colors.surface))
const photo = `${useRuntimeConfig().app.baseURL}demo/gios-start.jpeg`
const style = computed(() => ({ ...Object.fromEntries(Object.entries(props.theme.colors).map(([key,value]) => [`--t-${key}`,value])), '--t-heading': themeFont(props.theme.typography.heading), '--t-body': themeFont(props.theme.typography.body), '--t-radius': {none:'0px',small:'4px',medium:'14px'}[props.theme.shape.radius], '--t-shadow': props.theme.shape.shadow === 'subtle' ? '0 8px 20px #00000012' : 'none' }))
</script>
<template>
  <section class="theme-preview" :class="[`texture-${theme.decoration.texture}`,`frame-${theme.decoration.imageFrame}`]" :style="style" aria-label="Live theme preview">
    <small>ON THE STAND / LIVE PREVIEW</small><h2>{{ name || 'A build worth keeping.' }}</h2>
    <figure><img :src="photoSrc || photo" :alt="photoSrc ? 'Project cover in the theme preview' : 'Sample workshop photograph'"><figcaption>The object that started the story.</figcaption></figure>
    <ol class="preview-phases" aria-label="Example phase progress"><li>Planning</li><li aria-current="step">Inspection</li><li>Assembly</li></ol>
    <dl class="preview-stats" aria-label="Example project statistics"><div><dt>Sessions</dt><dd>6</dd></div><div><dt>Bench time</dt><dd>8h 30m</dd></div><div><dt>Project cost</dt><dd>€240</dd></div></dl>
    <article><span class="stage">INSPECTION</span><h3>Back at the bench</h3><p>A good afternoon in the workshop. Cleaned the surfaces, checked the moving parts and made a plan for the next session.</p><small>01 OCT / 1h 30m · Recorded by a builder</small><div class="chips"><span>Workshop notes</span><span>Parts &amp; materials</span></div><span class="preview-button">+ Log session</span>
      <dl class="preview-decision"><div><dt>Finding</dt><dd>A little wear, but the original marking is still clear.</dd></div><div><dt>Decision</dt><dd>Document the marking and replace the worn part.</dd></div></dl>
      <div class="preview-cost"><span>Replacement part <small>Available</small></span><strong>€18.50</strong></div>
    </article>
    <p class="preview-note">Example content for preview; no project records are added.</p>
    <p class="contrast" role="status">Ink / surface contrast: {{ ratio.toFixed(1) }}:1 {{ ratio < 4.5 ? '— low contrast; try darker ink or lighter paper.' : '— readable body text.' }}</p>
  </section>
</template>
<style scoped>
.theme-preview{padding:28px;background:var(--t-background);color:var(--t-text);border:1px solid var(--t-border);border-radius:var(--t-radius);font-family:var(--t-body)}.theme-preview small{font-family:monospace;color:var(--t-muted)}h2,h3{font-family:var(--t-heading);color:var(--t-primary)}h2{font-size:2.4rem;margin:18px 0}figure{margin:0 0 22px}img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:var(--t-radius)}figcaption{font:12px monospace;color:var(--t-muted);margin-top:8px}article{padding:22px;background:var(--t-surface);border:1px solid var(--t-border);border-radius:var(--t-radius);box-shadow:var(--t-shadow)}h3{font-size:1.5rem;margin:12px 0}p{line-height:1.6}.stage{color:var(--t-accent);font:12px monospace}.chips{display:flex;gap:12px;flex-wrap:wrap;color:var(--t-secondary);font-size:12px;margin:18px 0}.preview-button{display:inline-block;padding:10px 16px;background:var(--t-primary);color:var(--t-surface);border:0;border-radius:var(--t-radius)}.contrast{font-size:12px;margin-bottom:0}.texture-grid{background-image:linear-gradient(var(--t-border) 1px,transparent 1px),linear-gradient(90deg,var(--t-border) 1px,transparent 1px);background-size:28px 28px}.texture-paper{background-image:repeating-linear-gradient(11deg,#00000004 0 1px,transparent 1px 5px)}.frame-bordered figure{border:1px solid var(--t-border);padding:8px}.frame-print figure{padding:10px 10px 20px;background:var(--t-surface);box-shadow:var(--t-shadow);transform:rotate(-1deg)}
.preview-phases{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;font:12px monospace}.preview-phases li{padding:8px;border:1px solid var(--t-border);background:var(--t-surface)}.preview-phases [aria-current]{border-color:var(--t-accent);color:var(--t-primary);font-weight:bold}.preview-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;background:var(--t-surface);padding:16px;border:1px solid var(--t-border);border-radius:var(--t-radius)}dt{font:12px monospace;color:var(--t-muted)}dd{margin:6px 0 0}.preview-decision{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;border-top:1px solid var(--t-border);padding-top:18px;line-height:1.6}.preview-cost{display:flex;justify-content:space-between;gap:16px;border-top:1px solid var(--t-border);padding-top:16px}.preview-cost small{display:block}.preview-note{font-size:12px;color:var(--t-muted)}@media(max-width:420px){.theme-preview{padding:16px}.preview-decision{grid-template-columns:1fr}h2{font-size:2rem}}
</style>
