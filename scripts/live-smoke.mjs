// Explicit opt-in only. Uses two disposable, verified QA accounts, never a real builder account.
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const { NUXT_PUBLIC_SUPABASE_URL: url, NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, QA_OWNER_EMAIL: ownerEmail, QA_MEMBER_EMAIL: memberEmail, QA_PASSWORD: password } = process.env
assert(url && key && ownerEmail?.startsWith('qa-owner-') && memberEmail?.startsWith('qa-member-') && password, 'Provide dedicated QA credentials explicitly.')
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const owner = client(), member = client(), anon = client()
const unwrap = async promise => { const { data, error } = await promise; if (error) throw new Error(error.message); return data }
const login = (api, email) => unwrap(api.auth.signInWithPassword({ email, password }))
async function remove(api, email, deleteProjects, transfers = {}) {
  const { data, error } = await api.functions.invoke('delete-account', { body: { confirmation: email, deleteProjects, transfers } })
  if (error) {
    let detail = error.message
    if (error.context instanceof Response) { try { detail = (await error.context.json()).error || detail } catch {} }
    throw new Error(detail)
  }
  assert.equal(data.success, true)
}
let ownerDeleted = false, memberDeleted = false
try {
  const ownerAuth = await login(owner, ownerEmail)
  const memberAuth = await login(member, memberEmail)
  console.log('PASS: real Auth sign-in and session validation')
  const { error: anonymousDelete } = await anon.functions.invoke('delete-account', { body: {} })
  assert(anonymousDelete, 'Unauthenticated deletion must fail')
  const theme = { schemaVersion: 1, preset: 'minimal', colors: { background: '#f7f7f5', surface: '#ffffff', text: '#181817', muted: '#6b6b66', primary: '#2f6f62', secondary: '#596b8c', accent: '#cc6b49', border: '#d9d9d4' }, typography: { heading: 'sans', body: 'sans', technical: 'mono' }, shape: { radius: 'small', shadow: 'subtle' }, decoration: { texture: 'none', imageFrame: 'none' } }
  const projectId = await unwrap(owner.rpc('create_project', { p_slug: `qa-api-${Date.now()}`, p_name: 'Disposable API test', p_subtitle: null, p_description: null, p_is_public: false, p_currency_code: 'EUR', p_items_enabled: true, p_cost_tracking_enabled: true, p_theme_config: theme, p_phases: [{ name: 'Inspection', sortOrder: 0 }] }))
  await unwrap(owner.from('projects').update({ started_story: 'QA story', motivation_story: 'API test', theme_config: theme }).eq('id', projectId))
  assert.equal((await unwrap(anon.from('projects').select('id').eq('id', projectId))).length, 0)
  await unwrap(owner.rpc('workshop_members', { p_project_id: projectId, p_action: 'add', p_email: memberEmail, p_role: 'contributor' }))
  const { error: denied } = await member.rpc('workshop_members', { p_project_id: projectId })
  assert(denied)
  console.log('PASS: project creation, stories, owner-only membership and private isolation')
  const image = await unwrap(owner.from('project_images').insert({ project_id: projectId, uploaded_by_user_id: ownerAuth.user.id, original_file_name: 'qa.png', media_type: 'image/png', byte_size: 68, role: 'before' }).select('id,storage_path').single())
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64')
  await unwrap(owner.storage.from('project-originals').upload(image.storage_path, pixel, { contentType: 'image/png' }))
  await unwrap(owner.from('project_images').update({ upload_status: 'ready' }).eq('id', image.id))
  await unwrap(owner.from('projects').update({ hero_image_id: image.id }).eq('id', projectId))
  const signed = await unwrap(member.storage.from('project-originals').createSignedUrl(image.storage_path, 60))
  assert.equal((await fetch(signed.signedUrl)).status, 200)
  console.log('PASS: original photo upload, finalization and contributor signed download')
  const log = await unwrap(member.from('logs').insert({ project_id: projectId, title: 'API work order', slug: 'api-work-order', work_date: '2026-09-30', duration_minutes: 45, content: 'QA notes', created_by_user_id: memberAuth.user.id }).select('id').single())
  const item = await unwrap(member.from('items').insert({ owner_user_id: memberAuth.user.id, created_by_user_id: memberAuth.user.id, name: 'QA cable', purchase_amount: 12, purchase_currency_code: 'EUR' }).select('id').single())
  const link = await unwrap(member.from('project_items').insert({ project_id: projectId, item_id: item.id, role: 'part', status: 'available', attributed_amount: 12 }).select('id').single())
  await unwrap(member.from('log_item_usage').insert({ project_id: projectId, log_id: log.id, project_item_id: link.id, usage_amount: 1 }))
  await unwrap(member.from('project_items').update({ status: 'installed' }).eq('id', link.id))
  await unwrap(member.from('logs').update({ summary: 'Edited work order' }).eq('id', log.id))
  assert.equal((await unwrap(owner.from('project_items').select('*,item:items(*)').eq('project_id', projectId)))[0].item.name, 'QA cable')
  await unwrap(owner.from('projects').update({ is_public: true }).eq('id', projectId))
  assert.equal((await unwrap(anon.from('project_items').select('*,item:items(*)').eq('project_id', projectId))).length, 1)
  console.log('PASS: contributor worklogs, corrections, BOM costs/usage and public reads')
  await remove(owner, ownerEmail, false, { [projectId]: memberEmail }); ownerDeleted = true
  assert.equal((await unwrap(member.from('project_members').select('role').eq('project_id', projectId).eq('user_id', memberAuth.user.id)))[0].role, 'owner')
  assert.equal((await fetch((await unwrap(member.storage.from('project-originals').createSignedUrl(image.storage_path, 60))).signedUrl)).status, 200)
  console.log('PASS: real account deletion with project and photo ownership transfer')
  await remove(member, memberEmail, true); memberDeleted = true
  assert.equal((await unwrap(anon.from('projects').select('id').eq('id', projectId))).length, 0)
  console.log('PASS: real account deletion with project, BOM and photo cleanup')
} finally {
  for (const [api, email, deleted] of [[owner, ownerEmail, ownerDeleted], [member, memberEmail, memberDeleted]]) {
    if (deleted) continue
    try { await login(api, email); await remove(api, email, true); console.log('QA account cleaned up') }
    catch (error) { console.error(`QA cleanup needs attention for ${email}: ${error.message}`) }
  }
}
