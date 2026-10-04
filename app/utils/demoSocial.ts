import type { WorkshopApproval, WorkshopComment } from './workshopSocial'

interface DemoSocialStore {
  socialSeedVersion?: number
  projects: Array<{ id: string }>
  logs: Array<{ id: string; project_id: string }>
  comments?: WorkshopComment[]
  approvals?: WorkshopApproval[]
}

// These fictional builders are demo-only identities, not registered accounts.
export function createDemoSocial() {
  const comments: WorkshopComment[] = []
  const note = (id: string, project: string, log: string | null, author: string, content: string, date: string, parentId: string | null = null) => {
    const parent = comments.find(entry => entry.id === parentId)
    comments.push({ id, project_id: project, log_id: log, parent_id: parentId, thread_id: parent?.thread_id ?? id, deleted_at: null, author_user_id: `demo-visitor-${author.toLowerCase()}`, author_display_name: author, content, created_at: date, updated_at: date })
  }
  note('demo-social-peugeot-colours', 'demo-peugeot', null, 'Nora', 'Turquoise and purple is such a good combination. Will you keep the purple bar tape?', '2026-09-22T09:00:00Z')
  note('demo-social-peugeot-tape', 'demo-peugeot', null, 'Alex', 'Definitely keep that colour story! Fresh purple tape would look great with the original graphics.', '2026-09-22T10:15:00Z', 'demo-social-peugeot-colours')
  note('demo-social-peugeot-cables', 'demo-peugeot', null, 'Nora', 'Agreed. White cables again would finish it off nicely.', '2026-09-22T11:00:00Z', 'demo-social-peugeot-tape')
  note('demo-social-gios-patina', 'demo-gios', null, 'Sam', 'Love the plan to preserve the patina. Those little marks are part of its story.', '2026-09-29T08:30:00Z')
  note('demo-social-gios-riding', 'demo-gios', null, 'Nora', 'Exactly. A bike that is ready for another ride is better than one that never leaves the display stand.', '2026-09-29T09:20:00Z', 'demo-social-gios-patina')
  note('demo-social-clean-polish', 'demo-peugeot', 'demo-log-3', 'Alex', 'The turquoise really came back! What did you use on the paint?', '2026-09-22T12:00:00Z')
  note('demo-social-clean-advice', 'demo-peugeot', 'demo-log-3', 'Sam', 'I would start with mild soap and a soft cloth, then test any polish on a hidden spot. Old decals can be fragile.', '2026-09-22T12:40:00Z', 'demo-social-clean-polish')
  note('demo-social-strip-bags', 'demo-peugeot', 'demo-log-2', 'Nora', 'Photographing the spacer order is such a useful habit. Future you will thank you during reassembly.', '2026-09-15T08:00:00Z')
  note('demo-social-strip-tray', 'demo-peugeot', 'demo-log-2', 'Alex', 'A labelled tray for each assembly helps too. Learned that one after losing a tiny washer!', '2026-09-15T09:00:00Z', 'demo-social-strip-bags')
  note('demo-social-first-safety', 'demo-peugeot', 'demo-log-1', 'Sam', 'Good call replacing the tyres and brake pads. It looks like a lovely foundation for a daily rider.', '2026-09-08T10:00:00Z')
  note('demo-social-gios-markings', 'demo-gios', 'gios-log-1', 'Alex', 'Have you found any markings on the bottom bracket shell? A close-up might help narrow down the year.', '2026-09-29T10:00:00Z')
  note('demo-social-gios-reference', 'demo-gios', 'gios-log-1', 'Sam', 'Worth photographing the dropout markings as well. Nice to keep those clues in the project dossier.', '2026-09-29T10:35:00Z', 'demo-social-gios-markings')

  const approvals: WorkshopApproval[] = []
  for (const [project, log, count] of [
    ['demo-peugeot', null, 5], ['demo-gios', null, 4],
    ['demo-peugeot', 'demo-log-1', 3], ['demo-peugeot', 'demo-log-2', 2],
    ['demo-peugeot', 'demo-log-3', 4], ['demo-gios', 'gios-log-1', 3]
  ] as const) {
    for (const author of ['nora', 'alex', 'sam', 'robin', 'jules'].slice(0, count)) {
      approvals.push({ id: `demo-stamp-${project}-${log ?? 'project'}-${author}`, project_id: project, log_id: log, user_id: `demo-visitor-${author}` })
    }
  }
  return { comments, approvals, socialSeedVersion: 1 }
}

export function seedDemoSocial(store: DemoSocialStore): boolean {
  if ((store.socialSeedVersion ?? 0) >= 1) return false
  store.comments ??= []
  store.approvals ??= []
  const available = (entry: { project_id: string; log_id: string | null }) =>
    store.projects.some(project => project.id === entry.project_id)
    && (!entry.log_id || store.logs.some(log => log.id === entry.log_id && log.project_id === entry.project_id))
  const sample = createDemoSocial()
  for (const note of sample.comments) {
    if (available(note) && !store.comments.some(entry => entry.id === note.id)
      && (!note.parent_id || store.comments.some(entry => entry.id === note.parent_id))) store.comments.push(note)
  }
  for (const stamp of sample.approvals) {
    if (available(stamp) && !store.approvals.some(entry => entry.id === stamp.id
      || (entry.project_id === stamp.project_id && entry.log_id === stamp.log_id && entry.user_id === stamp.user_id))) store.approvals.push(stamp)
  }
  // Persist this marker so removed examples never reappear on the next visit.
  store.socialSeedVersion = sample.socialSeedVersion
  return true
}
