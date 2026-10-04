<script setup lang="ts">
import { collectPages } from '~/utils/workshopFinancials'
definePageMeta({ middleware: 'auth' })
const accounts = useLocalAccounts()
const demo = useDemoStore()
const demoMode = useDemoMode()
const { user, initialize, signOut } = useAuth()
const busy = ref(false)
const liveOwned = ref<Array<{ projectId: string; project: { name: string } }>>([])
const deleteProjects = ref(false)
const transfers = ref<Record<string, string>>({})
const successorEmails = ref<Record<string, string>>({})
const confirmation = ref('')
const error = ref('')
const accountEmail = computed(() => user.value?.email || '')
const accountName = computed(() => user.value?.user_metadata?.display_name || 'Account')
const owned = computed(() => demoMode.value ? accounts.state.value.members.filter(member => member.userId === accounts.current.value?.id && member.role === 'owner').map(member => ({ ...member, project: demo.listProjects().find(project => project.id === member.projectId) })).filter(member => member.project) : liveOwned.value)
onMounted(async () => {
  await initialize()
  if (demoMode.value) { await accounts.initialize(); demo.initialize(); return }
  try {
    const data = await collectPages<{ project_id: string; project: { name: string } }>((from, to) => useSupabase()!.from('project_members').select('project_id,project:projects(name)', { count: 'exact' }).eq('user_id', user.value!.id).eq('role', 'owner').order('project_id').range(from, to).returns<Array<{ project_id: string; project: { name: string } }>>())
    liveOwned.value = data.map(entry => ({ projectId: entry.project_id, project: entry.project }))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not load all owned projects.' }
})
async function removeAccount() {
  error.value = ''; busy.value = true
  try {
    if (confirmation.value !== accountEmail.value) throw new Error('Type your email address to confirm account deletion.')
    if (!demoMode.value) {
      const { data, error: invokeError } = await useSupabase()!.functions.invoke('delete-account', { body: { confirmation: confirmation.value, deleteProjects: deleteProjects.value, transfers: successorEmails.value } })
      if (invokeError) {
        let detail = invokeError.message
        if (invokeError.context instanceof Response) { try { detail = (await invokeError.context.json()).error || detail } catch {} }
        throw new Error(detail)
      }
      if (!data?.success) throw new Error(data?.error || 'Account deletion did not finish.')
      await signOut()
      await navigateTo('/login?deleted=1')
      return
    }
    if (!deleteProjects.value) {
      for (const entry of owned.value) {
        const account = accounts.state.value.accounts.find(account => account.email === successorEmails.value[entry.projectId]?.trim().toLowerCase() && account.id !== accounts.current.value?.id)
        if (!account) throw new Error(`Enter the exact email of another registered account for ${entry.project!.name}.`)
        transfers.value[entry.projectId] = account.id
      }
    }
    demo.deleteLocalAccount(transfers.value, deleteProjects.value)
    await navigateTo('/login?deleted=1')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not delete account.' }
  finally { busy.value = false }
}
</script>

<template>
  <ClientOnly>
  <div class="form-shell">
    <p class="eyebrow">Your workshop account</p><h1>{{ accountName }}</h1>
    <p>{{ accountEmail }}</p>
    <p v-if="demoMode" class="muted">Local demo accounts live in this browser. Use a demo password, not a password from another service.</p>
    <p v-else class="muted">Your workshop is stored in Supabase and accessible on your other devices.</p>
    <form class="form-card" @submit.prevent="removeAccount">
      <h2>Delete account</h2><p>Your account and project memberships will be removed. Sessions and notes you contributed to other projects remain without your account attribution. Your approval stamps are removed.</p>
      <label class="builder-toggle"><input v-model="deleteProjects" type="checkbox"><span><strong>Also delete my owned projects</strong><small>Permanently removes their logs, photos and project materials, including work by other contributors.</small></span></label>
      <template v-if="!deleteProjects && owned.length">
        <p>Keep your projects by handing each one to another registered account.</p>
        <label v-for="entry in owned" :key="entry.projectId" class="field"><span>New owner's email for {{ entry.project!.name }}</span><input v-model="successorEmails[entry.projectId]" type="email" placeholder="Exact email of a registered account" required></label>
        <p class="muted">The new owners must already have {{ demoMode ? 'a local account' : 'a verified account' }}. There is no public account directory.</p>
      </template>
      <label class="field"><span>Type your email to confirm</span><input v-model="confirmation" type="email" autocomplete="off" required></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-if="!demoMode" class="muted">For security, sign in again if your last sign-in was more than 15 minutes ago. This action cannot be undone.</p>
      <div class="form-actions"><button class="button" type="submit" :disabled="busy || confirmation !== accountEmail">{{ busy ? 'Deleting account…' : 'Permanently delete account' }}{{ deleteProjects ? ' and owned projects' : '' }}</button><NuxtLink class="button button--ghost" to="/">Back to workshop</NuxtLink></div>
    </form>
  </div>
  </ClientOnly>
</template>
