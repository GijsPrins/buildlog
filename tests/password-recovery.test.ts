import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules() })

describe('password recovery redirects', () => {
  it('handles recovery on any landing page outside the auth callback', async () => {
    vi.useFakeTimers()
    let callback: (event: string) => void = () => {}
    const navigate = vi.fn()
    vi.stubGlobal('defineNuxtPlugin', (plugin: () => void) => plugin)
    vi.stubGlobal('navigateTo', navigate)
    vi.stubGlobal('useSupabase', () => ({ auth: { onAuthStateChange: (fn: typeof callback) => { callback = fn } } }))
    const plugin = (await import('../app/plugins/password-recovery.client')).default
    plugin()
    callback('SIGNED_IN')
    await vi.runAllTimersAsync()
    expect(navigate).not.toHaveBeenCalled()
    callback('PASSWORD_RECOVERY')
    expect(navigate).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(navigate).toHaveBeenCalledWith('/reset-password')
  })

  it('does not require Supabase in demo mode', async () => {
    vi.stubGlobal('defineNuxtPlugin', (plugin: () => void) => plugin)
    vi.stubGlobal('useSupabase', () => null)
    const plugin = (await import('../app/plugins/password-recovery.client')).default
    expect(() => plugin()).not.toThrow()
  })
})
