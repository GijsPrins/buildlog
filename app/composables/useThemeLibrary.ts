import type { ThemeConfig } from '~/types/domain'
import { copyTheme } from '../utils/projectEditor'
import { collectPages } from '../utils/workshopFinancials'
import { validateTheme } from '../utils/themes'

export interface SavedTheme { id: string; name: string; config: ThemeConfig }
export function useThemeLibrary() {
  const themes = ref<SavedTheme[]>([])
  const { user, initialize } = useAuth()
  const demo = useDemoMode()
  const key = () => `buildlog-themes-v1:${user.value?.id}`
  async function load() {
    await initialize()
    themes.value = []
    if (!user.value) return
    if (demo.value) {
      const saved = localStorage.getItem(key())
      themes.value = saved ? JSON.parse(saved) : []
    } else {
      themes.value = await collectPages<SavedTheme>((from, to) => useSupabase()!.from('user_themes').select('id,name,config', { count: 'exact' }).order('name').order('id').range(from, to))
    }
  }
  async function save(id: string | null, name: string, config: ThemeConfig) {
    if (!user.value) throw new Error('Sign in first.')
    if (!name.trim() || name.trim().length > 80) throw new Error('Give this theme a name (up to 80 characters).')
    const invalid = validateTheme(config)
    if (invalid) throw new Error(invalid)
    const themeId = id || crypto.randomUUID()
    const entry = { id: themeId, name: name.trim(), config: copyTheme(config) }
    entry.config.preset = `custom-${themeId}`
    if (demo.value) {
      themes.value = [...themes.value.filter(t => t.id !== themeId), entry]
      localStorage.setItem(key(), JSON.stringify(themes.value))
    } else {
      const request = id
        ? useSupabase()!.from('user_themes').update({ name: entry.name, config: entry.config }).eq('id', id)
        : useSupabase()!.from('user_themes').insert({ ...entry, user_id: user.value.id })
      const { data, error } = await request.select('id').single()
      if (error || !data) throw new Error(error?.message || 'Theme could not be saved.')
    }
    await load()
    return themeId
  }
  async function remove(id: string) {
    if (demo.value) {
      themes.value = themes.value.filter(t => t.id !== id)
      localStorage.setItem(key(), JSON.stringify(themes.value))
    } else {
      const { error } = await useSupabase()!.from('user_themes').delete().eq('id', id)
      if (error) throw new Error(error.message)
    }
    await load()
  }
  return { themes, load, save, remove }
}
