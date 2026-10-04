import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { webcrypto } from 'node:crypto'
import { useLocalAccounts } from '../app/composables/useLocalAccounts'
import { createDemoDatabase, useDemoStore } from '../app/composables/useDemoStore'
import { slugify } from '../app/utils/format'

beforeEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  const disk = window.localStorage
  vi.stubGlobal('localStorage', { getItem: disk.getItem.bind(disk), setItem: disk.setItem.bind(disk), removeItem: disk.removeItem.bind(disk), clear: disk.clear.bind(disk) })
  const states = new Map<string, ReturnType<typeof ref>>()
  localStorage.clear()
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('slugify', slugify)
  vi.stubGlobal('useState', (key: string, initial: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(initial()))
    return states.get(key)
  })
  vi.stubGlobal('useLocalAccounts', useLocalAccounts)
})

describe('local workshop accounts', () => {
  it('rolls back a quota failure and can retry without a phantom log', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const before = demo.getProject('gios-torino-restoration')!
    const original = localStorage.getItem('buildlog-demo-v5')
    const input = { projectId: before.project.id, phaseId: null, title: 'Quota test', workDate: '2026-10-04', durationMinutes: 20,
      summary: '', content: 'Keep form input', findingDecisions: [], imageRole: 'gallery' as const, images: [], itemUsage: [] }
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    expect(() => demo.addLog(input)).toThrow('storage is full')
    expect(demo.getProject('gios-torino-restoration')!.logs).toHaveLength(before.logs.length)
    expect(localStorage.getItem('buildlog-demo-v5')).toBe(original)
    write.mockRestore()
    demo.addLog(input)
    expect(demo.getProject('gios-torino-restoration')!.logs.filter(log => log.title === 'Quota test')).toHaveLength(1)
  })
  it('restores membership as well as content when demo project persistence fails', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const template = demo.getProject('gios-torino-restoration')!.project
    const members = JSON.stringify(accounts.state.value.members)
    const input = { name: 'Quota project', slug: 'quota-project', subtitle: null, description: null, startedStory: null, motivationStory: null, objectStory: null,
      isPublic: true, itemsEnabled: false, costsEnabled: false, currencyCode: 'EUR', theme: template.theme_config, currentPhaseIndex: 0, phases: ['Start'], heroImage: null }
    const set = localStorage.setItem
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'buildlog-demo-v5') throw new DOMException('Full', 'QuotaExceededError')
      set(key, value)
    })
    expect(() => demo.createProject(input)).toThrow('storage is full')
    expect(demo.getProject('quota-project')).toBeNull()
    expect(JSON.stringify(accounts.state.value.members)).toBe(members)
    write.mockRestore()
    demo.createProject(input)
    expect(demo.getProject('quota-project')).toBeTruthy()
  })
  it('allows an unused currency change but locks recorded allocations, including disabled ledgers', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const data = demo.getProject('gios-torino-restoration')!
    const project = data.project
    const input = { projectId: project.id, name: project.name, slug: project.slug, subtitle: project.subtitle, description: project.description,
      startedStory: project.started_story, motivationStory: project.motivation_story, objectStory: project.object_story, isCompleted: false,
      isPublic: true, itemsEnabled: true, costsEnabled: false, currencyCode: 'USD', theme: project.theme_config,
      currentPhaseKey: project.current_phase_id, phases: data.phases.map(phase => ({ key: phase.id, id: phase.id, name: phase.name, archived: false })), heroImage: null }
    demo.updateProject(input)
    expect(project.currency_code).toBe('USD')
    const bike = data.projectItems.find(entry => entry.id === 'gios-project-item-bike')!
    demo.editLedgerEntry(project.id, bike.id, { role: bike.role, status: bike.status, notes: bike.notes, attributed_amount: 0 })
    demo.updateProject({ ...input, itemsEnabled: false })
    expect(() => demo.updateProject({ ...input, itemsEnabled: false, currencyCode: 'EUR' })).toThrow('cannot change')
    expect(project.currency_code).toBe('USD')
  })
  it('upgrades existing flat demo notes without losing text or edit dates', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const saved = JSON.parse(JSON.stringify(createDemoDatabase()))
    saved.comments = [{ id: 'old-note', project_id: 'demo-gios', log_id: null, author_user_id: 'demo-user', author_display_name: 'Demo builder', content: 'Existing workshop note', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' }]
    localStorage.setItem('buildlog-demo-v5', JSON.stringify(saved))
    const demo = useDemoStore(); demo.initialize()
    const note = demo.socialEntries('demo-gios', null).comments[0]!
    expect(note).toMatchObject({ content: 'Existing workshop note', parent_id: null, thread_id: 'old-note', deleted_at: null, updated_at: '2026-10-01T10:00:00Z' })
    demo.saveComment('demo-gios', null, 'A new answer', undefined, note.id)
    expect(demo.socialEntries('demo-gios', null).comments.find(entry => entry.content === 'A new answer')?.thread_id).toBe('old-note')
  })
  it('groups replies by root, preserves answers after removal and rejects other targets', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    demo.saveComment('demo-gios', null, 'Original question')
    const root = demo.socialEntries('demo-gios', null).comments[0]!
    demo.saveComment('demo-gios', null, 'First answer', undefined, root.id)
    const reply = demo.socialEntries('demo-gios', null).comments.find(note => note.content === 'First answer')!
    demo.saveComment('demo-gios', null, 'A follow-up', undefined, reply.id)
    const followUp = demo.socialEntries('demo-gios', null).comments.find(note => note.content === 'A follow-up')!
    expect(reply.parent_id).toBe(root.id); expect(followUp.parent_id).toBe(reply.id)
    expect(followUp.thread_id).toBe(root.id)
    expect(() => demo.saveComment('demo-peugeot', null, 'Wrong build', undefined, root.id)).toThrow('same workshop')
    expect(() => demo.saveComment('demo-gios', 'gios-log-1', 'Wrong session', undefined, root.id)).toThrow('same workshop')
    demo.removeComment('demo-gios', null, root.id)
    expect(root.content).toBe(''); expect(root.deleted_at).toBeTruthy()
    expect(demo.socialEntries('demo-gios', null).comments.filter(note => note.thread_id === root.id && !note.deleted_at)).toHaveLength(2)
    expect(() => demo.saveComment('demo-gios', null, 'Restore', root.id)).toThrow('available')
    expect(() => demo.saveComment('demo-gios', null, 'Removed target', undefined, root.id)).toThrow('available')
    demo.saveComment('demo-gios', null, 'Reply in surviving conversation', undefined, reply.id)
    expect(demo.socialEntries('demo-gios', null).comments.filter(note => note.thread_id === root.id && !note.deleted_at)).toHaveLength(3)
  })
  it('keeps social access separate from editing and handles moderation and deletion', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    demo.saveComment('demo-gios', null, 'Owner note')
    await accounts.register('Bench reader', 'bench-reader@example.test', 'Workshop2026!')
    const readerId = accounts.current.value!.id
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    accounts.addMember('demo-gios', 'bench-reader@example.test', 'reader')
    await accounts.signIn('bench-reader@example.test', 'Workshop2026!')
    const ownerNote = demo.socialEntries('demo-gios', null).comments[0]!
    expect(accounts.canWrite('demo-gios')).toBe(false)
    expect(() => demo.saveComment('demo-gios', null, 'Changed', ownerNote.id)).toThrow('writer')
    expect(() => demo.removeComment('demo-gios', null, ownerNote.id)).toThrow('cannot remove')
    demo.saveComment('demo-gios', 'gios-log-1', 'A reader question')
    demo.setApproval('demo-gios', null, true); demo.setApproval('demo-gios', null, true)
    demo.setApproval('demo-gios', 'gios-log-1', true)
    expect(demo.socialEntries('demo-gios', null).approvals.filter(entry => entry.user_id === readerId)).toHaveLength(1)
    expect(demo.socialEntries('demo-gios', 'gios-log-1').approvals.filter(entry => entry.user_id === readerId)).toHaveLength(1)
    demo.setApproval('demo-gios', null, false)
    expect(demo.socialEntries('demo-gios', null).approvals.filter(entry => entry.user_id === readerId)).toHaveLength(0)
    expect(() => demo.saveComment('demo-gios', 'peugeot-log-1', 'Wrong project')).toThrow('unavailable')
    demo.deleteLocalAccount({}, false)
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    const retained = demo.socialEntries('demo-gios', 'gios-log-1').comments[0]!
    expect(retained.author_user_id).toBeNull()
    expect(retained.author_display_name).toBe('Former builder')
    expect(demo.socialEntries('demo-gios', 'gios-log-1').approvals.some(entry => entry.user_id === readerId)).toBe(false)
    demo.removeComment('demo-gios', 'gios-log-1', retained.id)
    expect(demo.socialEntries('demo-gios', 'gios-log-1').comments.filter(entry => entry.id === retained.id && !entry.deleted_at)).toHaveLength(0)
    demo.saveComment('demo-gios', 'gios-log-1', 'Log-only note'); demo.deleteLog('gios-log-1')
    expect(demo.socialEntries('demo-gios', null).comments.filter(entry => entry.id === ownerNote.id)).toHaveLength(1)
    expect(() => demo.socialEntries('demo-gios', 'gios-log-1')).toThrow('unavailable')
  })
  it('records purchases independently, reuses them in builds and preserves ownership', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const purchase = demo.createOwnedItem({ name: 'Workshop wrench', brand: null, notes: null, supplier: null, url: null, purchase_amount: 25, purchase_currency_code: 'EUR', estimated_amount: null, estimated_currency_code: null })
    expect(demo.workshopItems().items.some(item => item.id === purchase.id)).toBe(true)
    expect(demo.workshopItems().links.some(link => link.item_id === purchase.id)).toBe(false)
    demo.linkOwnedItem('demo-gios', purchase.id, 'tool', 'available')
    expect(demo.workshopItems().items.filter(item => item.id === purchase.id)).toHaveLength(1)
    expect(purchase.owner_user_id).toBe('demo-user')
    await accounts.register('Inventory outsider', 'inventory-outsider@example.test', 'Workshop2026!')
    expect(demo.workshopItems().items.some(item => item.id === purchase.id)).toBe(false)
    accounts.signOut()
    expect(() => demo.createOwnedItem({} as never)).toThrow('Sign in')
  })
  it('scopes workshop purchases to ownership and membership, excluding unrelated public builds', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const shared = demo.getProject('gios-torino-restoration')!
    const original = demo.workshopItems()
    expect(original.items.length).toBeGreaterThan(0)
    await accounts.register('Purchase reader', 'purchase-reader@example.test', 'Workshop2026!')
    expect(demo.workshopItems().items).toHaveLength(0)
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    accounts.addMember(shared.project.id, 'purchase-reader@example.test', 'reader')
    await accounts.signIn('purchase-reader@example.test', 'Workshop2026!')
    expect(demo.workshopItems().items.map(item => item.id).sort()).toEqual(shared.projectItems.map(link => link.item_id).sort())
    expect(() => demo.editOwnedItem(shared.projectItems[0]!.item.id, {} as never)).toThrow('owner')
  })
  it('copies project themes independently and keeps theme editing owner-only', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const first = demo.listProjects()[0]!
    const second = demo.listProjects()[1]!
    const originalSecond = JSON.stringify(second.theme_config)
    const config = JSON.parse(JSON.stringify(first.theme_config))
    config.typography.body = 'serif'
    demo.updateProjectTheme(first.id, config)
    config.colors.primary = '#ffffff'
    expect(demo.getProject(first.slug)!.project.theme_config.colors.primary).not.toBe('#ffffff')
    expect(demo.getProject(first.slug)!.project.theme_config.typography.body).toBe('serif')
    expect(JSON.stringify(second.theme_config)).toBe(originalSecond)
    await accounts.register('Theme reader', 'theme-reader@example.test', 'Workshop2026!')
    const readerId = accounts.current.value!.id
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    accounts.addMember(first.id, 'theme-reader@example.test', 'contributor')
    await accounts.signIn('theme-reader@example.test', 'Workshop2026!')
    expect(accounts.current.value!.id).toBe(readerId)
    expect(() => demo.updateProjectTheme(first.id, config)).toThrow('permission')
  })
  it('transfers ownership to a member and revokes the previous owner administration rights', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const project = demo.listProjects()[0]!
    await accounts.register('Successor', 'successor@example.test', 'Workshop2026!')
    const successor = accounts.current.value!.id
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    expect(() => accounts.transferOwnership(project.id, successor)).toThrow('member')
    accounts.addMember(project.id, 'successor@example.test', 'reader')
    accounts.transferOwnership(project.id, successor)
    expect(accounts.members(project.id).filter(member => member.role === 'owner')).toHaveLength(1)
    expect(accounts.role(project.id)).toBe('contributor')
    expect(() => accounts.transferOwnership(project.id, 'demo-user')).toThrow('permission')
    await accounts.signIn('successor@example.test', 'Workshop2026!')
    expect(accounts.role(project.id)).toBe('owner')
  })
  it('deletes a log and usage while retaining photos, cover and purchases', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const project = demo.getProject('gios-torino-restoration')!
    const target = project.logs[0]!
    const photos = project.images.filter(image => image.log_id === target.id)
    const purchases = demo.ownedItems().length
    demo.deleteLog(target.id)
    expect(demo.getProject(project.project.slug)?.logs.some(log => log.id === target.id)).toBe(false)
    expect(demo.listProjectLogUsage(project.project.id).some(usage => usage.log_id === target.id)).toBe(false)
    const retained = demo.getProject(project.project.slug)!
    for (const photo of photos) expect(retained.images.find(image => image.id === photo.id)?.log_id).toBeNull()
    expect(retained.project.hero_image_id).toBe(project.project.hero_image_id)
    expect(demo.ownedItems()).toHaveLength(purchases)
    await accounts.register('Outsider', 'log-outsider@example.test', 'Workshop2026!')
    expect(() => demo.deleteLog('demo-log-1')).toThrow('permission')
  })
  it('persists flexible specifications and protects private dossiers', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const project = demo.listProjects().find(entry => !entry.is_public) || demo.listProjects()[0]!
    const fact = { section: ' Roof ', label: ' Material ', value: ' Slate ', notes: ' Original ', source: 'Inspection', sort_order: 2 }
    demo.saveSpecification(project.id, null, fact)
    const saved = demo.listSpecifications(project.id)[0]!
    expect(saved).toMatchObject({ section: 'Roof', label: 'Material', value: 'Slate', sort_order: 2 })
    demo.saveSpecification(project.id, saved.id, { ...fact, value: 'Reclaimed slate' })
    expect(demo.listSpecifications(project.id)[0]?.value).toBe('Reclaimed slate')
    const persisted = JSON.parse(localStorage.getItem('buildlog-demo-v5')!)
    expect(persisted.specifications).toHaveLength(1)
    await accounts.register('Other', 'spec-reader@example.test', 'Workshop2026!')
    expect(() => demo.saveSpecification(project.id, saved.id, fact)).toThrow('permission')
    expect(() => demo.deleteSpecification(project.id, saved.id)).toThrow('permission')
    if (!project.is_public) expect(demo.listSpecifications(project.id)).toEqual([])
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    demo.deleteSpecification(project.id, saved.id)
    expect(demo.listSpecifications(project.id)).toEqual([])
  })
  it('reuses owned items, edits shared details and keeps removed entries and history', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const projects = demo.listProjects()
    const first = projects[0]!, second = projects[1]!
    const item = demo.addProjectItem({ projectId: first.id, name: 'Shared wrench', brand: null, role: 'tool', status: 'available', notes: null, purchaseAmount: 20, attributedAmount: null, currencyCode: 'EUR' })
    demo.linkOwnedItem(second.id, item.item.id, 'tool', 'planned')
    expect(() => demo.linkOwnedItem(second.id, item.item.id, 'tool', 'planned')).toThrow('already')
    demo.editOwnedItem(item.item.id, { name: 'Updated wrench', brand: 'Workshop', notes: 'Shared', supplier: null, url: null, purchase_amount: 25, purchase_currency_code: 'EUR', estimated_amount: null, estimated_currency_code: null })
    const linked = demo.listProjectItems(second.id).find(entry => entry.item_id === item.item.id)!
    expect(linked.item.name).toBe('Updated wrench')
    expect(demo.listProjectItems(first.id).find(entry => entry.id === item.id)?.item.purchase_amount).toBe(25)
    demo.editLedgerEntry(second.id, linked.id, { role: 'tool', status: 'removed', notes: 'Returned to shelf', attributed_amount: null })
    expect(demo.listProjectItems(second.id).find(entry => entry.id === linked.id)?.status).toBe('removed')
    expect(demo.listProjectItems(first.id).find(entry => entry.id === item.id)?.status).toBe('available')
    expect(demo.ownedItems().filter(entry => entry.id === item.item.id)).toHaveLength(1)
    await accounts.register('Another', 'other-item-owner@example.test', 'Workshop2026!')
    expect(() => demo.editOwnedItem(item.item.id, { ...item.item })).toThrow('owner')
    expect(() => demo.editLedgerEntry(first.id, item.id, { role: 'tool', status: 'removed', notes: null, attributed_amount: null })).toThrow('permission')
  })
  it('persists individual photo captions and roles when creating and editing a log', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    vi.stubGlobal('slugify', (value: string) => value.toLowerCase().replaceAll(' ', '-'))
    const input = { projectId: 'demo-gios', phaseId: null, title: 'Photo story', workDate: '2026-10-03', durationMinutes: null,
      summary: '', content: '', findingDecisions: [], imageRole: 'gallery' as const, itemUsage: [] }
    const log = demo.addLog({ ...input, images: [
      { name: 'one.jpg', type: 'image/jpeg', size: 1, dataUrl: 'data:image/jpeg;base64,YQ==', caption: ' Before repair ', role: 'damage' },
      { name: 'two.jpg', type: 'image/jpeg', size: 1, dataUrl: 'data:image/jpeg;base64,Yg==', caption: 'Finished', role: 'after' }
    ] })
    let saved = JSON.parse(localStorage.getItem('buildlog-demo-v5')!)
    const photos = saved.images.filter((image: { log_id: string }) => image.log_id === log.id)
    expect(photos.map((image: { caption: string; role: string }) => [image.caption, image.role])).toEqual([['Before repair', 'damage'], ['Finished', 'after']])
    demo.updateLog({ ...input, logId: log.id, newImages: [], removedImageIds: [photos[1].id], imageEdits: [{ id: photos[0].id, caption: 'Identifying the bearing', role: 'identification' }] })
    saved = JSON.parse(localStorage.getItem('buildlog-demo-v5')!)
    expect(saved.images.find((image: { id: string }) => image.id === photos[0].id)).toMatchObject({ caption: 'Identifying the bearing', role: 'identification' })
    expect(saved.images.find((image: { id: string }) => image.id === photos[1].id).deleted_at).toBeTruthy()
  })
  it('registers, rejects wrong passwords, recognizes exact emails and enforces roles', async () => {
    const accounts = useLocalAccounts()
    await Promise.all([accounts.initialize(), accounts.initialize()])
    expect(accounts.state.value.accounts).toHaveLength(1)
    accounts.ensureOwners(['project'])
    await accounts.register('Contributor', ' Person@Example.com ', 'TestPassword!')
    const person = accounts.current.value!
    expect(person.passwordHash).not.toBe('TestPassword!')
    accounts.signOut()
    await expect(accounts.signIn(person.email, 'wrong-password')).rejects.toThrow('incorrect')
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    accounts.addMember('project', 'PERSON@example.com', 'contributor')
    await accounts.signIn(person.email, 'TestPassword!')
    expect(accounts.canWrite('project')).toBe(true)
    expect(() => accounts.requireRole('project', true)).toThrow('permission')
    expect(() => accounts.addMember('project', 'third@example.com', 'reader')).toThrow('permission')
  })

  it('accepts unexpired invitations on registration and rejects duplicates', async () => {
    const accounts = useLocalAccounts()
    await accounts.initialize(); accounts.ensureOwners(['project'])
    accounts.addMember('project', 'reader@example.com', 'reader')
    expect(() => accounts.addMember('project', 'reader@example.com', 'reader')).toThrow('pending')
    await accounts.register('Reader', 'reader@example.com', 'TestPassword!')
    expect(accounts.role('project')).toBe('reader')
    expect(accounts.canWrite('project')).toBe(false)
    expect(accounts.state.value.invitations).toHaveLength(0)
  })

  it('keeps projects by transferring ownership and protects private projects after logout', async () => {
    const accounts = useLocalAccounts()
    await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const project = demo.listProjects()[0]!
    await accounts.register('Successor', 'next@example.com', 'TestPassword!')
    const successor = accounts.current.value!.id
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    expect(() => demo.deleteLocalAccount({}, false)).toThrow('new owner')
    const transfers = Object.fromEntries(demo.listProjects().map(project => [project.id, successor]))
    demo.deleteLocalAccount(transfers, false)
    expect(demo.listProjects()).toHaveLength(2)
    await accounts.signIn('next@example.com', 'TestPassword!')
    expect(accounts.role(project.id)).toBe('owner')
    const detail = demo.getProject(project.slug)!
    detail.project.is_public = false
    accounts.signOut()
    expect(demo.getProject(project.slug)).toBeNull()
    expect(demo.listProjects().some(entry => entry.id === project.id)).toBe(false)
  })

  it('deletes owned projects and related records when deleting the account', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    demo.deleteLocalAccount({}, true)
    expect(accounts.current.value).toBeNull()
    expect(accounts.state.value.members).toHaveLength(0)
    expect(demo.listProjects()).toHaveLength(0)
    expect(demo.listProjectItems('demo-gios')).toHaveLength(0)
    const saved = JSON.parse(localStorage.getItem('buildlog-demo-v5')!)
    expect(saved.logs).toHaveLength(0)
    expect(saved.images).toHaveLength(0)
    expect(saved.phases).toHaveLength(0)
    await expect(accounts.signIn('builder@buildlog.local', 'Workshop2026!')).rejects.toThrow('incorrect')
  })

  it('does not accept expired invitations and removes revoked access', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize(); accounts.ensureOwners(['project'])
    accounts.addMember('project', 'late@example.com', 'contributor')
    accounts.state.value.invitations[0]!.expiresAt = '2020-01-01T00:00:00Z'
    await accounts.register('Late', 'late@example.com', 'TestPassword!')
    const id = accounts.current.value!.id
    expect(accounts.role('project')).toBeNull()
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    accounts.addMember('project', 'late@example.com', 'reader')
    accounts.removeMember('project', id)
    await accounts.signIn('late@example.com', 'TestPassword!')
    expect(accounts.role('project')).toBeNull()
  })
})
