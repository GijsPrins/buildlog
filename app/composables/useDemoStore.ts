import type { ImageRole, ProjectSpec, Item, LogItemUsage, LogItemUsageDetail, Project, ProjectImage, ProjectItem, ProjectItemDetail, ProjectItemRole, ProjectItemStatus, ProjectLog, ProjectPhase, ProjectSummary, ThemeConfig } from '~/types/domain'

import { normalizeSpecification } from '../utils/specifications'

const STORAGE_KEY = 'buildlog-demo-v5'

interface DemoDatabase {
  specifications?: ProjectSpec[]
  projects: Project[]
  phases: ProjectPhase[]
  logs: ProjectLog[]
  images: ProjectImage[]
  items: Item[]
  projectItems: ProjectItem[]
  logItemUsage: LogItemUsage[]
}

export interface DemoProjectInput {
  name: string
  slug: string
  subtitle: string | null
  description: string | null
  startedStory: string | null
  motivationStory: string | null
  objectStory: string | null
  isPublic: boolean
  itemsEnabled: boolean
  costsEnabled: boolean
  currencyCode: string
  theme: ThemeConfig
  phases: string[]
  currentPhaseIndex: number | null
  heroImage: { name: string; type: string; size: number; dataUrl: string } | null
}

export interface DemoProjectUpdateInput {
  projectId: string
  name: string
  slug: string
  subtitle: string | null
  description: string | null
  startedStory: string | null
  motivationStory: string | null
  objectStory: string | null
  isPublic: boolean
  itemsEnabled: boolean
  costsEnabled: boolean
  theme: ThemeConfig
  currentPhaseKey: string | null
  phases: Array<{ key: string; id: string | null; name: string; archived: boolean }>
  heroImage: { name: string; type: string; size: number; dataUrl: string } | null
}

export interface DemoLogInput {
  projectId: string
  phaseId: string | null
  title: string
  workDate: string
  durationMinutes: number | null
  summary: string
  content: string
  findingDecisions: Array<{ finding: string; decision: string }>
  imageRole: ImageRole
  images: Array<{ name: string; type: string; size: number; dataUrl: string; role?: ImageRole; caption?: string | null }>
  itemUsage: Array<{ projectItemId: string; usageAmount: number | null; usageCost?: number | null; note: string | null; statusAfter?: ProjectItemStatus | null }>
}

export interface DemoLogUpdateInput {
  logId: string
  phaseId: string | null
  title: string
  workDate: string
  durationMinutes: number | null
  summary: string
  content: string
  findingDecisions: Array<{ finding: string; decision: string }>
  imageRole: ImageRole
  newImages: Array<{ name: string; type: string; size: number; dataUrl: string; role?: ImageRole; caption?: string | null }>
  imageEdits?: Array<{ id: string; role: ImageRole; caption: string | null }>
  removedImageIds: string[]
  itemUsage: DemoLogInput['itemUsage']
}

export interface DemoProjectItemInput {
  projectId: string
  name: string
  brand: string | null
  role: ProjectItemRole
  status: ProjectItemStatus | null
  notes: string | null
  estimatedAmount?: number | null
  purchaseAmount: number | null
  attributedAmount: number | null
  currencyCode: string
}

const theme: ThemeConfig = {
  schemaVersion: 1,
  preset: 'retro-sprint',
  colors: {
    background: '#eaf1ed', surface: '#fbfaf4', text: '#172b2d', muted: '#687678',
    primary: '#007d7c', secondary: '#714395', accent: '#e83e88', border: '#b9cec7'
  },
  typography: { heading: 'serif', body: 'sans', technical: 'mono' },
  shape: { radius: 'small', shadow: 'subtle' },
  decoration: { texture: 'grid', imageFrame: 'print' }
}

const giosTheme: ThemeConfig = {
  schemaVersion: 1,
  preset: 'italian-racer',
  colors: {
    background: '#eee9dc', surface: '#fffaf0', text: '#201c19', muted: '#75675f',
    primary: '#6e2630', secondary: '#26352b', accent: '#08754f', border: '#cbbda9'
  },
  typography: { heading: 'serif', body: 'sans', technical: 'mono' },
  shape: { radius: 'none', shadow: 'subtle' },
  decoration: { texture: 'paper', imageFrame: 'print' }
}

