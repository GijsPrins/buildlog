import { describe, expect, it } from 'vitest'
import { formatDuration, formatProjectDate, slugify } from '../app/utils/format'

describe('slugify', () => {
  it('creates a stable route-safe slug', () => {
    expect(slugify('Peugeot — Headset overhaul!')).toBe('peugeot-headset-overhaul')
  })
})

describe('formatDuration', () => {
  it('formats workshop time compactly', () => {
    expect(formatDuration(135)).toBe('2h 15m')
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(null)).toBe('No time recorded')
  })
})

describe('formatProjectDate', () => {
  it('formats date-only and timestamp values safely', () => {
    expect(formatProjectDate('2026-09-29')).toContain('2026')
    expect(formatProjectDate('2026-09-29T18:30:00Z')).toContain('2026')
    expect(formatProjectDate('')).toBe('Date unknown')
  })
})
