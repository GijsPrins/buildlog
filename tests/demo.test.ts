import { describe, expect, it } from 'vitest'
import { createDemoDatabase } from '../app/composables/useDemoStore'
import { seedDemoSocial } from '../app/utils/demoSocial'

describe('demo database', () => {
  it('shows conversations, nested answers and stamps on both projects and every session', () => {
    const demo = createDemoDatabase()
    for (const target of [...demo.projects.map(project => ({ project_id: project.id, log_id: null })), ...demo.logs.map(log => ({ project_id: log.project_id, log_id: log.id }))]) {
      expect(demo.comments!.some(note => note.project_id === target.project_id && note.log_id === target.log_id)).toBe(true)
      expect(demo.approvals!.some(stamp => stamp.project_id === target.project_id && stamp.log_id === target.log_id)).toBe(true)
    }
    for (const note of demo.comments!) {
      expect(demo.projects.some(project => project.id === note.project_id)).toBe(true)
      if (note.log_id) expect(demo.logs.some(log => log.id === note.log_id && log.project_id === note.project_id)).toBe(true)
      if (note.parent_id) {
        const parent = demo.comments!.find(entry => entry.id === note.parent_id)!
        expect(parent).toMatchObject({ project_id: note.project_id, log_id: note.log_id, thread_id: note.thread_id })
        expect(parent.created_at < note.created_at).toBe(true)
      } else expect(note.thread_id).toBe(note.id)
    }
    expect(demo.comments!.some(note => demo.comments!.find(parent => parent.id === note.parent_id)?.parent_id)).toBe(true)
    const stampKeys = demo.approvals!.map(stamp => `${stamp.project_id}/${stamp.log_id}/${stamp.user_id}`)
    expect(new Set(stampKeys).size).toBe(stampKeys.length)
    expect(demo.approvals!.some(stamp => stamp.user_id === 'demo-user')).toBe(false)
  })

  it('upgrades saved demos once while preserving edits and respecting deleted targets', () => {
    const demo = createDemoDatabase()
    delete demo.socialSeedVersion
    const custom = { ...demo.comments![0]!, id: 'my-note', thread_id: 'my-note', content: 'My existing note' }
    demo.comments = [custom]
    demo.approvals = []
    demo.projects = demo.projects.filter(project => project.id !== 'demo-peugeot')
    demo.logs = []
    expect(seedDemoSocial(demo)).toBe(true)
    expect(demo.comments).toContain(custom)
    expect(demo.comments!.filter(note => note.id !== custom.id).every(note => note.project_id === 'demo-gios' && note.log_id === null)).toBe(true)
    expect(demo.approvals!.every(stamp => stamp.project_id === 'demo-gios' && stamp.log_id === null)).toBe(true)
    demo.comments = [custom]
    demo.approvals = []
    const reloaded = JSON.parse(JSON.stringify(demo))
    expect(seedDemoSocial(reloaded)).toBe(false)
    expect(reloaded.comments).toEqual([custom])
    expect(reloaded.approvals).toEqual([])
  })

  it('contains a complete project timeline', () => {
    const demo = createDemoDatabase()
    const project = demo.projects.find(entry => entry.slug === 'peugeot-road-bike')

    expect(project?.slug).toBe('peugeot-road-bike')
    expect(demo.phases.filter(phase => phase.project_id === project?.id)).toHaveLength(8)
    expect(demo.logs.filter(log => log.project_id === project?.id)).toHaveLength(3)
    expect(demo.images.every(image => image.upload_status === 'ready')).toBe(true)
    expect(project?.started_story).toContain('marketplace advert')
    expect(project?.motivation_story).toContain('nineties character')
    expect(project?.object_story).toContain('working bicycle')
  })

  it('keeps bill of materials and costs optional', () => {
    const demo = createDemoDatabase()

    const project = demo.projects.find(entry => entry.slug === 'peugeot-road-bike')
    expect(project?.items_enabled).toBe(false)
    expect(project?.cost_tracking_enabled).toBe(false)
  })

  it('uses a distinct image-derived theme for the Gios project', () => {
    const demo = createDemoDatabase()
    const gios = demo.projects.find(project => project.slug === 'gios-torino-restoration')

    expect(gios?.theme_config.preset).toBe('italian-racer')
    expect(gios?.theme_config.colors.primary).toBe('#6e2630')
    expect(demo.images.find(image => image.id === gios?.hero_image_id)?.storage_path).toBe('/demo/gios-start.jpeg')
    expect(gios?.items_enabled).toBe(true)
    expect(demo.projectItems.filter(item => item.project_id === gios?.id)).toHaveLength(4)
    expect(demo.items.find(item => item.id === 'gios-item-cables')?.name).toContain('cable')
    expect(demo.logItemUsage.find(usage => usage.log_id === 'gios-log-1')?.project_item_id).toBe('gios-project-item-grease')
  })

  it('uses the real Peugeot photos and their retro colour story', () => {
    const demo = createDemoDatabase()
    const peugeot = demo.projects.find(project => project.slug === 'peugeot-road-bike')
    const photos = demo.images.filter(image => image.project_id === peugeot?.id)

    expect(peugeot?.theme_config.preset).toBe('retro-sprint')
    expect(peugeot?.theme_config.colors.secondary).toBe('#714395')
    expect(photos).toHaveLength(4)
    expect(photos.find(image => image.id === peugeot?.hero_image_id)?.storage_path).toBe('/demo/peugeot-start.png')
  })
})
