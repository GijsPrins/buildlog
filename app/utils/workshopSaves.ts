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
  removedPhotoIds?: string[]
}

export async function saveWorkshopLog(client: SupabaseClient, input: LogSaveInput, progress: (index: number, text: string) => void = () => {}) {
  const { data, error } = await client.rpc('save_workshop_log', {
    p_log: input.log, p_usage: input.usage, p_image_edits: [...input.imageEdits,
      ...(input.removedPhotoIds ?? []).map(id => ({ id, removed: true, pending: true, role: 'gallery', caption: null }))],
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

export async function saveProjectCreation(client: SupabaseClient, project: Record<string, unknown>, phases: Array<Record<string, unknown>>, cover: UploadPhoto | null, userId: string) {
  const { data: id, error } = await client.rpc('create_project_record', { p_project: project, p_phases: phases })
  if (error) throw new Error(error.message)
  if (id !== project.id) throw new Error('Project creation could not be confirmed. Retry to resume the same project.')
  if (!cover) return id as string
  try {
    let image = checkedData<Reservation>(await client.from('project_images').select('id,storage_path,upload_status').eq('id', cover.id).maybeSingle())
    if (!image) image = checkedData<Reservation>(await client.from('project_images').insert({
      id: cover.id, project_id: id, log_id: null, original_file_name: cover.file.name,
      media_type: cover.file.type || 'image/jpeg', byte_size: cover.file.size, role: cover.role,
      caption: cover.caption, sort_order: 0, uploaded_by_user_id: userId
    }).select('id,storage_path,upload_status').single())
    if (!image) throw new Error('Could not reserve the cover.')
    if (image.upload_status !== 'ready') {
      checkedData(await client.from('project_images').update({ upload_status: 'reserved' }).eq('id', cover.id).select('id').single())
      const { error: uploadError } = await client.storage.from('project-originals').upload(image.storage_path, cover.file, { contentType: cover.file.type || 'image/jpeg', upsert: false })
      if (uploadError && !(uploadError.statusCode === '409' || uploadError.message === 'The resource already exists')) throw uploadError
      checkedData(await client.from('project_images').update({ upload_status: 'ready' }).eq('id', cover.id).select('id').single())
    }
    checkedData(await client.from('projects').update({ hero_image_id: cover.id }).eq('id', id).select('id').single())
  } catch (cause) {
    throw new Error(`The project is saved, but its cover is not complete. Retry to finish the same project: ${cause instanceof Error ? cause.message : 'Upload failed.'}`)
  }
  return id as string
}
