<script setup lang="ts">
const props = defineProps<{ projectId: string }>()
const accounts = useLocalAccounts()
const email = ref('')
const role = ref<'contributor' | 'reader'>('contributor')
const message = ref('')
const error = ref('')
const members = computed(() => accounts.members(props.projectId))
const invitations = computed(() => accounts.state.value.invitations.filter(invitation => invitation.projectId === props.projectId))
function add() {
  error.value = ''; message.value = ''
  try { message.value = accounts.addMember(props.projectId, email.value, role.value); email.value = '' } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not add member.' }
}
</script>

<template>
  <section class="project-editor__section">
    <header class="builder-section-heading"><span>05</span><div><p class="eyebrow">People around the bench</p><h2>Workshop members</h2></div><p>Contributors can write workshop logs. Readers can follow private builds.</p></header>
    <div class="form-card">
      <div v-for="member in members" :key="member.userId" class="member-row">
        <div><strong>{{ member.account?.name }}</strong><small>{{ member.account?.email }} · {{ member.role }}</small></div>
        <button v-if="member.role !== 'owner'" type="button" class="button button--ghost button--small" @click="accounts.removeMember(projectId, member.userId)">Remove access</button>
      </div>
      <div v-for="invitation in invitations" :key="invitation.id" class="member-row">
        <div><strong>{{ invitation.email }}</strong><small>{{ invitation.role }} · {{ Date.parse(invitation.expiresAt) > Date.now() ? 'Pending' : 'Expired' }} · expires {{ new Date(invitation.expiresAt).toLocaleDateString() }}</small></div>
        <button type="button" class="button button--ghost button--small" @click="accounts.cancelInvitation(projectId, invitation.id)">Cancel invitation</button>
      </div>
      <div class="form-grid"><label class="field"><span>Email address</span><input v-model="email" type="email" placeholder="builder@example.com"></label><label class="field"><span>Access</span><select v-model="role"><option value="contributor">Contributor</option><option value="reader">Reader</option></select></label></div>
      <p class="muted">Existing accounts are added immediately. New addresses receive a local invitation valid for seven days; no email is sent.</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="message" class="form-success" role="status">{{ message }}</p>
      <button type="button" class="button" :disabled="!email.trim()" @click="add">Add workshop member</button>
    </div>
  </section>
</template>
