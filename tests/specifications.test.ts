import { describe, expect, it } from 'vitest'
import { normalizeSpecification, bicycleSpecSuggestions } from '../app/utils/specifications'
describe('project specifications', () => {
  const fact = { section: 'Building', label: 'Year', value: '1928', notes: '', source: '', sort_order: 0 }
  it('accepts generic facts and normalizes optional fields', () => {
    expect(normalizeSpecification(fact)).toMatchObject({ value: '1928', notes: null, source: null })
    expect(bicycleSpecSuggestions.some(entry => entry.label === 'Serial number')).toBe(true)
  })
  it('rejects empty facts, overlong headings and invalid ordering', () => {
    for (const change of [{ section: ' ' }, { label: 'x'.repeat(161) }, { value: ' ' }, { sort_order: -1 }, { sort_order: 1.5 }]) {
      expect(() => normalizeSpecification({ ...fact, ...change })).toThrow()
    }
  })
})
