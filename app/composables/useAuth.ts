import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const liveUser = useState<User | null>('auth-user', () => null)
  const local = useLocalAccounts()
  const user = computed(() => useDemoMode().value ? (local.current.value ? { id: local.current.value.id, email: local.current.value.email, user_metadata: { display_name: local.current.value.name } } : null) : liveUser.value)
  const ready = useState<boolean>('auth-ready', () => false)
  const listenerBound = useState<boolean>('auth-listener-bound', () => false)

  async function initialize() {
    if (ready.value) return

    if (useDemoMode().value) { await local.initialize(); ready.value = true; return }
    const supabase = useSupabase()
    if (!supabase) {
      ready.value = true
      return
    }

    const { data } = await supabase.auth.getUser()
    liveUser.value = data.user
    ready.value = true

    if (import.meta.client && !listenerBound.value) {
      listenerBound.value = true
      supabase.auth.onAuthStateChange((_event, session) => {
        liveUser.value = session?.user ?? null
        ready.value = true
      })
    }
  }

  async function signOut() {
    if (useDemoMode().value) { local.signOut(); await navigateTo('/'); return }
    const supabase = useSupabase()
    if (!supabase) return
    await supabase.auth.signOut()
    liveUser.value = null
    await navigateTo('/')
  }

  return { user, ready, initialize, signOut }
}
