import type { ImageRole, ProjectItemStatus } from '~/types/domain'

export interface LogDraft {
  logId?: string; logSlug?: string
  removedPhotoIds?: string[]
  title: string; phaseId: string; workDate: string
  durationHours: number | null; durationMinutes: number | null
  summary: string; content: string; finding: string; decision: string
  findingDecisions?: Array<{ finding: string; decision: string }>
  selectedItems: Record<string, boolean>
  itemCosts?: Record<string, number | null>
  itemAmounts: Record<string, number | null>
  itemNotes: Record<string, string>
  itemStatuses: Record<string, ProjectItemStatus | ''>
  photos: Array<{ id?: string; file: File; caption: string; role: ImageRole }>
}

// Files stay in memory, scoped to one Nuxt app and account; never in SSR payloads.
const stores = new WeakMap<object, Map<string, LogDraft>>()
export function logDrafts(app: object, userId: string, projectSlug: string) {
  let store = stores.get(app)
  if (!store) { store = new Map(); stores.set(app, store) }
  const key = JSON.stringify([userId, projectSlug])
  return {
    save(draft: LogDraft) { store.set(key, draft) },
    take() { const draft = store.get(key); store.delete(key); return draft },
    clear() { store.delete(key) }
  }
}
