import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | null = null

export function useSupabase(): SupabaseClient | null {
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl
  const key = config.public.supabasePublishableKey

  if (!url || !key) return null

  if (import.meta.server) {
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    })
  }

  browserClient ??= createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  })

  return browserClient
}

export function useSupabaseConfigured(): boolean {
  const config = useRuntimeConfig()
  return Boolean(config.public.supabaseUrl && config.public.supabasePublishableKey)
}
