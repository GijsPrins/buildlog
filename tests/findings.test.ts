import { describe, expect, it } from 'vitest'
import { normalizeFindings } from '../app/utils/findings'
describe('finding and decision lists', () => {
  it('keeps every meaningful pair in order without changing the draft', () => {
    const input = [{ finding: ' Wear ', decision: ' Replace ' }, { finding: '', decision: ' Inspect later ' }, { finding: ' Marking ', decision: '' }, { finding: ' ', decision: '' }]
    expect(normalizeFindings(input)).toEqual([{ finding: 'Wear', decision: 'Replace' }, { finding: '', decision: 'Inspect later' }, { finding: 'Marking', decision: '' }])
    expect(input[0]?.finding).toBe(' Wear ')
  })
})
