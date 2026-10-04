import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { useLogPhotos } from '../app/composables/useLogPhotos'

beforeEach(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('onBeforeUnmount', vi.fn())
  let id = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:photo-${++id}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('workshop photo selection', () => {
  it('appends separate selections, preserves metadata and ignores duplicate picks or cancellation', () => {
    const editor = useLogPhotos()
    const first = new File(['one'], 'one.jpg', { lastModified: 1 })
    const second = new File(['two'], 'two.jpg', { lastModified: 2 })
    const pick = (files: File[]) => {
      const input = { files, value: 'selected' }
      editor.selectFiles({ target: input } as unknown as Event)
      expect(input.value).toBe('')
    }
    pick([first])
    editor.photos.value[0]!.caption = 'Worn bearing'
    editor.photos.value[0]!.role = 'damage'
    pick([second]); pick([first]); pick([])
    expect(editor.files.value).toEqual([first, second])
    expect(editor.photos.value[0]).toMatchObject({ caption: 'Worn bearing', role: 'damage' })
    expect(editor.photos.value[1]).toMatchObject({ caption: '', role: 'gallery' })
    const removedId = editor.photos.value[0]!.id
    editor.removeFile(0)
    expect(editor.removedPhotoIds.value).toEqual([removedId])
    expect(editor.files.value).toEqual([second])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-1')
    pick([first])
    expect(editor.files.value).toEqual([second, first])
    editor.clearPhotos()
    expect(editor.files.value).toEqual([])
    expect(editor.removedPhotoIds.value).toEqual([])
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3)
  })
})
