export default defineNuxtRouteMiddleware(async to => {
  if (import.meta.server) return

  if (!useSupabaseConfigured()) {
    const accounts = useLocalAccounts()
    await accounts.initialize()
    useDemoStore().initialize()
    if (!accounts.current.value) return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
    return
  }

  const supabase = useSupabase()
  if (!supabase) {
    return navigateTo('/login?setup=required')
  }

  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    const redirect = encodeURIComponent(to.fullPath)
    return navigateTo(`/login?redirect=${redirect}`)
  }
})
