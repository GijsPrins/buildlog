export interface LocalAccount { id: string; email: string; name: string; salt: string; passwordHash: string }
export interface LocalMember { projectId: string; userId: string; role: 'owner' | 'contributor' | 'reader' }
interface LocalAccounts { accounts: LocalAccount[]; members: LocalMember[]; invitations: Array<{ id: string; projectId: string; email: string; role: 'contributor' | 'reader'; expiresAt: string }>; sessionId: string | null }
const KEY = 'buildlog-local-accounts-v1'
let initialization: Promise<void> | null = null

export function useLocalAccounts() {
  const state = useState<LocalAccounts>('local-accounts', () => ({ accounts: [], members: [], invitations: [], sessionId: null }))
  const ready = useState('local-accounts-ready', () => false)
  const current = computed(() => state.value.accounts.find(account => account.id === state.value.sessionId) || null)
  const committed = useState('local-accounts-committed', () => JSON.stringify(state.value))
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state.value)); committed.value = JSON.stringify(state.value) }
    catch {
      state.value = JSON.parse(committed.value)
      throw new Error('This browser could not save the local account change. Check available demo storage and retry.')
    }
  }
  async function hash(password: string, salt: string) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 210000, hash: 'SHA-256' }, key, 256)
    return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('')
  }
  async function initialize() {
    if (ready.value || !import.meta.client) return
    if (initialization) return initialization
    initialization = (async () => {
      const saved = localStorage.getItem(KEY)
      if (saved) { state.value = JSON.parse(saved); committed.value = saved }
      else {
        const salt = crypto.randomUUID()
        state.value.accounts.push({ id: 'demo-user', email: 'builder@buildlog.local', name: 'Demo builder', salt, passwordHash: await hash('Workshop2026!', salt) })
        state.value.sessionId = 'demo-user'
        persist()
      }
      ready.value = true
    })()
    try { await initialization } finally { initialization = null }
  }
  function role(projectId: string) { return state.value.members.find(member => member.projectId === projectId && member.userId === current.value?.id)?.role || null }
  function canWrite(projectId: string) { return ['owner', 'contributor'].includes(role(projectId) || '') }
  function requireRole(projectId: string, owner = false) {
    if (owner ? role(projectId) !== 'owner' : !canWrite(projectId)) throw new Error('You do not have permission to change this project.')
  }
  function ensureOwners(projectIds: string[]) {
    let changed = false
    for (const projectId of projectIds) if (!state.value.members.some(member => member.projectId === projectId && member.role === 'owner')) { state.value.members.push({ projectId, userId: 'demo-user', role: 'owner' }); changed = true }
    if (changed) persist()
  }
  function addOwner(projectId: string) {
    if (!current.value) throw new Error('Sign in first.')
    state.value.members.push({ projectId, userId: current.value.id, role: 'owner' }); persist()
  }
  function restoreSnapshot(snapshot: string) {
    state.value = JSON.parse(snapshot); committed.value = snapshot
    try { persist() } catch { /* Keep the complete in-memory snapshot if storage is unavailable. */ }
  }
  function acceptInvitations(account: LocalAccount) {
    const accepted = state.value.invitations.filter(invitation => invitation.email === account.email && Date.parse(invitation.expiresAt) > Date.now())
    for (const invitation of accepted) if (!state.value.members.some(member => member.projectId === invitation.projectId && member.userId === account.id)) state.value.members.push({ projectId: invitation.projectId, userId: account.id, role: invitation.role })
    state.value.invitations = state.value.invitations.filter(invitation => !accepted.includes(invitation))
  }
  async function register(name: string, email: string, password: string) {
    await initialize(); email = email.trim().toLowerCase()
    if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) throw new Error('Enter a name, valid email and a password of at least 8 characters.')
    if (state.value.accounts.some(account => account.email === email)) throw new Error('An account with this email already exists.')
    const salt = crypto.randomUUID()
    const account = { id: crypto.randomUUID(), name: name.trim(), email, salt, passwordHash: await hash(password, salt) }
    state.value.accounts.push(account); state.value.sessionId = account.id; acceptInvitations(account); persist()
  }
  async function signIn(email: string, password: string) {
    await initialize()
    const account = state.value.accounts.find(account => account.email === email.trim().toLowerCase())
    if (!account || await hash(password, account.salt) !== account.passwordHash) throw new Error('Email or password is incorrect.')
    state.value.sessionId = account.id; acceptInvitations(account); persist()
  }
  function signOut() { state.value.sessionId = null; persist() }
  function members(projectId: string) { return state.value.members.filter(member => member.projectId === projectId).map(member => ({ ...member, account: state.value.accounts.find(account => account.id === member.userId)! })) }
  function addMember(projectId: string, email: string, memberRole: 'contributor' | 'reader') {
    requireRole(projectId, true); email = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.')
    const account = state.value.accounts.find(account => account.email === email)
    if (account) {
      if (state.value.members.some(member => member.projectId === projectId && member.userId === account.id)) throw new Error('This person is already a project member.')
      state.value.members.push({ projectId, userId: account.id, role: memberRole }); persist(); return 'Account recognized and added to the project.'
    }
    if (state.value.invitations.some(invitation => invitation.projectId === projectId && invitation.email === email && Date.parse(invitation.expiresAt) > Date.now())) throw new Error('A pending invitation already exists.')
    state.value.invitations.push({ id: crypto.randomUUID(), projectId, email, role: memberRole, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }); persist()
    return 'Local invitation saved. Register with this email in this browser to join; no email is sent.'
  }
  function removeMember(projectId: string, userId: string) { requireRole(projectId, true); state.value.members = state.value.members.filter(member => !(member.projectId === projectId && member.userId === userId && member.role !== 'owner')); persist() }
  function cancelInvitation(projectId: string, id: string) { requireRole(projectId, true); state.value.invitations = state.value.invitations.filter(invitation => !(invitation.projectId === projectId && invitation.id === id)); persist() }
  function transferOwnership(projectId: string, successorId: string) {
    requireRole(projectId, true)
    const previous = state.value.members.find(member => member.projectId === projectId && member.role === 'owner')!
    const successor = state.value.members.find(member => member.projectId === projectId && member.userId === successorId)
    if (!successor) throw new Error('The new owner must already be a project member.')
    if (previous === successor) return
    previous.role = 'contributor'; successor.role = 'owner'
    persist()
  }

  function deleteAccount(transfers: Record<string, string>, deleteProjects: boolean) {
    const account = current.value
    if (!account) throw new Error('Sign in first.')
    const owned = state.value.members.filter(member => member.userId === account.id && member.role === 'owner')
    if (!deleteProjects) for (const member of owned) if (!state.value.accounts.some(other => other.id === transfers[member.projectId] && other.id !== account.id)) throw new Error('Choose a new owner for each project you want to keep.')
    if (!deleteProjects) for (const member of owned) {
      const nextId = transfers[member.projectId]!
      state.value.members = state.value.members.filter(other => !(other.projectId === member.projectId && other.userId === nextId))
      state.value.members.push({ projectId: member.projectId, userId: nextId, role: 'owner' })
    }
    state.value.members = state.value.members.filter(member => member.userId !== account.id && !(deleteProjects && owned.some(project => project.projectId === member.projectId)))
    state.value.invitations = state.value.invitations.filter(invitation => !(deleteProjects && owned.some(project => project.projectId === invitation.projectId)))
    state.value.accounts = state.value.accounts.filter(other => other.id !== account.id); state.value.sessionId = null; persist()
    return owned.map(member => member.projectId)
  }
  return { restoreSnapshot, transferOwnership, state, current, initialize, role, canWrite, requireRole, ensureOwners, addOwner, register, signIn, signOut, members, addMember, removeMember, cancelInvitation, deleteAccount }
}
