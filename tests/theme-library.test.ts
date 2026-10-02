import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useThemeLibrary } from '../app/composables/useThemeLibrary'
import { defaultProjectTheme } from '../app/utils/projectEditor'

const user = ref<{ id: string } | null>({ id: 'theme-owner' })
beforeEach(() => {
  localStorage.clear(); user.value = { id: 'theme-owner' }
  vi.stubGlobal('ref',ref)
  vi.stubGlobal('useAuth',() => ({ user, initialize: async () => {} }))
  vi.stubGlobal('useDemoMode',() => ref(true))
})
describe('local theme library', () => {
  it('saves, reloads, edits and deletes a theme', async () => {
    const library = useThemeLibrary()
    const id = await library.save(null,'  My palette  ',defaultProjectTheme())
    expect(library.themes.value[0]?.name).toBe('My palette')
    expect(library.themes.value[0]?.config.preset).toBe(`custom-${id}`)
    const reloaded = useThemeLibrary(); await reloaded.load()
    expect(reloaded.themes.value).toHaveLength(1)
    await reloaded.save(id,'Updated palette',defaultProjectTheme())
    expect(reloaded.themes.value).toHaveLength(1)
    expect(reloaded.themes.value[0]?.name).toBe('Updated palette')
    await reloaded.remove(id); expect(reloaded.themes.value).toHaveLength(0)
  })
  it('isolates accounts and retains independent project snapshots', async () => {
    const library = useThemeLibrary(); const projectTheme = defaultProjectTheme()
    const id = await library.save(null,'Palette',projectTheme)
    expect(projectTheme.preset).toBe('workshop')
    library.themes.value[0]!.config.colors.primary = '#ffffff'
    expect(projectTheme.colors.primary).toBe('#123f36')
    user.value = { id: 'other-account' }; await library.load()
    expect(library.themes.value).toHaveLength(0)
    user.value = { id: 'theme-owner' }; await library.load()
    expect(library.themes.value[0]?.id).toBe(id)
  })
  it('rejects unnamed palettes and signed-out saves', async () => {
    const library = useThemeLibrary()
    await expect(library.save(null,' ',defaultProjectTheme())).rejects.toThrow('name')
    user.value = null
    await expect(library.save(null,'Palette',defaultProjectTheme())).rejects.toThrow('Sign in')
  })
  it('copies another builders project theme into an independent personal palette', async () => {
    const original = defaultProjectTheme()
    original.preset = 'custom-another-builder'
    const snapshot = JSON.stringify(original)
    user.value = { id: 'inspired-builder' }
    const library = useThemeLibrary()
    const id = await library.save(null,'Inspired by the Gios',original)
    expect(library.themes.value[0]?.config.colors).toEqual(original.colors)
    expect(library.themes.value[0]?.config.preset).toBe(`custom-${id}`)
    expect(JSON.stringify(original)).toBe(snapshot)
    const changed = structuredClone(original); changed.colors.primary = '#ffffff'
    await library.save(id,'My own version',changed)
    expect(original.colors.primary).toBe('#123f36')
    user.value = { id: 'theme-owner' }; await library.load()
    expect(library.themes.value).toHaveLength(0)
  })
})
