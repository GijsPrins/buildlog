<script setup lang="ts">
import type { LogItemUsage, ProjectItemDetail } from '~/types/domain'
const props = defineProps<{ items: ProjectItemDetail[]; usages: LogItemUsage[]; currency: string }>()
const totals = computed(() => projectFinancials(props.items, props.usages, props.currency))
const money = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: props.currency }).format(amount)
</script>
<template>
  <section class="project-financials" aria-label="Project costs">
    <h2>Costs on the bench</h2>
    <dl>
      <div><dt>Attributed project cost</dt><dd>{{ money(totals.projectCost) }}</dd></div>
      <div><dt>Tools purchased</dt><dd>{{ money(totals.toolExpenditure) }}</dd></div>
      <div><dt>Linked purchases</dt><dd>{{ money(totals.actualExpenditure) }}</dd></div>
      <div><dt>Planned purchases</dt><dd>{{ money(totals.plannedExpenditure) }}</dd></div>
    </dl>
    <p>Project cost includes allocated parts, materials, services and consumable usage. Tools stay separate. Linked purchases count each item once here; shared purchases may also appear on other projects, so do not add project purchase totals together.</p>
    <p v-if="totals.missingAllocations || totals.missingUsageCosts || totals.missingEstimates" role="status">Recorded amounts only: {{ totals.missingAllocations }} project allocations, {{ totals.missingUsageCosts }} consumable usage costs and {{ totals.missingEstimates }} purchase estimates are not recorded.</p>
    <p v-if="totals.foreignItems" role="status">{{ totals.foreignItems }} purchases or estimates use another currency and are excluded. No currency conversion is applied.</p>
  </section>
</template>
<style scoped>
.project-financials { margin: 2rem 0; padding: 1.5rem; border: 1px solid var(--project-border, #ccc); }
dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; }
dt { font-size: .8rem; } dd { margin: .5rem 0; font-size: 1.5rem; font-weight: bold; }
p { font-size: .85rem; line-height: 1.5; }
</style>
