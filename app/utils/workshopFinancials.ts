import type { Item, ProjectItem } from '../types/domain'

export function workshopFinancials(items: Item[], links: Pick<ProjectItem, 'item_id' | 'role'>[]) {
  const tools = new Set(links.filter(link => link.role === 'tool').map(link => link.item_id))
  const groups = new Map<string, { currency: string; actual: number; planned: number; tools: number; purchases: number; estimates: number }>()
  let unknown = 0
  const unique = [...new Map(items.map(item => [item.id, item])).values()]
  for (const item of unique) {
    const purchased = item.purchase_amount !== null
    const amount = purchased ? item.purchase_amount : item.estimated_amount
    const currency = purchased ? item.purchase_currency_code : item.estimated_currency_code
    if (amount == null || !currency) { unknown++; continue }
    const code = currency.toUpperCase()
    const group = groups.get(code) ?? { currency: code, actual: 0, planned: 0, tools: 0, purchases: 0, estimates: 0 }
    const minorUnits = Math.round(amount * 100)
    if (purchased) {
      group.actual += minorUnits; group.purchases++
      if (tools.has(item.id)) group.tools += minorUnits
    } else { group.planned += minorUnits; group.estimates++ }
    groups.set(code, group)
  }
  return {
    itemCount: unique.length, unknown,
    currencies: [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map(group => ({
      ...group, actual: group.actual / 100, planned: group.planned / 100, tools: group.tools / 100
    }))
  }
}

/** Read every page: Supabase's default row limit must not truncate totals. */
export async function collectPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>, pageSize = 500): Promise<T[]> {
  const rows: T[] = []
  let expectedCount: number | undefined
  for (let offset = 0; ;) {
    const { data, error, count } = await fetchPage(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Records could not be loaded. Please retry.')
    if (count != null) {
      if (expectedCount !== undefined && expectedCount !== count) throw new Error('Records changed while loading. Please retry.')
      expectedCount = count
    }
    rows.push(...(data ?? []))
    if (!data?.length || (count != null ? rows.length >= count : data.length < pageSize)) {
      if (expectedCount !== undefined && rows.length !== expectedCount) throw new Error('Not all records could be loaded. Please retry.')
      return rows
    }
    offset += data.length
  }
}

export async function collectInBatches<T>(ids: string[], fetchBatch: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; offset < ids.length; offset += 100) rows.push(...await fetchBatch(ids.slice(offset, offset + 100)))
  return rows
}

export function formatPurchaseAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}
