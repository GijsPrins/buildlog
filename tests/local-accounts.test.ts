import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { webcrypto } from 'node:crypto'
import { useLocalAccounts } from '../app/composables/useLocalAccounts'
import { useDemoStore } from '../app/composables/useDemoStore'

beforeEach(() => {
  const states = new Map<string, ReturnType<typeof ref>>()
  localStorage.clear()
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useState', (key: string, initial: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(initial()))
    return states.get(key)
  })
  vi.stubGlobal('useLocalAccounts', useLocalAccounts)
})

describe('local workshop accounts', () => {
  it('registers, rejects wrong passwords, recognizes exact emails and enforces roles', async () => {
    const accounts = useLocalAccounts()
    await Promise.all([accounts.initialize(), accounts.initialize()])
    expect(accounts.state.value.accounts).toHaveLength(1)
    accounts.ensureOwners(['project'])
    await accounts.register('Contributor', ' Person@Example.com ', 'TestPassword!')
    const person = accounts.current.value!
    expect(person.passwordHash).not.toBe('TestPassword!')
    accounts.signOut()
    await expect(accounts.signIn(person.email, 'wrong-password')).rejects.toThrow('incorrect')
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    accounts.addMember('project', 'PERSON@example.com', 'contributor')
    await accounts.signIn(person.email, 'TestPassword!')
    expect(accounts.canWrite('project')).toBe(true)
    expect(() => accounts.requireRole('project', true)).toThrow('permission')
    expect(() => accounts.addMember('project', 'third@example.com', 'reader')).toThrow('permission')
  })

  it('accepts unexpired invitations on registration and rejects duplicates', async () => {
    const accounts = useLocalAccounts()
    await accounts.initialize(); accounts.ensureOwners(['project'])
    accounts.addMember('project', 'reader@example.com', 'reader')
    expect(() => accounts.addMember('project', 'reader@example.com', 'reader')).toThrow('pending')
    await accounts.register('Reader', 'reader@example.com', 'TestPassword!')
    expect(accounts.role('project')).toBe('reader')
    expect(accounts.canWrite('project')).toBe(false)
    expect(accounts.state.value.invitations).toHaveLength(0)
  })

  it('keeps projects by transferring ownership and protects private projects after logout', async () => {
    const accounts = useLocalAccounts()
    await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    const project = demo.listProjects()[0]!
    await accounts.register('Successor', 'next@example.com', 'TestPassword!')
    const successor = accounts.current.value!.id
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    expect(() => demo.deleteLocalAccount({}, false)).toThrow('new owner')
    const transfers = Object.fromEntries(demo.listProjects().map(project => [project.id, successor]))
    demo.deleteLocalAccount(transfers, false)
    expect(demo.listProjects()).toHaveLength(2)
    await accounts.signIn('next@example.com', 'TestPassword!')
    expect(accounts.role(project.id)).toBe('owner')
    const detail = demo.getProject(project.slug)!
    detail.project.is_public = false
    accounts.signOut()
    expect(demo.getProject(project.slug)).toBeNull()
    expect(demo.listProjects().some(entry => entry.id === project.id)).toBe(false)
  })

  it('deletes owned projects and related records when deleting the account', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize()
    const demo = useDemoStore(); demo.initialize()
    demo.deleteLocalAccount({}, true)
    expect(accounts.current.value).toBeNull()
    expect(accounts.state.value.members).toHaveLength(0)
    expect(demo.listProjects()).toHaveLength(0)
    expect(demo.listProjectItems('demo-gios')).toHaveLength(0)
    const saved = JSON.parse(localStorage.getItem('buildlog-demo-v5')!)
    expect(saved.logs).toHaveLength(0)
    expect(saved.images).toHaveLength(0)
    expect(saved.phases).toHaveLength(0)
    await expect(accounts.signIn('builder@buildlog.local', 'Workshop2026!')).rejects.toThrow('incorrect')
  })

  it('does not accept expired invitations and removes revoked access', async () => {
    const accounts = useLocalAccounts(); await accounts.initialize(); accounts.ensureOwners(['project'])
    accounts.addMember('project', 'late@example.com', 'contributor')
    accounts.state.value.invitations[0]!.expiresAt = '2020-01-01T00:00:00Z'
    await accounts.register('Late', 'late@example.com', 'TestPassword!')
    const id = accounts.current.value!.id
    expect(accounts.role('project')).toBeNull()
    await accounts.signIn('builder@buildlog.local', 'Workshop2026!')
    accounts.addMember('project', 'late@example.com', 'reader')
    accounts.removeMember('project', id)
    await accounts.signIn('late@example.com', 'TestPassword!')
    expect(accounts.role('project')).toBeNull()
  })
})
