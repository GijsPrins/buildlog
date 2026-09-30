import type { ThemeConfig } from '~/types/domain'

export interface ProjectEditorPhase {
  key: string
  id: string | null
  name: string
  archived: boolean
}

export const projectThemePresets: Array<{ name: string; label: string; config: ThemeConfig }> = [
  { name: 'workshop', label: 'Workshop green', config: { schemaVersion: 1, preset: 'workshop', colors: { background: '#f3f0e9', surface: '#fffdf8', text: '#18211e', muted: '#63706b', primary: '#123f36', secondary: '#596b8c', accent: '#e27143', border: '#d8d6ce' }, typography: { heading: 'serif', body: 'sans', technical: 'mono' }, shape: { radius: 'small', shadow: 'subtle' }, decoration: { texture: 'grid', imageFrame: 'bordered' } } },
  { name: 'italian-racer', label: 'Italian racer', config: { schemaVersion: 1, preset: 'italian-racer', colors: { background: '#eee9dc', surface: '#fffaf0', text: '#201c19', muted: '#75675f', primary: '#6e2630', secondary: '#26352b', accent: '#08754f', border: '#cbbda9' }, typography: { heading: 'serif', body: 'sans', technical: 'mono' }, shape: { radius: 'none', shadow: 'subtle' }, decoration: { texture: 'paper', imageFrame: 'print' } } },
  { name: 'retro-sprint', label: 'Retro sprint', config: { schemaVersion: 1, preset: 'retro-sprint', colors: { background: '#eaf1ed', surface: '#fbfaf4', text: '#172b2d', muted: '#687678', primary: '#007d7c', secondary: '#714395', accent: '#e83e88', border: '#b9cec7' }, typography: { heading: 'serif', body: 'sans', technical: 'mono' }, shape: { radius: 'small', shadow: 'subtle' }, decoration: { texture: 'grid', imageFrame: 'print' } } }
]

export function copyTheme(config: ThemeConfig) {
  return JSON.parse(JSON.stringify(config)) as ThemeConfig
}

export function defaultProjectTheme() {
  return copyTheme(projectThemePresets[0]!.config)
}
