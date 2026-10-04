<script setup lang="ts">
import type { FindingDecision } from '~/utils/findings'
const entries = defineModel<FindingDecision[]>({ required: true })
defineProps<{ disabled?: boolean }>()
</script>
<template>
  <div class="finding-editor">
    <fieldset v-for="(entry, index) in entries" :key="index" :disabled="disabled">
      <legend>Observation {{ index + 1 }}</legend>
      <div class="session-decision-grid">
        <label>What did you find?<textarea v-model="entry.finding" placeholder="A worn bearing, an unexpected marking…" /></label>
        <label>What will you do about it?<textarea v-model="entry.decision" placeholder="Reuse, replace, investigate or deliberately leave alone…" /></label>
      </div>
      <button type="button" class="button button--ghost button--small" :aria-label="`Remove observation ${index + 1}`" @click="entries.splice(index, 1)">Remove observation</button>
    </fieldset>
    <button type="button" class="button button--ghost" :disabled="disabled" @click="entries.push({ finding: '', decision: '' })">+ Add finding &amp; decision</button>
  </div>
</template>
<style scoped>
fieldset { padding: 1rem; margin: 1rem 0; border: 1px solid var(--project-border, #ccc); min-width: 0; }
legend { font-size: .85rem; } label { display: grid; gap: .5rem; }
textarea { width: 100%; min-width: 0; min-height: 6rem; padding: .75rem; }
</style>
