import type { ThemeConfig } from '../types/domain'

export const themeColorLabels = { background: 'Paper', surface: 'Surface', text: 'Ink', muted: 'Notes', primary: 'Primary', secondary: 'Secondary', accent: 'Accent', border: 'Borders' } as const

export function themeFont(value: string) {
  return value === 'serif' ? 'Georgia, "Times New Roman", serif' : 'Inter, Arial, sans-serif'
}

export function projectThemeStyle(theme?: ThemeConfig) {
  if (!theme) return {}
  return {
    ...Object.fromEntries(Object.entries(theme.colors).map(([key, value]) => [`--project-${key}`, value])),
    '--paper': theme.colors.background,
    '--surface': theme.colors.surface,
    '--ink': theme.colors.text,
    '--muted': theme.colors.muted,
    '--line': theme.colors.border,
    '--primary': theme.colors.primary,
    '--primary-bright': theme.colors.primary,
    '--accent': theme.colors.accent,
    '--project-heading': themeFont(theme.typography.heading),
    '--project-body': themeFont(theme.typography.body),
    '--project-radius': { none: '0px', small: '4px', medium: '14px' }[theme.shape.radius],
    '--project-shadow': theme.shape.shadow === 'subtle' ? '8px 8px 0 #00000014' : 'none',
    '--project-on-primary': '#ffffff'
  }
}

export function validateTheme(config: ThemeConfig): string | null {
  if (config.schemaVersion !== 1 || !config.preset || config.preset.length > 120) return 'Invalid theme version or identifier.'
  if (Object.keys(themeColorLabels).some(key => !/^#[0-9a-f]{6}$/i.test(config.colors?.[key as keyof ThemeConfig['colors']] || ''))) return 'Use six-digit hex colours, such as #123f36.'
  if (!['serif', 'sans'].includes(config.typography?.heading) || !['serif', 'sans'].includes(config.typography?.body) || config.typography?.technical !== 'mono') return 'Choose a supported typeface.'
  if (!['none', 'small', 'medium'].includes(config.shape?.radius) || !['none', 'subtle'].includes(config.shape?.shadow)) return 'Choose a supported shape.'
  if (!['none', 'grid', 'paper'].includes(config.decoration?.texture) || !['none', 'bordered', 'print'].includes(config.decoration?.imageFrame)) return 'Choose a supported decoration.'
  return null
}

export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722
  }
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
}
