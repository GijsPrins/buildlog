<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const accounts = useLocalAccounts()
const demo = useDemoStore()
const deleteProjects = ref(false)
const transfers = ref<Record<string, string>>({})
const successorEmails = ref<Record<string, string>>({})
const confirmation = ref('')
const error = ref('')
const owned = computed(() => accounts.state.value.members.filter(member => member.userId === accounts.current.value?.id && member.role === 'owner').map(member => ({ ...member, project: demo.listProjects().find(project => project.id === member.projectId) })).filter(member => member.project))
onMounted(async () => { await accounts.initialize(); demo.initialize() })
async function removeAccount() {
  error.value = ''
  try {
    if (confirmation.value !== accounts.current.value?.email) throw new Error('Type your email address to confirm account deletion.')
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
}
</script>

<template>
  <ClientOnly>
  <div class="form-shell">
    <p class="eyebrow">Your workshop account</p><h1>{{ accounts.current.value?.name || 'Account' }}</h1>
    <p>{{ accounts.current.value?.email }}</p>
    <p class="muted">Local demo accounts live in this browser. Use a demo password, not a password from another service.</p>
    <form class="form-card" @submit.prevent="removeAccount">
      <h2>Delete account</h2><p>Your account and project memberships will be removed. Logs you contributed to other projects remain without your account attribution.</p>
      <label class="builder-toggle"><input v-model="deleteProjects" type="checkbox"><span><strong>Also delete my owned projects</strong><small>Removes their logs, photos and materials from this browser, including work by other contributors.</small></span></label>
      <template v-if="!deleteProjects && owned.length">
        <p>Keep your projects by handing each one to another registered account.</p>
        <label v-for="entry in owned" :key="entry.projectId" class="field"><span>New owner's email for {{ entry.project!.name }}</span><input v-model="successorEmails[entry.projectId]" type="email" placeholder="Exact email of a registered account" required></label>
        <p class="muted">The new owners must already have a local account. There is no public account directory.</p>
      </template>
      <label class="field"><span>Type your email to confirm</span><input v-model="confirmation" type="email" autocomplete="off" required></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="form-actions"><button class="button" type="submit" :disabled="confirmation !== accounts.current.value?.email">Permanently delete account{{ deleteProjects ? ' and owned projects' : '' }}</button><NuxtLink class="button button--ghost" to="/">Back to workshop</NuxtLink></div>
    </form>
  </div>
  </ClientOnly>
</template>
