import { describe, expect, it } from 'vitest'
import type { ProjectItemDetail, LogItemUsage } from '../app/types/domain'
import { optionalAmount, projectFinancials } from '../app/utils/financials'

const entry = (id: string, role: ProjectItemDetail['role'], price: number | null, allocation: number | null = null, currency = 'EUR') => ({
  id, item_id: id, role, attributed_amount: allocation,
  item: { id, purchase_amount: price, purchase_currency_code: price == null ? null : currency, estimated_amount: null, estimated_currency_code: null }
}) as ProjectItemDetail
const usage = (id: string, link: string, quantity: number, cost: number | null) => ({ id, project_item_id: link, usage_amount: quantity, usage_cost: cost }) as LogItemUsage

describe('project financials', () => {
  it('treats cleared inputs as unknown, preserves zero and rejects invalid amounts', () => {
    expect(optionalAmount('')).toBeNull()
    expect(optionalAmount(undefined)).toBeNull()
    expect(optionalAmount('0')).toBe(0)
    expect(() => optionalAmount(-1)).toThrow()
    expect(() => optionalAmount('invalid')).toThrow()
  })
  it('separates allocation, tools, actual purchases and consumable quantities', () => {
    const items = [entry('bike', 'subject', 200, 200), entry('chain', 'part', 30, 25), entry('grease', 'consumable', 20), entry('wrench', 'tool', 50)]
    const totals = projectFinancials(items, [usage('u', 'grease', 150, 2)], 'EUR')
    expect(totals).toMatchObject({ projectCost: 227, toolExpenditure: 50, actualExpenditure: 300, plannedExpenditure: 0 })
  })
  it('never guesses an allocation or turns old quantities into money', () => {
    const totals = projectFinancials([entry('part', 'part', 100), entry('fluid', 'consumable', 20)], [usage('u', 'fluid', 150, null)], 'EUR')
    expect(totals).toMatchObject({ projectCost: 0, missingAllocations: 1, missingUsageCosts: 1 })
  })
  it('keeps estimates out of actual expenditure, including free purchases', () => {
    const planned = entry('p', 'part', null); planned.item.estimated_amount = 30; planned.item.estimated_currency_code = 'EUR'
    const free = entry('f', 'part', 0, 0); free.item.estimated_amount = 50; free.item.estimated_currency_code = 'EUR'
    expect(projectFinancials([planned, free], [], 'EUR')).toMatchObject({ plannedExpenditure: 30, actualExpenditure: 0 })
  })
  it('deduplicates purchases and usage and excludes foreign money', () => {
    const tool = entry('t', 'tool', 10)
    const fluid = entry('c', 'consumable', 5)
    const row = usage('u', 'c', 1, 0.1)
    const totals = projectFinancials([tool, { ...tool, id: 'other-link' }, fluid, entry('foreign', 'part', 100, 2, 'USD')], [row, row, usage('v', 'c', 1, 0.2)], 'EUR')
    expect(totals).toMatchObject({ projectCost: 2.3, actualExpenditure: 15, toolExpenditure: 10, foreignItems: 1 })
  })
})
