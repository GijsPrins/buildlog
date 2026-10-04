import type { ProjectSpec } from '~/types/domain'

// Optional template suggestions; saved specifications are owned by the project.
export const bicycleSpecSuggestions = [
  { section: 'Frame', label: 'Manufacturer' },
  { section: 'Frame', label: 'Model' },
  { section: 'Frame', label: 'Material' },
  { section: 'Frame', label: 'Serial number' },
  { section: 'Frame', label: 'Size' },
  { section: 'Headset', label: 'Manufacturer' },
  { section: 'Headset', label: 'Bearing size' },
  { section: 'Wheels', label: 'Rim size' },
  { section: 'Drivetrain', label: 'Gearing' }
]

export function normalizeSpecification(input: Omit<ProjectSpec, 'id' | 'project_id'>) {
  const result = { ...input, section: input.section.trim(), label: input.label.trim(), value: input.value.trim(), notes: input.notes?.trim() || null, source: input.source?.trim() || null }
  if (!result.section || result.section.length > 120) throw new Error('Enter a section of 1–120 characters.')
  if (!result.label || result.label.length > 160) throw new Error('Enter a label of 1–160 characters.')
  if (!result.value) throw new Error('Enter a value for this specification.')
  if (!Number.isInteger(result.sort_order) || result.sort_order < 0) throw new Error('Order must be a non-negative whole number.')
  return result
}
