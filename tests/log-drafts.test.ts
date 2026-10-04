import { describe, expect, it } from 'vitest'
import { logDrafts, type LogDraft } from '../app/utils/logDrafts'

function draft(): LogDraft {
  return {
    title: 'Repair the wheel', phaseId: '', workDate: '2026-10-03', durationHours: 1, durationMinutes: 15,
    summary: 'Inspection', content: 'Keep these notes', finding: 'Worn bearing', decision: 'Replace it',
    findingDecisions: [{ finding: 'Wear', decision: 'Replace' }, { finding: 'Marking', decision: 'Keep' }],
    selectedItems: { bearing: true }, itemAmounts: { bearing: 2 }, itemNotes: { bearing: 'Front' }, itemStatuses: { bearing: 'installed' },
    photos: [{ file: new File(['original bytes'], 'bearing.jpg', { type: 'image/jpeg' }), caption: 'Before repair', role: 'damage' }]
  }
}

describe('log drafts during ledger navigation', () => {
  it('restores all fields and the original photo after the form is recreated', async () => {
    const app = {}; const original = draft()
    logDrafts(app, 'builder', 'bike').save(original)
    const restored = logDrafts(app, 'builder', 'bike').take()!
    expect(restored).toEqual(original)
    expect(await restored.photos[0]!.file.text()).toBe('original bytes')
    expect(logDrafts(app, 'builder', 'bike').take()).toBeUndefined()
    logDrafts(app, 'builder', 'bike').save(restored)
    expect(logDrafts(app, 'builder', 'bike').take()?.photos[0]?.caption).toBe('Before repair')
  })
  it('isolates accounts, projects and app instances and discards completed drafts', () => {
    const app = {}; const store = logDrafts(app, 'builder', 'bike')
    store.save(draft())
    expect(logDrafts(app, 'other-builder', 'bike').take()).toBeUndefined()
    expect(logDrafts(app, 'builder', 'other-bike').take()).toBeUndefined()
    expect(logDrafts({}, 'builder', 'bike').take()).toBeUndefined()
    store.clear()
    expect(store.take()).toBeUndefined()
  })
})
