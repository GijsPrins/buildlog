<script setup lang="ts">
const config = useRuntimeConfig()
const configured = useSupabaseConfigured()
const email = ref('')
const password = ref('')
const confirmation = ref('')
const ready = ref(false)
const canUpdate = ref(false)
const busy = ref(false)
const completed = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

onMounted(async () => {
  const supabase = useSupabase()
  try {
    if (!supabase) return
    const params = new URLSearchParams(window.location.hash.slice(1))
    if (params.has('error')) {
      errorMessage.value = 'This recovery link is invalid or expired. Request a new link below.'
      window.history.replaceState(null, '', window.location.pathname)
      return
    }
    // Wait for the client to finish processing recovery tokens in the URL.
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    canUpdate.value = Boolean(data.session)
  } catch {
    errorMessage.value = 'Could not open this recovery link. Request a new link below.'
  } finally {
    ready.value = true
  }
})

async function submit() {
  const supabase = useSupabase()
  if (!supabase || busy.value) return
  errorMessage.value = ''
  successMessage.value = ''
  if (canUpdate.value && (password.value.length < 8 || password.value !== confirmation.value)) {
    errorMessage.value = 'Use at least 8 characters and enter the same password twice.'
    return
  }
  busy.value = true
  try {
    if (canUpdate.value) {
      const { error } = await supabase.auth.updateUser({ password: password.value })
      if (error) throw error
      password.value = ''
      confirmation.value = ''
      completed.value = true
      successMessage.value = 'Your password has been updated.'
    } else {
      const redirectTo = new URL(`${config.app.baseURL}reset-password`, window.location.origin).href
      const { error } = await supabase.auth.resetPasswordForEmail(email.value, { redirectTo })
      if (error) throw error
      successMessage.value = 'If an account exists for this email address, you will receive a password reset link. Check your inbox.'
    }
  } catch (cause) {
    errorMessage.value = cause instanceof Error ? cause.message : 'Could not reset your password. Please try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="recovery-panel">
    <NuxtLink to="/login">← Sign in</NuxtLink>
    <p class="eyebrow">Workshop account</p>
    <h1>{{ canUpdate ? 'Choose a new password' : 'Forgot your password?' }}</h1>
    <p v-if="!configured">Password recovery is not available for local demo accounts.</p>
    <p v-else-if="!ready" role="status">Checking your recovery link…</p>
    <form v-else-if="!completed" @submit.prevent="submit">
      <template v-if="canUpdate">
        <div class="field">
          <label for="new-password">New password</label>
          <input id="new-password" v-model="password" type="password" autocomplete="new-password" minlength="8" required :disabled="busy">
        </div>
        <div class="field">
          <label for="confirm-password">Confirm new password</label>
          <input id="confirm-password" v-model="confirmation" type="password" autocomplete="new-password" minlength="8" required :disabled="busy">
        </div>
      </template>
      <div v-else class="field">
        <label for="recovery-email">Email address</label>
        <input id="recovery-email" v-model="email" type="email" autocomplete="email" required :disabled="busy">
      </div>
      <button class="button" :disabled="busy" type="submit">{{ busy ? 'Please wait…' : canUpdate ? 'Save new password' : 'Send reset link' }}</button>
    </form>
    <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="form-success" role="status">{{ successMessage }}</p>
    <NuxtLink v-if="completed" class="button" to="/">Back to the workshop →</NuxtLink>
  </section>
</template>

<style scoped>
.recovery-panel { max-width: 32rem; margin: 3rem auto; padding: 2rem; }
.recovery-panel .eyebrow { margin-top: 2rem; }
.recovery-panel h1 { margin-bottom: 1.5rem; }
</style>
