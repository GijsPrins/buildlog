import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { ProjectLog } from '../app/types/domain'
import { useLogAuthors } from '../app/composables/useLogAuthors'
afterEach(() => vi.unstubAllGlobals())
describe('log authors', () => {
  it('shows the recorded author rather than the current owner and handles deleted accounts', async () => {
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('useDemoMode', () => ({ value: true }))
    vi.stubGlobal('useLocalAccounts', () => ({ state: { value: { accounts: [{ id: 'author', name: 'Original builder' }, { id: 'new-owner', name: 'New owner' }] } } }))
    const authors = useLogAuthors()
    const log = { created_by_user_id: 'author' } as ProjectLog
    await authors.loadAuthors([log])
    expect(authors.authorName(log)).toBe('Original builder')
    expect(authors.authorName({ created_by_user_id: null } as ProjectLog)).toBe('Former member')
    expect(authors.authorName({ created_by_user_id: 'unknown' } as ProjectLog)).toBe('Workshop member')
  })
})