export function createDemoDatabase(): DemoDatabase {
  const projectId = 'demo-peugeot'
  const phaseNames = ['Purchase', 'Inspection', 'Disassembly', 'Cleaning', 'Overhaul', 'Assembly', 'Tuning', 'Done']
  const phases = phaseNames.map((name, index): ProjectPhase => ({
    id: `demo-phase-${index + 1}`,
    project_id: projectId,
    name,
    description: null,
    sort_order: index,
    archived_at: null
  }))

  const logs: ProjectLog[] = [
    {
      id: 'demo-log-3', project_id: projectId, phase_id: phases[3]!.id,
      slug: 'frame-cleanup', title: 'Forty years of grime, gone', work_date: '2026-09-21',
      duration_minutes: 155,
      summary: 'The frame cleaned up beautifully; the original paint is worth preserving.',
      content: 'Degreased the bottom bracket shell and carefully removed the old decals residue. A mild polish brought the turquoise back without making it look unnaturally new.',
      finding_decisions: [{ finding: 'Small paint chips around both rear dropouts.', decision: 'Stabilise the rust and touch in locally instead of repainting the frame.' }],
      created_by_user_id: 'demo-user', created_at: '2026-09-21T18:30:00Z', updated_at: '2026-09-21T18:30:00Z'
    },
    {
      id: 'demo-log-2', project_id: projectId, phase_id: phases[2]!.id,
      slug: 'careful-disassembly', title: 'A careful strip-down', work_date: '2026-09-14',
      duration_minutes: 210,
      summary: 'Everything came apart without drama, including the stubborn drive-side cup.',
      content: 'Photographed cable routing and spacer order before removing parts. Labelled every bag so reassembly should be pleasantly boring.',
      finding_decisions: [{ finding: 'Headset bearings are dull but the races show no pitting.', decision: 'Clean, repack and reuse the original headset.' }],
      created_by_user_id: 'demo-user', created_at: '2026-09-14T17:00:00Z', updated_at: '2026-09-14T17:00:00Z'
    },
    {
      id: 'demo-log-1', project_id: projectId, phase_id: phases[1]!.id,
      slug: 'first-inspection', title: 'The starting point', work_date: '2026-09-07',
      duration_minutes: 75,
      summary: 'Complete, straight and much better underneath the dust than expected.',
      content: 'Checked the frame alignment, photographed component markings and made a first list of wear items. The goal is now a sympathetic mechanical restoration rather than a full cosmetic rebuild.',
      finding_decisions: [{ finding: 'Tyres, brake pads and cables are unsafe to reuse.', decision: 'Replace consumables, but keep every serviceable original component.' }],
      created_by_user_id: 'demo-user', created_at: '2026-09-07T12:00:00Z', updated_at: '2026-09-07T12:00:00Z'
    }
  ]

  const images: ProjectImage[] = [
    {
      id: 'demo-image-before', project_id: projectId, log_id: 'demo-log-1',
      storage_path: '/demo/peugeot-start.png', original_file_name: 'peugeot-start.png', media_type: 'image/png',
      byte_size: 1562111, role: 'before', caption: 'As advertised: bright turquoise, purple tape and plenty of work to do.', sort_order: 0,
      upload_status: 'ready', uploaded_by_user_id: 'demo-user', deleted_at: null, created_at: '2026-09-07T12:00:00Z'
    },
    {
      id: 'demo-image-side', project_id: projectId, log_id: 'demo-log-1',
      storage_path: '/demo/peugeot-side.png', original_file_name: 'peugeot-side.png', media_type: 'image/png',
      byte_size: 1497226, role: 'identification', caption: 'The complete drive-side profile and original graphics.', sort_order: 1,
      upload_status: 'ready', uploaded_by_user_id: 'demo-user', deleted_at: null, created_at: '2026-09-07T12:00:00Z'
    },
    {
      id: 'demo-image-cockpit', project_id: projectId, log_id: 'demo-log-1',
      storage_path: '/demo/peugeot-cockpit.png', original_file_name: 'peugeot-cockpit.png', media_type: 'image/png',
      byte_size: 1462862, role: 'detail', caption: 'Cockpit view: purple tape, white cables and narrow bars.', sort_order: 2,
      upload_status: 'ready', uploaded_by_user_id: 'demo-user', deleted_at: null, created_at: '2026-09-07T12:00:00Z'
    },
    {
      id: 'demo-image-detail', project_id: projectId, log_id: 'demo-log-1',
      storage_path: '/demo/peugeot-detail.png', original_file_name: 'peugeot-detail.png', media_type: 'image/png',
      byte_size: 1039385, role: 'detail', caption: 'Peugeot lettering, frame controls and the vivid original paint.', sort_order: 3,
      upload_status: 'ready', uploaded_by_user_id: 'demo-user', deleted_at: null, created_at: '2026-09-07T12:00:00Z'
    }
  ]

  const giosProjectId = 'demo-gios'
  const giosPhaseNames = ['Provenance', 'Inspection', 'Strip-down', 'Conservation', 'Rebuild', 'Road test', 'Complete']
  const giosPhases = giosPhaseNames.map((name, index): ProjectPhase => ({
    id: `gios-phase-${index + 1}`,
    project_id: giosProjectId,
    name,
    description: null,
    sort_order: index,
    archived_at: null
  }))
  const giosLogs: ProjectLog[] = [{
    id: 'gios-log-1', project_id: giosProjectId, phase_id: giosPhases[1]!.id,
    slug: 'garden-gate-inspection', title: 'An Italian racer in the garden', work_date: '2026-09-28',
    duration_minutes: 50,
    summary: 'A complete Gios Torino with a wonderfully honest patina and a strong original identity.',
    content: 'The ivory frame, wine-red bar tape and small tricolore details make the direction clear: conserve its character, refresh the mechanics and avoid turning it into a showroom replica. First checks suggest a straight frame and a very usable foundation.',
    finding_decisions: [
      { finding: 'Paint chips and age marks are visible, but the frame graphics remain legible.', decision: 'Clean and stabilise the finish; preserve the patina rather than repainting.' },
      { finding: 'The red contact points dominate the bike visually.', decision: 'Use oxblood as the theme colour, balanced by warm ivory and Italian green.' }
    ],
    created_by_user_id: 'demo-user', created_at: '2026-09-28T21:05:00Z', updated_at: '2026-09-28T21:05:00Z'
  }]
  const giosImages: ProjectImage[] = [{
    id: 'gios-image-start', project_id: giosProjectId, log_id: 'gios-log-1',
    storage_path: '/demo/gios-start.jpeg', original_file_name: 'gios-start.jpeg', media_type: 'image/jpeg',
    byte_size: 439885, role: 'before', caption: 'The starting point: complete, elegant and full of useful clues.', sort_order: 0,
    upload_status: 'ready', uploaded_by_user_id: 'demo-user', deleted_at: null, created_at: '2026-09-28T21:05:00Z'
  }]

  const giosItems: Item[] = [
    { id: 'gios-item-bike', owner_user_id: 'demo-user', name: 'Gios Torino steel road bike', brand: 'Gios Torino', purchase_amount: null, purchase_currency_code: null, estimated_amount: null, estimated_currency_code: null, supplier: null, url: null, notes: 'The complete starting object, retained as the project subject.', created_by_user_id: 'demo-user', created_at: '2026-09-28T21:05:00Z', updated_at: '2026-09-28T21:05:00Z' },
    { id: 'gios-item-cables', owner_user_id: 'demo-user', name: 'Brake & gear cable set', brand: 'Jagwire', purchase_amount: null, purchase_currency_code: null, estimated_amount: null, estimated_currency_code: null, supplier: null, url: null, notes: 'Stainless inners with period-correct outer casing.', created_by_user_id: 'demo-user', created_at: '2026-09-28T21:10:00Z', updated_at: '2026-09-28T21:10:00Z' },
    { id: 'gios-item-pads', owner_user_id: 'demo-user', name: 'Road brake pads', brand: 'Kool-Stop', purchase_amount: null, purchase_currency_code: null, estimated_amount: null, estimated_currency_code: null, supplier: null, url: null, notes: 'Salmon compound for the original calipers.', created_by_user_id: 'demo-user', created_at: '2026-09-28T21:11:00Z', updated_at: '2026-09-28T21:11:00Z' },
    { id: 'gios-item-grease', owner_user_id: 'demo-user', name: 'Workshop bearing grease', brand: null, purchase_amount: null, purchase_currency_code: null, estimated_amount: null, estimated_currency_code: null, supplier: null, url: null, notes: 'For headset, hubs and bottom bracket service.', created_by_user_id: 'demo-user', created_at: '2026-09-28T21:12:00Z', updated_at: '2026-09-28T21:12:00Z' }
  ]
  const giosProjectItems: ProjectItem[] = [
    { id: 'gios-project-item-bike', project_id: giosProjectId, item_id: 'gios-item-bike', role: 'subject', status: 'available', notes: null, attributed_amount: null, created_at: '2026-09-28T21:05:00Z', updated_at: '2026-09-28T21:05:00Z' },
    { id: 'gios-project-item-cables', project_id: giosProjectId, item_id: 'gios-item-cables', role: 'part', status: 'planned', notes: null, attributed_amount: null, created_at: '2026-09-28T21:10:00Z', updated_at: '2026-09-28T21:10:00Z' },
    { id: 'gios-project-item-pads', project_id: giosProjectId, item_id: 'gios-item-pads', role: 'part', status: 'ordered', notes: null, attributed_amount: null, created_at: '2026-09-28T21:11:00Z', updated_at: '2026-09-28T21:11:00Z' },
    { id: 'gios-project-item-grease', project_id: giosProjectId, item_id: 'gios-item-grease', role: 'consumable', status: 'available', notes: null, attributed_amount: null, created_at: '2026-09-28T21:12:00Z', updated_at: '2026-09-28T21:12:00Z' }
  ]
  const giosUsage: LogItemUsage[] = [{
    id: 'gios-usage-grease', project_id: giosProjectId, log_id: 'gios-log-1', project_item_id: 'gios-project-item-grease',
    usage_amount: 1, note: 'Used lightly during the first bearing inspection.', created_at: '2026-09-28T21:15:00Z', updated_at: '2026-09-28T21:15:00Z'
  }]

  return {
    projects: [
      {
        id: giosProjectId,
        slug: 'gios-torino-restoration',
        name: 'Gios Torino conservazione',
        subtitle: 'Ivory steel, oxblood details and a little Italian restraint',
        description: 'A mechanical revival that keeps every honest mark of a life already well ridden.',
        started_story: 'It arrived complete in the garden: an ivory Gios Torino with wine-red tape, a weathered finish and enough original detail to make a heavy-handed restoration feel wrong.',
        motivation_story: 'The aim is to make it mechanically dependable while keeping the patina that gives it authority. This should feel like the same bicycle after careful stewardship, not a new replica.',
        object_story: 'The exact rides are unknown, but the chipped paint, legible graphics and well-used contact points tell their own history. It is an Italian steel racer that has already earned its marks.',
        current_phase_id: giosPhases[1]!.id,
        hero_image_id: 'gios-image-start',
        is_public: true,
        currency_code: 'EUR',
        items_enabled: true,
        cost_tracking_enabled: false,
        theme_config: giosTheme,
        created_at: '2026-09-28T21:05:00Z',
        updated_at: '2026-09-28T21:05:00Z'
      },
      {
        id: projectId,
        slug: 'peugeot-road-bike',
        name: 'Peugeot road bike revival',
        subtitle: 'Turquoise steel, purple tape and unapologetic nineties energy',
        description: 'A lively mechanical restoration that keeps the original graphics and colour story front and centre.',
        started_story: 'It first appeared in a marketplace advert, leaning against a wooden fence: turquoise paint, purple bar tape, white cables and a practical rear rack. Complete, slightly tired and impossible to ignore.',
        motivation_story: 'The odd, joyful nineties character is the reason to save it. The goal is a reliable bike that rides properly again without sanding away the colours, graphics and choices that make it memorable.',
        object_story: 'This Peugeot has clearly lived as a working bicycle, not a display piece. The rack, mixed accessories, weathered drivetrain and small scars point to years of practical use before this next chapter.',
        current_phase_id: phases[3]!.id,
        hero_image_id: 'demo-image-before',
        is_public: true,
        currency_code: 'EUR',
        items_enabled: false,
        cost_tracking_enabled: false,
        theme_config: theme,
        created_at: '2026-09-07T12:00:00Z',
        updated_at: '2026-09-21T18:30:00Z'
      }
    ],
    phases: [...giosPhases, ...phases],
    logs: [...giosLogs, ...logs],
    images: [...giosImages, ...images],
    items: giosItems,
    projectItems: giosProjectItems,
    logItemUsage: giosUsage
  }
}

