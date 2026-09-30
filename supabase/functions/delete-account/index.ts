import { createClient } from 'npm:@supabase/supabase-js@2.117.2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
  try {
    const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if (!token) return reply({ error: 'Sign in first.' }, 401)
    const url = Deno.env.get('SUPABASE_URL')!
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    const secret = keys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!secret) throw new Error('Server account management is not configured.')
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
    // Never trust a client-supplied user ID or decoded JWT without verification.
    const { data: { user }, error: userError } = await admin.auth.getUser(token)
    if (userError || !user) return reply({ error: 'Your session expired. Sign in again.' }, 401)
    if (!user.last_sign_in_at || Date.now() - Date.parse(user.last_sign_in_at) > 15 * 60 * 1000) return reply({ error: 'Sign in again before deleting your account.' }, 401)
    const input = await req.json()
    if (input.confirmation !== user.email || typeof input.deleteProjects !== 'boolean' || !input.transfers || typeof input.transfers !== 'object' || Array.isArray(input.transfers)) return reply({ error: 'Confirm your email and choose what to do with your projects.' }, 400)
    const { data: paths, error } = await admin.rpc('prepare_account_deletion', { p_user_id: user.id, p_delete_projects: input.deleteProjects, p_transfers: input.transfers })
    if (error) return reply({ error: error.message }, 400)
    for (let i = 0; i < paths.length; i += 100) {
      const { error: storageError } = await admin.storage.from('project-originals').remove(paths.slice(i, i + 100))
      if (storageError) throw storageError
    }
    const { error: signOutError } = await admin.auth.admin.signOut(token, 'global')
    if (signOutError) throw signOutError
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError
    await admin.rpc('complete_account_deletion', { p_user_id: user.id })
    return reply({ success: true })
  } catch (error) {
    // Preparation is transactional; Storage/Auth failures can safely be retried.
    return reply({ error: error instanceof Error ? error.message : 'Account deletion could not finish. Sign in and retry.' }, 500)
  }
})
