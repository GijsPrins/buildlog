import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImageRole, ProjectLog } from '../types/domain'

export interface UploadPhoto { id: string; file: File; caption: string; role: ImageRole }
interface Reservation { id: string; storage_path: string; upload_status: string }
export interface LogSaveInput {
  log: Record<string, unknown>
  usage: Array<Record<string, unknown>> | null
  imageEdits: Array<Record<string, unknown>>
  photos: UploadPhoto[]
  sortOffset?: number
}

export async function saveWorkshopLog(client: SupabaseClient, input: LogSaveInput, progress: (index: number, text: string) => void = () => {}) {
  const { data, error } = await client.rpc('save_workshop_log', {
    p_log: input.log, p_usage: input.usage, p_image_edits: input.imageEdits,
    p_new_images: input.photos.map((photo, index) => ({
      id: photo.id, name: photo.file.name, type: photo.file.type || 'image/jpeg', size: photo.file.size,
      role: photo.role, caption: photo.caption.trim() || null, sort_order: (input.sortOffset ?? 0) + index
    }))
  })
  if (error) throw new Error(error.message)
  if (!data?.log?.id || !Array.isArray(data.images)) throw new Error('The session save could not be confirmed. Retry to check the same record.')
  const result = data as { log: ProjectLog; images: Reservation[] }
  try {
    for (const [index, photo] of input.photos.entries()) {
      const reservation = result.images.find(image => image.id === photo.id)
      if (!reservation) throw new Error(`Could not find the reservation for ${photo.file.name}.`)
      if (reservation.upload_status === 'ready') { progress(index, `Uploaded ${photo.file.name}`); continue }
      progress(index, `Uploading original ${photo.file.name}…`)
      const { error: uploadError } = await client.storage.from('project-originals').upload(reservation.storage_path, photo.file, { contentType: photo.file.type || 'image/jpeg', upsert: false })
      // The same immutable ID belongs to the same File, including after a lost response.
      // Never upsert an original or accept arbitrary upload failures as success.
      if (uploadError && !(uploadError.statusCode === '409' || uploadError.message === 'The resource already exists')) throw uploadError
      const { error: readyError } = await client.from('project_images').update({ upload_status: 'ready' }).eq('id', photo.id).select('id').single()
      if (readyError) throw readyError
      progress(index, `Uploaded ${photo.file.name}`)
    }
  } catch (cause) {
    throw new Error(`The session is saved, but its photos are not complete. Retry to finish the same session: ${cause instanceof Error ? cause.message : 'Upload failed.'}`)
  }
  return result.log
}

export function checkedData<T>(result: { data: T | null; error: { message: string } | null }): T | null {
  if (result.error) throw new Error(result.error.message)
  return result.data
}
