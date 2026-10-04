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
  parent_id: string | null
  thread_id: string
  deleted_at: string | null
  author_user_id: string | null
  author_display_name: string
  content: string
  created_at: string
  updated_at: string
}

export interface WorkshopThread extends WorkshopComment { reply_count: number }
export interface WorkshopReply extends WorkshopComment {
  parent?: Pick<WorkshopComment, 'id' | 'author_display_name' | 'content' | 'deleted_at'> | null
}

export interface WorkshopApproval {
  id: string
  project_id: string
  log_id: string | null
  user_id: string
}

/** Counts a parent page loads in one batch so compact log cards need no queries of their own. */
export interface WorkshopSummary { approvals: number; notes: number; approved: boolean }
