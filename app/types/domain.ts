export type ProjectRole = 'owner' | 'contributor' | 'reader'

export type ImageRole =
  | 'before'
  | 'after'
  | 'gallery'
  | 'damage'
  | 'identification'
  | 'detail'
  | 'process'

export interface ThemeConfig {
  schemaVersion: 1
  preset: string
  colors: {
    background: string
    surface: string
    text: string
    muted: string
    primary: string
    secondary: string
    accent: string
    border: string
  }
  typography: {
    heading: string
    body: string
    technical: string
  }
  shape: {
    radius: 'none' | 'small' | 'medium'
    shadow: 'none' | 'subtle'
  }
  decoration: {
    texture: 'none' | 'grid' | 'paper'
    imageFrame: 'none' | 'bordered' | 'print'
  }
}

export interface Project {
  id: string
  slug: string
  name: string
  subtitle: string | null
  description: string | null
  started_story: string | null
  motivation_story: string | null
  object_story: string | null
  current_phase_id: string | null
  hero_image_id: string | null
  is_public: boolean
  currency_code: string
  items_enabled: boolean
  cost_tracking_enabled: boolean
  theme_config: ThemeConfig
  created_at: string
  updated_at: string
}

export interface ProjectPhase {
  id: string
  project_id: string
  name: string
  description: string | null
  sort_order: number
  archived_at: string | null
}

export interface ProjectLog {
  id: string
  project_id: string
  phase_id: string | null
  slug: string
  title: string
  work_date: string
  duration_minutes: number | null
  summary: string
  content: string
  finding_decisions: Array<{ finding: string; decision: string }>
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface ProjectImage {
  id: string
  project_id: string
  log_id: string | null
  storage_path: string
  original_file_name: string | null
  media_type: string | null
  byte_size: number | null
  role: ImageRole
  caption: string | null
  sort_order: number
  upload_status: 'reserved' | 'ready' | 'failed'
  uploaded_by_user_id: string | null
  deleted_at: string | null
  created_at: string
}

export interface ProjectMembership {
  project_id: string
  user_id: string
  role: ProjectRole
}

export type ProjectItemRole = 'subject' | 'part' | 'material' | 'consumable' | 'tool' | 'external_service'
export type ProjectItemStatus = 'planned' | 'ordered' | 'available' | 'installed' | 'used' | 'removed'

export interface Item {
  id: string
  owner_user_id: string
  name: string
  brand: string | null
  purchase_amount: number | null
  purchase_currency_code: string | null
  estimated_amount: number | null
  estimated_currency_code: string | null
  supplier: string | null
  url: string | null
  notes: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface ProjectItem {
  id: string
  project_id: string
  item_id: string
  role: ProjectItemRole
  status: ProjectItemStatus | null
  notes: string | null
  attributed_amount: number | null
  created_at: string
  updated_at: string
}

export interface ProjectItemDetail extends ProjectItem {
  item: Item
}

export interface LogItemUsage {
  id: string
  project_id: string
  log_id: string
  project_item_id: string
  usage_amount: number | null
  usage_cost?: number | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface LogItemUsageDetail extends LogItemUsage {
  projectItem: ProjectItemDetail
}

export interface ProjectSummary extends Project {
  currentPhase?: string | null
  totalMinutes?: number
  logCount?: number
  heroImageUrl?: string | null
}
