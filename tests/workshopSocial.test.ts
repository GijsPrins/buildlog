import { describe, expect, it } from 'vitest'
import { normalizeComment } from '../app/utils/workshopSocial'

describe('workshop notes', () => {
  it('keeps plain text and line breaks, including markup as text', () => {
    expect(normalizeComment('  Nice work!\n<script>alert(1)</script>  ')).toBe('Nice work!\n<script>alert(1)</script>')
  })
  it('rejects empty or oversized notes', () => {
    expect(() => normalizeComment(' \n ')).toThrow()
    expect(() => normalizeComment('x'.repeat(2001))).toThrow()
    expect(normalizeComment('x'.repeat(2000))).toHaveLength(2000)
  })
})
