import type { LogItemUsage, ProjectItemDetail } from '~/types/domain'

export function optionalAmount(value: unknown): number | null {
  if (value === '' || value == null) return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a non-negative amount.')
  return amount
}

/** Amounts are summed in minor units; unrecorded or foreign-currency costs are flagged. */
export function projectFinancials(items: ProjectItemDetail[], usages: LogItemUsage[], currency: string) {
  const cents = (value: number) => Math.round(value * 100)
  let projectCost = 0, toolExpenditure = 0, actualExpenditure = 0, plannedExpenditure = 0
  let missingAllocations = 0, missingUsageCosts = 0, missingEstimates = 0
  const foreignItems = new Set<string>()
  const seen = new Set<string>()
  const byLink = new Map(items.map(entry => [entry.id, entry]))
  for (const entry of items) {
    const item = entry.item
    // Attribution is explicit: a shared purchase must not be charged in full to every build.
    if (['subject', 'part', 'material', 'external_service'].includes(entry.role)) {
      if (entry.attributed_amount == null) missingAllocations++
      else projectCost += cents(entry.attributed_amount)
    }
    if (seen.has(item.id)) continue
    seen.add(item.id)
    if (item.purchase_amount != null) {
      if (item.purchase_currency_code === currency) {
        actualExpenditure += cents(item.purchase_amount)
        if (entry.role === 'tool') toolExpenditure += cents(item.purchase_amount)
      } else foreignItems.add(item.id)
    } else if (item.estimated_amount != null) {
      if (item.estimated_currency_code === currency) plannedExpenditure += cents(item.estimated_amount)
      else foreignItems.add(item.id)
    } else missingEstimates++
  }
  const seenUsage = new Set<string>()
  for (const usage of usages) {
    if (seenUsage.has(usage.id) || byLink.get(usage.project_item_id)?.role !== 'consumable') continue
    seenUsage.add(usage.id)
    if (usage.usage_cost == null) missingUsageCosts++
    else projectCost += cents(usage.usage_cost)
  }
  return {
    projectCost: projectCost / 100, toolExpenditure: toolExpenditure / 100,
    actualExpenditure: actualExpenditure / 100, plannedExpenditure: plannedExpenditure / 100,
    missingAllocations, missingUsageCosts, missingEstimates, foreignItems: foreignItems.size
  }
}