export function useDemoMode() {
  return computed(() => !useSupabaseConfigured())
}

export function useDemoStore() {
  const database = useState<DemoDatabase>('demo-database', createDemoDatabase)
  const accounts = useLocalAccounts()
  const initialized = useState('demo-initialized', () => false)

  function initialize() {
    if (initialized.value || !import.meta.client) return
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        database.value = JSON.parse(saved) as DemoDatabase
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    database.value.items ??= []
    database.value.projectItems ??= []
    database.value.logItemUsage ??= []
    accounts.ensureOwners(database.value.projects.map(project => project.id))
    initialized.value = true
  }

  function persist() {
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify(database.value))
  }

  function listProjects(): ProjectSummary[] {
    return database.value.projects.filter(project => project.is_public || accounts.role(project.id))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(project => {
        const logs = database.value.logs.filter(log => log.project_id === project.id)
        return {
          ...project,
          currentPhase: database.value.phases.find(phase => phase.id === project.current_phase_id)?.name ?? null,
          logCount: logs.length,
          totalMinutes: logs.reduce((total, log) => total + (log.duration_minutes ?? 0), 0),
          heroImageUrl: database.value.images.find(image => image.id === project.hero_image_id)?.storage_path ?? null
        }
      })
  }

  function getProject(projectSlug: string) {
    const project = database.value.projects.find(entry => entry.slug === projectSlug) ?? null
    if (!project || (!project.is_public && !accounts.role(project.id))) return null
    return {
      project,
      phases: database.value.phases.filter(phase => phase.project_id === project.id && !phase.archived_at).sort((a, b) => a.sort_order - b.sort_order),
      logs: database.value.logs.filter(log => log.project_id === project.id).sort((a, b) => b.work_date.localeCompare(a.work_date)),
      images: database.value.images.filter(image => image.project_id === project.id && !image.deleted_at)
        .map(image => ({ ...image, signedUrl: image.storage_path })),
      projectItems: listProjectItems(project.id),
      logItemUsage: listProjectLogUsage(project.id)
    }
  }

  function listProjectItems(projectId: string): ProjectItemDetail[] {
    return (database.value.projectItems ?? [])
      .filter(entry => entry.project_id === projectId)
      .map(entry => ({ ...entry, item: database.value.items.find(item => item.id === entry.item_id)! }))
      .filter(entry => entry.item)
      .sort((a, b) => a.role.localeCompare(b.role) || a.item.name.localeCompare(b.item.name))
  }

  function listProjectLogUsage(projectId: string): LogItemUsageDetail[] {
    const details = new Map(listProjectItems(projectId).map(entry => [entry.id, entry]))
    return (database.value.logItemUsage ?? []).filter(entry => entry.project_id === projectId)
      .map(entry => ({ ...entry, projectItem: details.get(entry.project_item_id)! }))
      .filter(entry => entry.projectItem)
  }

  function getLog(projectSlug: string, logSlug: string) {
    const projectData = getProject(projectSlug)
    if (!projectData) return null
    const log = projectData.logs.find(entry => entry.slug === logSlug)
    if (!log) return null
    return {
      ...projectData, log,
      images: projectData.images.filter(image => image.log_id === log.id),
      usage: projectData.logItemUsage.filter(entry => entry.log_id === log.id)
    }
  }

  function addProjectItem(input: DemoProjectItemInput): ProjectItemDetail {
    accounts.requireRole(input.projectId)
    const now = new Date().toISOString()
    const item: Item = {
      id: crypto.randomUUID(), owner_user_id: accounts.current.value!.id, name: input.name, brand: input.brand,
      purchase_amount: input.purchaseAmount, purchase_currency_code: input.purchaseAmount === null ? null : input.currencyCode,
      estimated_amount: input.estimatedAmount ?? null, estimated_currency_code: input.estimatedAmount == null ? null : input.currencyCode, supplier: null, url: null, notes: input.notes,
      created_by_user_id: accounts.current.value!.id, created_at: now, updated_at: now
    }
    const projectItem: ProjectItem = {
      id: crypto.randomUUID(), project_id: input.projectId, item_id: item.id, role: input.role,
      status: input.status, notes: null, attributed_amount: input.attributedAmount, created_at: now, updated_at: now
    }
    database.value.items ??= []
    database.value.projectItems ??= []
    database.value.items.push(item)
    database.value.projectItems.push(projectItem)
    persist()
    return { ...projectItem, item }
  }

  function listSpecifications(projectId: string) {
    const project = database.value.projects.find(entry => entry.id === projectId)
    if (!project || (!project.is_public && !accounts.role(projectId))) return []
    return (database.value.specifications ?? []).filter(entry => entry.project_id === projectId).map(entry => ({ ...entry }))
  }

  function saveSpecification(projectId: string, id: string | null, input: Omit<ProjectSpec, 'id' | 'project_id'>) {
    accounts.requireRole(projectId)
    const changes = normalizeSpecification(input)
    database.value.specifications ??= []
    if (id) {
      const spec = database.value.specifications.find(entry => entry.id === id && entry.project_id === projectId)
      if (!spec) throw new Error('Specification unavailable.')
      Object.assign(spec, changes)
    } else database.value.specifications.push({ ...changes, id: crypto.randomUUID(), project_id: projectId })
    persist()
  }

  function deleteSpecification(projectId: string, id: string) {
    accounts.requireRole(projectId)
    database.value.specifications = (database.value.specifications ?? []).filter(entry => entry.project_id !== projectId || entry.id !== id)
    persist()
  }

  function ownedItems() {
    return database.value.items.filter(item => item.owner_user_id === accounts.current.value?.id)
  }

  function linkOwnedItem(projectId: string, itemId: string, role: ProjectItemRole, status: ProjectItemStatus) {
    accounts.requireRole(projectId)
    const item = ownedItems().find(item => item.id === itemId)
    if (!item) throw new Error('Choose an item you own.')
    if (database.value.projectItems.some(entry => entry.project_id === projectId && entry.item_id === itemId)) throw new Error('This item is already on the ledger.')
    if (role === 'subject' && status !== 'removed' && database.value.projectItems.some(entry => entry.project_id === projectId && entry.role === 'subject' && entry.status !== 'removed')) throw new Error('This project already has a subject.')
    const now = new Date().toISOString()
    database.value.projectItems.push({ id: crypto.randomUUID(), project_id: projectId, item_id: itemId, role, status, notes: null, attributed_amount: null, created_at: now, updated_at: now })
    persist()
  }

  function editLedgerEntry(projectId: string, entryId: string, changes: Pick<ProjectItem, 'role' | 'status' | 'notes' | 'attributed_amount'>) {
    accounts.requireRole(projectId)
    const entry = database.value.projectItems.find(item => item.id === entryId && item.project_id === projectId)
    if (!entry) throw new Error('Item unavailable.')
    if (changes.role === 'subject' && changes.status !== 'removed' && database.value.projectItems.some(other => other.id !== entryId && other.project_id === projectId && other.role === 'subject' && other.status !== 'removed')) throw new Error('This project already has a subject.')
    Object.assign(entry, changes, { updated_at: new Date().toISOString() })
    persist()
  }

  function editOwnedItem(itemId: string, changes: Pick<Item, 'name' | 'brand' | 'notes' | 'supplier' | 'url' | 'purchase_amount' | 'purchase_currency_code' | 'estimated_amount' | 'estimated_currency_code'>) {
    const item = ownedItems().find(item => item.id === itemId)
    if (!item) throw new Error('Only the item owner can edit shared details.')
    Object.assign(item, changes, { updated_at: new Date().toISOString() })
    persist()
  }

  function setItemAllocation(projectId: string, entryId: string, amount: number | null) {
    accounts.requireRole(projectId)
    const entry = database.value.projectItems.find(item => item.id === entryId && item.project_id === projectId)
    if (!entry) throw new Error('Item unavailable.')
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new Error('Invalid allocation.')
    entry.attributed_amount = amount
    persist()
  }

  function createProject(input: DemoProjectInput) {
    if (!accounts.current.value) throw new Error('Sign in to start a project.')
    if (database.value.projects.some(project => project.slug === input.slug)) throw new Error('That workshop address is already in use.')
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const phases = input.phases.map((name, index): ProjectPhase => ({
      id: crypto.randomUUID(), project_id: id, name, description: null, sort_order: index, archived_at: null
    }))
    const project: Project = {
      id, slug: input.slug, name: input.name, subtitle: input.subtitle, description: input.description,
      started_story: input.startedStory, motivation_story: input.motivationStory, object_story: input.objectStory,
      current_phase_id: input.currentPhaseIndex === null ? null : (phases[input.currentPhaseIndex]?.id ?? phases[0]?.id ?? null), hero_image_id: null, is_public: input.isPublic,
      currency_code: input.currencyCode, items_enabled: input.itemsEnabled,
      cost_tracking_enabled: input.itemsEnabled && input.costsEnabled, theme_config: input.theme,
      created_at: now, updated_at: now
    }
    if (input.heroImage) {
      const heroImageId = crypto.randomUUID()
      project.hero_image_id = heroImageId
      database.value.images.push({
        id: heroImageId, project_id: id, log_id: null, storage_path: input.heroImage.dataUrl,
        original_file_name: input.heroImage.name, media_type: input.heroImage.type,
        byte_size: input.heroImage.size, role: 'before', caption: `The starting point for ${input.name}.`,
        sort_order: 0, upload_status: 'ready', uploaded_by_user_id: accounts.current.value!.id,
        deleted_at: null, created_at: now
      })
    }
    accounts.addOwner(project.id)
    database.value.projects.push(project)
    database.value.phases.push(...phases)
    persist()
    return project
  }

  function updateProject(input: DemoProjectUpdateInput) {
    accounts.requireRole(input.projectId, true)
    const project = database.value.projects.find(entry => entry.id === input.projectId)
    if (!project) throw new Error('Project not found.')
    if (database.value.projects.some(entry => entry.id !== input.projectId && entry.slug === input.slug)) {
      throw new Error('That workshop address is already in use.')
    }
    const now = new Date().toISOString()
    Object.assign(project, {
      name: input.name, slug: input.slug, subtitle: input.subtitle, description: input.description,
      started_story: input.startedStory, motivation_story: input.motivationStory, object_story: input.objectStory,
      is_public: input.isPublic, items_enabled: input.itemsEnabled,
      cost_tracking_enabled: input.itemsEnabled && input.costsEnabled,
      theme_config: input.theme, updated_at: now
    })
    const phaseIds = new Map<string, string>()
    input.phases.forEach((phaseInput, index) => {
      let phase = phaseInput.id ? database.value.phases.find(entry => entry.id === phaseInput.id && entry.project_id === project.id) : undefined
      if (!phase) {
        phase = { id: crypto.randomUUID(), project_id: project.id, name: phaseInput.name, description: null, sort_order: index, archived_at: phaseInput.archived ? now : null }
        database.value.phases.push(phase)
      } else {
        phase.name = phaseInput.name
        phase.sort_order = index
        phase.archived_at = phaseInput.archived ? (phase.archived_at || now) : null
      }
      phaseIds.set(phaseInput.key, phase.id)
    })
    project.current_phase_id = input.currentPhaseKey ? (phaseIds.get(input.currentPhaseKey) || null) : null
    if (input.heroImage) {
      const imageId = crypto.randomUUID()
      database.value.images.push({
        id: imageId, project_id: project.id, log_id: null, storage_path: input.heroImage.dataUrl,
        original_file_name: input.heroImage.name, media_type: input.heroImage.type, byte_size: input.heroImage.size,
        role: 'before', caption: `Current cover for ${input.name}.`, sort_order: 0, upload_status: 'ready',
        uploaded_by_user_id: accounts.current.value!.id, deleted_at: null, created_at: now
      })
      project.hero_image_id = imageId
    }
    persist()
    return project
  }

  function addLog(input: DemoLogInput) {
    accounts.requireRole(input.projectId)
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const log: ProjectLog = {
      id, project_id: input.projectId, phase_id: input.phaseId,
      slug: `${slugify(input.title)}-${input.workDate}-${id.slice(0, 6)}`,
      title: input.title, work_date: input.workDate, duration_minutes: input.durationMinutes,
      summary: input.summary, content: input.content, finding_decisions: input.findingDecisions,
      created_by_user_id: accounts.current.value!.id, created_at: now, updated_at: now
    }
    database.value.logs.push(log)
    database.value.images.push(...input.images.map((image, index): ProjectImage => ({
      id: crypto.randomUUID(), project_id: input.projectId, log_id: id, storage_path: image.dataUrl,
      original_file_name: image.name, media_type: image.type, byte_size: image.size, role: image.role ?? input.imageRole,
      caption: image.caption?.trim() || null, sort_order: index, upload_status: 'ready', uploaded_by_user_id: accounts.current.value!.id,
      deleted_at: null, created_at: now
    })))
    database.value.logItemUsage ??= []
    database.value.logItemUsage.push(...input.itemUsage.map(usage => ({
      id: crypto.randomUUID(), project_id: input.projectId, log_id: id,
      project_item_id: usage.projectItemId, usage_amount: usage.usageAmount, usage_cost: usage.usageCost ?? null,
      note: usage.note, created_at: now, updated_at: now
    })))
    for (const usage of input.itemUsage) {
      if (!usage.statusAfter) continue
      const projectItem = database.value.projectItems.find(entry => entry.id === usage.projectItemId)
      if (projectItem) { projectItem.status = usage.statusAfter; projectItem.updated_at = now }
    }
    const project = database.value.projects.find(entry => entry.id === input.projectId)
    if (project) {
      project.updated_at = now
      if (input.phaseId) project.current_phase_id = input.phaseId
    }
    persist()
    return log
  }

  function deleteLog(logId: string) {
    const log = database.value.logs.find(entry => entry.id === logId)
    if (!log) throw new Error('Log unavailable.')
    accounts.requireRole(log.project_id)
    database.value.logs = database.value.logs.filter(entry => entry.id !== logId)
    database.value.logItemUsage = database.value.logItemUsage.filter(entry => entry.log_id !== logId)
    for (const image of database.value.images) if (image.log_id === logId) image.log_id = null
    persist()
  }

  function updateLog(input: DemoLogUpdateInput) {
    const targetLog = database.value.logs.find(log => log.id === input.logId)
    if (!targetLog) throw new Error('Log not found.')
    accounts.requireRole(targetLog.project_id)
    const log = database.value.logs.find(entry => entry.id === input.logId)
    if (!log) throw new Error('Workshop session not found.')
    const now = new Date().toISOString()
    Object.assign(log, {
      phase_id: input.phaseId, title: input.title, work_date: input.workDate,
      duration_minutes: input.durationMinutes, summary: input.summary, content: input.content,
      finding_decisions: input.findingDecisions, updated_at: now
    })
    for (const image of database.value.images) {
      if (image.log_id !== log.id) continue
      if (input.removedImageIds.includes(image.id)) image.deleted_at = now
      const edit = input.imageEdits?.find(entry => entry.id === image.id)
      if (edit) { image.role = edit.role; image.caption = edit.caption?.trim() || null }
    }
    database.value.images.push(...input.newImages.map((image, index): ProjectImage => ({
      id: crypto.randomUUID(), project_id: log.project_id, log_id: log.id, storage_path: image.dataUrl,
      original_file_name: image.name, media_type: image.type, byte_size: image.size, role: image.role ?? input.imageRole,
      caption: image.caption?.trim() || null, sort_order: database.value.images.filter(entry => entry.log_id === log.id).length + index,
      upload_status: 'ready', uploaded_by_user_id: accounts.current.value!.id, deleted_at: null, created_at: now
    })))
    database.value.logItemUsage = (database.value.logItemUsage ?? []).filter(entry => entry.log_id !== log.id)
    database.value.logItemUsage.push(...input.itemUsage.map(usage => ({
      id: crypto.randomUUID(), project_id: log.project_id, log_id: log.id,
      project_item_id: usage.projectItemId, usage_amount: usage.usageAmount, usage_cost: usage.usageCost ?? null,
      note: usage.note, created_at: now, updated_at: now
    })))
    for (const usage of input.itemUsage) {
      if (!usage.statusAfter) continue
      const projectItem = database.value.projectItems.find(entry => entry.id === usage.projectItemId)
      if (projectItem) { projectItem.status = usage.statusAfter; projectItem.updated_at = now }
    }
    const project = database.value.projects.find(entry => entry.id === log.project_id)
    if (project) { project.updated_at = now; if (input.phaseId) project.current_phase_id = input.phaseId }
    persist()
    return log
  }

  function reset() {
    database.value = createDemoDatabase()
    persist()
  }

  function deleteLocalAccount(transfers: Record<string, string>, deleteProjects: boolean) {
    const userId = accounts.current.value?.id
    const ownedIds = accounts.deleteAccount(transfers, deleteProjects)
    const deleted = new Set(deleteProjects ? ownedIds : [])
    database.value.specifications = (database.value.specifications ?? []).filter(entry => !deleted.has(entry.project_id))
    database.value.projects = database.value.projects.filter(project => !deleted.has(project.id))
    database.value.phases = database.value.phases.filter(phase => !deleted.has(phase.project_id))
    database.value.logs = database.value.logs.filter(log => !deleted.has(log.project_id)).map(log => log.created_by_user_id === userId ? { ...log, created_by_user_id: null } : log)
    database.value.images = database.value.images.filter(image => !deleted.has(image.project_id)).map(image => image.uploaded_by_user_id === userId ? { ...image, uploaded_by_user_id: null } : image)
    database.value.projectItems = database.value.projectItems.filter(item => !deleted.has(item.project_id))
    database.value.logItemUsage = database.value.logItemUsage.filter(usage => !deleted.has(usage.project_id))
    const usedItemIds = new Set(database.value.projectItems.map(item => item.item_id))
    database.value.items = database.value.items.filter(item => item.owner_user_id !== userId || usedItemIds.has(item.id)).map(item => item.owner_user_id === userId ? { ...item, owner_user_id: 'deleted-account', created_by_user_id: null } : item)
    persist()
  }

  return { deleteLog, listSpecifications, saveSpecification, deleteSpecification, ownedItems, linkOwnedItem, editLedgerEntry, editOwnedItem, deleteLocalAccount, initialize, listProjects, getProject, getLog, listProjectItems, listProjectLogUsage, createProject, updateProject, setItemAllocation, addProjectItem, addLog, updateLog, reset }
}
