import { describe, expect, it } from 'vitest'
import { createDemoDatabase } from '../app/composables/useDemoStore'

describe('demo database', () => {
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
