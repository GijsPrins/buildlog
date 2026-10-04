import { defaultProjectTheme } from './projectEditor'
import type { ThemeConfig } from '../types/domain'

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  phases: string[]
  specifications: Array<{ section: string; label: string }>
  theme: ThemeConfig
  itemsEnabled: boolean
  costsEnabled: boolean
}

export const bicycleRestorationTemplate: ProjectTemplate = {
  id: 'bicycle-restoration',
  name: 'Bicycle Restoration',
  description: 'Document the starting condition, restore what needs attention and record the first ride.',
  phases: ['Purchase', 'Inspection', 'Disassembly', 'Cleaning', 'Overhaul', 'Assembly', 'Tuning', 'Done'],
  specifications: [
    { section: 'Frame', label: 'Manufacturer' },
    { section: 'Frame', label: 'Model' },
    { section: 'Frame', label: 'Material' },
    { section: 'Frame', label: 'Serial number' },
    { section: 'Frame', label: 'Size' },
    { section: 'Headset', label: 'Manufacturer' },
    { section: 'Headset', label: 'Bearing size' },
    { section: 'Wheels', label: 'Rim size' },
    { section: 'Drivetrain', label: 'Gearing' }
  ],
  theme: defaultProjectTheme(),
  itemsEnabled: true,
  costsEnabled: false
}

export const projectTemplates = [bicycleRestorationTemplate]

// Each new project receives an independent snapshot, never a runtime link.
export function createProjectTemplateSnapshot(id: string | null) {
  const source = id === null ? {
    phases: ['Start'], theme: defaultProjectTheme(), itemsEnabled: false, costsEnabled: false,
    specifications: []
  } : projectTemplates.find(template => template.id === id)
  if (!source) throw new Error('Unknown project template.')
  return JSON.parse(JSON.stringify(source)) as Pick<ProjectTemplate, 'phases' | 'theme' | 'itemsEnabled' | 'costsEnabled' | 'specifications'>
}
