import type { ThemeConfig } from '../types/domain'

export const themeColorLabels = { background: 'Paper', surface: 'Surface', text: 'Ink', muted: 'Notes', primary: 'Primary', secondary: 'Secondary', accent: 'Accent', border: 'Borders' } as const

export function validateTheme(config: ThemeConfig): string | null {
  if (config.schemaVersion !== 1 || !config.preset || config.preset.length > 120) return 'Invalid theme version or identifier.'
  if (Object.keys(themeColorLabels).some(key => !/^#[0-9a-f]{6}$/i.test(config.colors?.[key as keyof ThemeConfig['colors']] || ''))) return 'Use six-digit hex colours, such as #123f36.'
  if (!['serif', 'sans'].includes(config.typography?.heading) || config.typography?.body !== 'sans' || config.typography?.technical !== 'mono') return 'Choose a supported typeface.'
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
