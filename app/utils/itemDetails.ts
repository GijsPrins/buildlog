import type { Item } from '../types/domain'
import { optionalAmount } from './financials'

export function normalizeItemDetails(item: Item, fallbackCurrency: string) {
  if (!item.name.trim()) throw new Error('Enter an item name.')
  const url = item.url?.trim() || null
  if (url && !/^https?:\/\//i.test(url)) throw new Error('Use an http or https supplier URL.')
  const purchase = optionalAmount(item.purchase_amount), estimate = optionalAmount(item.estimated_amount)
  function currency(value: string | null) {
    const code = (value?.trim() || fallbackCurrency).toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) throw new Error('Use a three-letter currency code, such as EUR.')
    return code
  }
  return {
    name: item.name.trim(), brand: item.brand?.trim() || null, notes: item.notes?.trim() || null,
    supplier: item.supplier?.trim() || null, url,
    purchase_amount: purchase, purchase_currency_code: purchase === null ? null : currency(item.purchase_currency_code),
    estimated_amount: estimate, estimated_currency_code: estimate === null ? null : currency(item.estimated_currency_code)
  }
}
