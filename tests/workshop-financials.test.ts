import { describe, expect, it } from 'vitest'
import type { Item } from '../app/types/domain'
import { collectPages, workshopFinancials } from '../app/utils/workshopFinancials'
import { normalizeItemDetails } from '../app/utils/itemDetails'

const item = (id: string, price: number | null, currency: string | null = 'EUR', estimate: number | null = null, estimateCurrency: string | null = 'EUR') => ({
  id, name: id, purchase_amount: price, purchase_currency_code: price === null ? null : currency,
  estimated_amount: estimate, estimated_currency_code: estimate === null ? null : estimateCurrency,
  brand: null, supplier: null, url: null, notes: null
}) as Item

describe('workshop purchases', () => {
  it('deduplicates shared purchases, includes unlinked items and separates currencies and tool subsets', () => {
    const tool = item('shared', 20)
    const data = workshopFinancials([tool, tool, item('unlinked', 10), item('dollars', 15, 'USD')], [
      { item_id: tool.id, role: 'tool' }, { item_id: tool.id, role: 'part' }, { item_id: tool.id, role: 'tool' }
    ])
    expect(data.itemCount).toBe(3)
    expect(data.currencies).toEqual([
      { currency: 'EUR', actual: 30, planned: 0, tools: 20, purchases: 2, estimates: 0 },
      { currency: 'USD', actual: 15, planned: 0, tools: 0, purchases: 1, estimates: 0 }
    ])
  })
  it('keeps estimates out of actual purchases, preserves zero and reports unrecorded amounts', () => {
    const data = workshopFinancials([item('planned', null, null, 30, 'GBP'), item('free', 0, 'EUR', 99), item('unknown', null)], [])
    expect(data.unknown).toBe(1)
    expect(data.currencies).toEqual([
      { currency: 'EUR', actual: 0, planned: 0, tools: 0, purchases: 1, estimates: 0 },
      { currency: 'GBP', actual: 0, planned: 30, tools: 0, purchases: 0, estimates: 1 }
    ])
  })
  it('sums small amounts in minor units', () => {
    expect(workshopFinancials([item('a', .1), item('b', .2)], []).currencies[0]!.actual).toBe(.3)
  })
  it('loads beyond the API page limit, including a server cap lower than the requested page', async () => {
    const source = Array.from({ length: 1201 }, (_, id) => ({ id }))
    const calls: number[] = []
    const all = await collectPages(async from => {
      calls.push(from)
      return { data: source.slice(from, from + 200), count: source.length, error: null }
    })
    expect(all).toEqual(source)
    expect(calls).toEqual([0, 200, 400, 600, 800, 1000, 1200])
  })
  it('fails instead of showing partial totals after a later page error', async () => {
    await expect(collectPages(async from => from ? { data: null, error: { message: 'Denied' } } : { data: [1, 2], error: null }, 2)).rejects.toThrow('Denied')
  })
  it('normalizes shared purchase/estimate editing without interpreting a cleared value as zero', () => {
    const draft = { ...item('  Chain  ', null, null, 30), estimated_currency_code: ' usd ', purchase_amount: '' } as unknown as Item
    expect(normalizeItemDetails(draft, 'EUR')).toMatchObject({ name: 'Chain', purchase_amount: null, purchase_currency_code: null, estimated_amount: 30, estimated_currency_code: 'USD' })
    expect(() => normalizeItemDetails({ ...draft, estimated_currency_code: 'EU' }, 'EUR')).toThrow('currency')
    expect(normalizeItemDetails(item('free', 0), 'EUR').purchase_amount).toBe(0)
  })
})
