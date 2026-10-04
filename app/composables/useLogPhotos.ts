import type { ImageRole } from '~/types/domain'

export function useLogPhotos() {
  const photos = ref<Array<{ id: string; file: File; preview: string; caption: string; role: ImageRole }>>([])
  const files = computed(() => photos.value.map(photo => photo.file))
  function selectFiles(event: Event) {
    const input = event.target as HTMLInputElement
    for (const file of Array.from(input.files ?? [])) {
      if (photos.value.some(photo => photo.file.name === file.name && photo.file.size === file.size && photo.file.lastModified === file.lastModified)) continue
      photos.value.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), caption: '', role: 'gallery' })
    }
    input.value = ''
  }
  function removeFile(index: number) {
    const photo = photos.value[index]
    if (photo) URL.revokeObjectURL(photo.preview)
    photos.value.splice(index, 1)
  }
  function clearPhotos() {
    for (const photo of photos.value) URL.revokeObjectURL(photo.preview)
    photos.value = []
  }
  onBeforeUnmount(clearPhotos)
  return { photos, files, selectFiles, removeFile, clearPhotos }
}
