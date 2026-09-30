export interface WorkshopMember { userId: string; role: string; name: string; email: string }
export interface WorkshopInvitation { id: string; email: string; role: string; expiresAt: string }

export function useWorkshopMembers(projectId: string) {
  const local = useLocalAccounts()
  const demoMode = useDemoMode()
  const liveMembers = ref<WorkshopMember[]>([])
  const liveInvitations = ref<WorkshopInvitation[]>([])
  const busy = ref(false)
  const members = computed(() => demoMode.value
    ? local.members(projectId).map(member => ({ userId: member.userId, role: member.role, name: member.account?.name || 'Builder', email: member.account?.email || '' }))
    : liveMembers.value)
  const invitations = computed(() => demoMode.value ? local.state.value.invitations.filter(entry => entry.projectId === projectId) : liveInvitations.value)
  async function action(action: string, email?: string, role = 'contributor', targetId?: string) {
    busy.value = true
    try {
      if (demoMode.value) {
        await local.initialize()
        if (action === 'add') return local.addMember(projectId, email || '', role as 'contributor' | 'reader')
        if (action === 'remove') local.removeMember(projectId, targetId!)
        if (action === 'cancel') local.cancelInvitation(projectId, targetId!)
        return ''
      }
      const { data, error } = await useSupabase()!.rpc('workshop_members', { p_project_id: projectId, p_action: action, p_email: email || null, p_role: role, p_target_id: targetId || null })
      if (error) throw new Error(error.message)
      liveMembers.value = data.members
      liveInvitations.value = data.invitations
      return data.message as string
    } finally { busy.value = false }
  }
  return { members, invitations, busy, action }
}
