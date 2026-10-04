import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkedData, saveWorkshopLog, saveProjectCreation } from '../app/utils/workshopSaves'
import { collectInBatches, collectPages } from '../app/utils/workshopFinancials'

function fixture() {
  const photo = { id: 'photo-stable', file: new File(['original'], 'bearing.jpg', { type: 'image/jpeg' }), role: 'detail' as const, caption: 'Before cleaning' }
  const input = { log: { id: 'log-stable', create: true }, usage: [], imageEdits: [], photos: [photo] }
  const upload = vi.fn().mockResolvedValue({ error: null })
  const ready = vi.fn().mockResolvedValue({ data: { id: photo.id }, error: null })
  const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: ready }
  const rpc = vi.fn().mockResolvedValue({ data: { log: { id: 'log-stable' }, images: [{ id: photo.id, storage_path: 'project/photo-stable/original', upload_status: 'reserved' }] }, error: null })
  const client = { rpc, storage: { from: () => ({ upload }) }, from: () => chain } as unknown as SupabaseClient
  return { client, input, rpc, upload, ready }
}

describe('safe workshop saves', () => {
  it('sends removed pending photo IDs with the retry rather than dropping them silently', async () => {
    const f = fixture()
    await saveWorkshopLog(f.client, { ...f.input, removedPhotoIds: ['previous-upload'] })
    expect(f.rpc.mock.calls[0]![1].p_image_edits).toEqual([{ id: 'previous-upload', removed: true, pending: true, role: 'gallery', caption: null }])
  })
  it('resumes project cover uploads with the same project and photo reservation', async () => {
    const f = fixture()
    f.rpc.mockResolvedValue({ data: 'project-stable', error: null })
    const chain = f.client.from('project_images') as unknown as Record<string, unknown>
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'photo-stable', storage_path: 'project/photo-stable/original', upload_status: 'reserved' }, error: null })
    f.upload.mockResolvedValueOnce({ error: new Error('Upload failed') })
    const project = { id: 'project-stable', slug: 'kept-slug' }
    await expect(saveProjectCreation(f.client, project, [], f.input.photos[0]!, 'owner')).rejects.toThrow('finish the same project')
    await saveProjectCreation(f.client, project, [], f.input.photos[0]!, 'owner')
    expect(f.rpc.mock.calls[1]).toEqual(f.rpc.mock.calls[0])
    expect(f.upload.mock.calls[1]![0]).toBe(f.upload.mock.calls[0]![0])
  })
  it('retries the same session and photo after a failed upload', async () => {
    const f = fixture()
    f.upload.mockResolvedValueOnce({ error: new Error('Network failure') })
    await expect(saveWorkshopLog(f.client, f.input)).rejects.toThrow('finish the same session')
    await saveWorkshopLog(f.client, f.input)
    expect(f.rpc.mock.calls[0]).toEqual(f.rpc.mock.calls[1])
    expect(f.upload.mock.calls[0]![0]).toBe(f.upload.mock.calls[1]![0])
    expect(f.upload.mock.calls[1]![2]).toMatchObject({ upsert: false })
  })
  it('finishes a previously uploaded original after its confirmation response was lost', async () => {
    const f = fixture()
    f.ready.mockResolvedValueOnce({ error: new Error('Confirmation failed') })
    await expect(saveWorkshopLog(f.client, f.input)).rejects.toThrow('photos are not complete')
    f.upload.mockResolvedValueOnce({ error: { statusCode: '409', message: 'Already exists' } })
    await saveWorkshopLog(f.client, f.input)
    expect(f.ready).toHaveBeenCalledTimes(2)
  })
  it('skips confirmed photos and refuses to disguise other upload failures', async () => {
    const f = fixture()
    f.rpc.mockResolvedValueOnce({ data: { log: { id: 'log-stable' }, images: [{ id: 'photo-stable', upload_status: 'ready' }] }, error: null })
    await saveWorkshopLog(f.client, f.input)
    expect(f.upload).not.toHaveBeenCalled()
    f.upload.mockResolvedValueOnce({ error: { statusCode: '403', message: 'Denied' } })
    await expect(saveWorkshopLog(f.client, f.input)).rejects.toThrow('not complete')
    expect(f.ready).not.toHaveBeenCalled()
  })
  it('does not upload anything if the relational transaction failed', async () => {
    const f = fixture()
    f.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Invalid usage cost' } })
    await expect(saveWorkshopLog(f.client, f.input)).rejects.toThrow('Invalid usage cost')
    expect(f.upload).not.toHaveBeenCalled()
  })
  it('distinguishes an empty successful read from a failed read', () => {
    expect(checkedData({ data: [], error: null })).toEqual([])
    expect(() => checkedData({ data: null, error: { message: 'Read failed' } })).toThrow('Read failed')
  })
  it('rejects incomplete or changing paged snapshots', async () => {
    await expect(collectPages(async from => ({ data: from ? [] : [1, 2], count: 3, error: null }), 2)).rejects.toThrow('Not all records')
    await expect(collectPages(async from => ({ data: [1, 2], count: from ? 5 : 4, error: null }), 2)).rejects.toThrow('changed')
    await expect(collectPages(async () => ({ data: null, error: null }))).rejects.toThrow('could not be loaded')
  })
  it('keeps large ID filters bounded and fails rather than returning a partial batch', async () => {
    const ids = Array.from({ length: 251 }, (_, i) => String(i))
    const sizes: number[] = []
    expect(await collectInBatches(ids, async subset => { sizes.push(subset.length); return subset })).toEqual(ids)
    expect(sizes).toEqual([100, 100, 51])
    await expect(collectInBatches(ids, async subset => { if (subset[0] === '100') throw new Error('Denied'); return subset })).rejects.toThrow('Denied')
  })
})
