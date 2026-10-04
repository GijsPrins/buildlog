export const commentLimit = 2000
export function normalizeComment(value: string): string {
  const content = value.trim()
  if (!content) throw new Error('Write a note before leaving it at the bench.')
  if ([...content].length > commentLimit) throw new Error(`Keep your note within ${commentLimit} characters.`)
  return content
}

export interface WorkshopComment {
  id: string
  project_id: string
  log_id: string | null
  author_user_id: string | null
  author_display_name: string
  content: string
  created_at: string
  updated_at: string
}

export interface WorkshopApproval {
  id: string
  project_id: string
  log_id: string | null
  user_id: string
}
