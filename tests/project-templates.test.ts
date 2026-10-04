import { describe, expect, it } from 'vitest'
import { bicycleRestorationTemplate, createProjectTemplateSnapshot } from '../app/utils/projectTemplates'

describe('project template snapshots', () => {
  it('copies phases, facts and theme so later edits cannot affect other builds or the template', () => {
    const first = createProjectTemplateSnapshot('bicycle-restoration')
    const second = createProjectTemplateSnapshot('bicycle-restoration')
    first.phases[0] = 'Find the frame'
    first.theme.colors.primary = '#ffffff'
    first.specifications[0]!.label = 'Builder'
    expect(second.phases).toEqual(bicycleRestorationTemplate.phases)
    expect(second.theme.colors.primary).not.toBe('#ffffff')
    expect(second.specifications[0]!.label).toBe('Manufacturer')
    expect(first.itemsEnabled).toBe(true)
  })
  it('allows generic projects without bicycle phases or fields and rejects unknown templates', () => {
    const blank = createProjectTemplateSnapshot(null)
    expect(blank.phases).toEqual(['Start'])
    expect(blank.specifications).toEqual([])
    expect(() => createProjectTemplateSnapshot('unknown')).toThrow('Unknown project template')
  })
})
