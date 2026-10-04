<script setup lang="ts">
import type { ThemeConfig } from '~/types/domain'
import { themeColorLabels } from '~/utils/themes'
const theme = defineModel<ThemeConfig>({ required: true })
</script>

<template>
  <div class="theme-controls">
    <label v-for="(label, key) in themeColorLabels" :key="key"><span>{{ label }}</span><input v-model="theme.colors[key]" type="color"><code>{{ theme.colors[key] }}</code></label>
    <label>Heading <select v-model="theme.typography.heading"><option value="serif">Serif / heritage</option><option value="sans">Sans / modern</option></select></label>
    <label>Body <select v-model="theme.typography.body"><option value="sans">Sans / clear</option><option value="serif">Serif / bookish</option></select></label>
    <label>Corners <select v-model="theme.shape.radius"><option value="none">Square</option><option value="small">Small</option><option value="medium">Rounded</option></select></label>
    <label>Shadow <select v-model="theme.shape.shadow"><option value="none">None</option><option value="subtle">Subtle</option></select></label>
    <label>Paper texture <select v-model="theme.decoration.texture"><option value="none">Plain</option><option value="grid">Grid</option><option value="paper">Paper</option></select></label>
    <label>Photo frame <select v-model="theme.decoration.imageFrame"><option value="none">None</option><option value="bordered">Border</option><option value="print">Photo print</option></select></label>
  </div>
</template>

<style scoped>
.theme-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px}.theme-controls label{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:.85rem}.theme-controls label span{width:100%}.theme-controls input{width:44px;height:36px;padding:2px;border:1px solid #aaa;background:transparent}.theme-controls code{font-size:.75rem}.theme-controls select{width:100%;padding:8px}
</style>
