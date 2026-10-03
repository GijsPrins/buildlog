export default defineNuxtPlugin(() => {
  const supabase = useSupabase()
  if (!supabase) return
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      // Leave the auth callback before navigating or making more auth requests.
      setTimeout(() => { void navigateTo('/reset-password') }, 0)
    }
  })
})
