<script setup lang="ts">
const props = defineProps<{ projectId: string }>()
const route = useRoute()
const accounts = useWorkshopMembers(props.projectId)
const demoMode = useDemoMode()
const email = ref('')
const role = ref<'contributor' | 'reader'>('contributor')
const message = ref('')
const error = ref('')
const { members, invitations, busy } = accounts
const invitationLink = ref('')
const successor = ref('')
const confirmation = ref('')
const transferring = ref(false)
const candidates = computed(() => members.value.filter(member => member.role !== 'owner'))
async function transfer() {
  const target = candidates.value.find(member => member.userId === successor.value)
  if (!target || confirmation.value.trim().toLowerCase() !== target.email.toLowerCase()) return
  transferring.value = true; error.value = ''
  try {
    if (demoMode.value) useLocalAccounts().transferOwnership(props.projectId, target.userId)
    else {
      const { error: failure } = await useSupabase()!.rpc('transfer_project_ownership', { p_project_id: props.projectId, p_new_owner_user_id: target.userId })
      if (failure) throw failure
    }
    await navigateTo(route.path.replace(/\/edit\/?$/, ''))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not transfer ownership.' }
  finally { transferring.value = false }
}
onMounted(async () => {
  invitationLink.value = `${window.location.origin}${useRuntimeConfig().app.baseURL}login`
  try { await accounts.action('list') } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not load members.' }
})
async function run(action: string, targetId?: string) {
  error.value = ''; message.value = ''
  try { message.value = await accounts.action(action, email.value, role.value, targetId); if (action === 'add') email.value = '' } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not update members.' }
}
</script>

<template>
  <section class="project-editor__section">
    <header class="builder-section-heading"><span>05</span><div><p class="eyebrow">People around the bench</p><h2>Workshop members</h2></div><p>Contributors can write workshop logs. Readers can follow private builds.</p></header>
    <div class="form-card">
      <div v-for="member in members" :key="member.userId" class="member-row">
        <div><strong>{{ member.name }}</strong><small>{{ member.email }} · {{ member.role }}</small></div>
        <button v-if="member.role !== 'owner'" type="button" class="button button--ghost button--small" :disabled="busy" @click="run('remove', member.userId)">Remove access</button>
      </div>
      <div v-for="invitation in invitations" :key="invitation.id" class="member-row">
        <div><strong>{{ invitation.email }}</strong><small>{{ invitation.role }} · {{ Date.parse(invitation.expiresAt) > Date.now() ? 'Pending' : 'Expired' }} · expires {{ new Date(invitation.expiresAt).toLocaleDateString() }}</small></div>
        <button type="button" class="button button--ghost button--small" :disabled="busy" @click="run('cancel', invitation.id)">Cancel invitation</button>
      </div>
      <div class="form-grid"><label class="field"><span>Email address</span><input v-model="email" type="email" placeholder="builder@example.com"></label><label class="field"><span>Access</span><select v-model="role"><option value="contributor">Contributor</option><option value="reader">Reader</option></select></label></div>
      <p class="muted">{{ demoMode ? 'Local invitations stay in this browser; no email is sent.' : 'Verified accounts are added immediately. New addresses receive access after signing up and verifying their email within seven days. Share the link below; invitation emails are not sent automatically.' }}</p>
      <label v-if="!demoMode && invitations.length" class="field"><span>Sign-up link to share</span><input :value="invitationLink" readonly @focus="($event.target as HTMLInputElement).select()"></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="message" class="form-success" role="status">{{ message }}</p>
      <button type="button" class="button" :disabled="busy || !email.trim()" @click="run('add')">{{ busy ? 'Updating access…' : 'Add workshop member' }}</button>
      <details>
        <summary>Transfer project ownership</summary>
        <p>The selected member becomes the sole owner. You remain a Contributor and lose access to project settings and membership management. Unsaved project changes are not saved by this action.</p>
        <p v-if="!candidates.length">Add an existing member before transferring ownership. Pending invitations cannot receive ownership.</p>
        <label class="field">New owner<select v-model="successor" :disabled="transferring" @change="confirmation = ''"><option value="">Choose an existing member</option><option v-for="member in candidates" :key="member.userId" :value="member.userId">{{ member.name }} — {{ member.email }}</option></select></label>
        <label class="field">Type the new owner's email to confirm<input v-model="confirmation" type="email" :disabled="transferring" autocomplete="off"></label>
        <button type="button" class="button" :disabled="transferring || busy || !successor || confirmation.trim().toLowerCase() !== candidates.find(member => member.userId === successor)?.email.toLowerCase()" @click="transfer">{{ transferring ? 'Transferring…' : 'Confirm ownership transfer' }}</button>
      </details>
    </div>
  </section>
</template>
