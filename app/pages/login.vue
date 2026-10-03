<script setup lang="ts">
const route = useRoute()
const workshopPhoto = `${useRuntimeConfig().app.baseURL}demo/gios-start.jpeg`
const configured = useSupabaseConfigured()
const local = useLocalAccounts()
const destination = computed(() => typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//') ? route.query.redirect : '/')
const mode = ref<'signin' | 'signup'>('signin')
const displayName = ref('')
const email = ref('')
const password = ref('')
const showPassword = ref(false)
function switchMode(next: 'signin' | 'signup') { mode.value = next; errorMessage.value = ''; successMessage.value = ''; password.value = ''; showPassword.value = false }
const busy = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function submit() {
  if (!configured) {
    busy.value = true; errorMessage.value = ''; successMessage.value = ''
    try {
      if (mode.value === 'signup') await local.register(displayName.value, email.value, password.value)
      else await local.signIn(email.value, password.value)
      await navigateTo(destination.value)
    } catch (cause) { errorMessage.value = cause instanceof Error ? cause.message : 'Could not sign in.' }
    finally { busy.value = false }
    return
  }
  const supabase = useSupabase()
  if (!supabase) {
    errorMessage.value = 'Supabase is not configured yet. Add the values from .env.example.'
    return
  }

  busy.value = true
  errorMessage.value = ''
  successMessage.value = ''

  if (mode.value === 'signup') {
    const { data, error } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
      options: { data: { display_name: displayName.value.trim() }, emailRedirectTo: `${window.location.origin}${useRuntimeConfig().app.baseURL}` }
    })

    if (error) {
      errorMessage.value = error.message
    } else if (!data.session) {
      successMessage.value = 'Check your email to confirm your account, then sign in.'
      mode.value = 'signin'
    } else {
      await supabase.rpc('accept_workshop_invitations')
      await useAuth().initialize()
      await navigateTo(destination.value)
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value
    })

    if (error) {
      errorMessage.value = error.message
    } else {
      await supabase.rpc('accept_workshop_invitations')
      await useAuth().initialize()
      await navigateTo(destination.value)
    }
  }

  busy.value = false
}
</script>

<template>
  <div class="workshop-access">
    <div class="workshop-access__bar">
      <NuxtLink to="/">← Workshop board</NuxtLink>
      <span>Buildlog / members entrance</span>
      <strong>{{ mode === 'signin' ? 'PASS 01' : 'PASS 02' }}</strong>
    </div>

    <div class="workshop-access__grid">
      <aside class="workshop-access__welcome">
        <p class="eyebrow">A place at the bench</p>
        <h1>{{ mode === 'signin' ? 'Back to\nthe workshop.' : 'Make room\nfor your build.' }}</h1>
        <p>{{ mode === 'signin' ? 'Your projects, your notes, your next good idea. Pick up where you left off.' : 'Give your project a home. Start with an object, a photo, or a story worth keeping.' }}</p>
        <figure class="workshop-access__photo">
          <img :src="workshopPhoto" alt="Ivory Gios Torino bicycle waiting for its next workshop session">
          <figcaption>From the workshop / Gios Torino</figcaption>
        </figure>
        <div class="workshop-access__stamp" aria-hidden="true"><span>Buildlog</span><strong>Made by hand</strong><span>Keep the story</span></div>
        <div class="workshop-access__footnote"><span>Objects with a past.</span><span>Projects with a future.</span></div>
      </aside>

      <section class="workshop-access__paper" aria-labelledby="access-heading">
        <div class="workshop-access__ticket-head"><span>Workshop membership</span><span>{{ mode === 'signin' ? 'Returning builder' : 'New builder' }}</span></div>
        <div class="workshop-access__tabs" aria-label="Account action">
          <button type="button" :class="{ current: mode === 'signin' }" :aria-pressed="mode === 'signin'" :disabled="busy" @click="switchMode('signin')">Sign in</button>
          <button type="button" :class="{ current: mode === 'signup' }" :aria-pressed="mode === 'signup'" :disabled="busy" @click="switchMode('signup')">Create account</button>
        </div>
        <header>
          <p class="eyebrow">{{ mode === 'signin' ? 'Your bench is waiting' : 'Issue a new workshop pass' }}</p>
          <h2 id="access-heading">{{ mode === 'signin' ? 'Welcome back.' : 'Come on in.' }}</h2>
          <p>{{ mode === 'signin' ? 'Sign in to open your workshop record.' : 'A name for the work. A place to keep it.' }}</p>
        </header>

        <form @submit.prevent="submit">
          <div v-if="mode === 'signup'" class="field">
            <label for="display-name"><span>01</span> Display name</label>
            <input id="display-name" v-model="displayName" autocomplete="name" placeholder="What should we call you?" required :disabled="busy">
          </div>
          <div class="field">
            <label for="email"><span>{{ mode === 'signup' ? '02' : '01' }}</span> Email</label>
            <input id="email" v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required :disabled="busy">
          </div>
          <div class="field">
            <label for="password"><span>{{ mode === 'signup' ? '03' : '02' }}</span> Password</label>
            <div class="workshop-access__password">
              <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'" placeholder="At least 8 characters" minlength="8" required :disabled="busy" aria-describedby="password-note">
              <button type="button" :aria-pressed="showPassword" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">{{ showPassword ? 'Hide' : 'Show' }}</button>
            </div>
            <small id="password-note">{{ mode === 'signup' ? 'Choose a password with at least 8 characters.' : 'The password on your workshop account.' }}</small>
          </div>
          <p v-if="route.query.deleted" class="form-success" role="status">Your account has been deleted.</p>
          <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
          <p v-if="successMessage" class="form-success" role="status">{{ successMessage }}</p>
          <button class="button workshop-access__submit" type="submit" :disabled="busy">{{ busy ? 'Opening the workshop…' : mode === 'signin' ? 'Sign in →' : 'Create my workshop account →' }}</button>
        </form>
        <p v-if="configured && mode === 'signin'" class="workshop-access__recovery">
          Can’t find your tools? Let’s get you back in.<br>
          <NuxtLink to="/reset-password">Reset your password →</NuxtLink>
        </p>

        <div class="workshop-access__switch">
          <span>{{ mode === 'signin' ? 'First time at the bench?' : 'Already have a workshop pass?' }}</span>
          <button type="button" :disabled="busy" @click="switchMode(mode === 'signin' ? 'signup' : 'signin')">{{ mode === 'signin' ? 'Create an account' : 'Sign in instead' }}</button>
        </div>

        <details v-if="!configured" class="workshop-access__demo">
          <summary>Trying the local workshop?</summary>
          <p>Accounts stay in this browser. Use a demo password.</p>
          <dl><div><dt>Email</dt><dd>builder@buildlog.local</dd></div><div><dt>Password</dt><dd>Workshop2026!</dd></div></dl>
        </details>
        <p class="workshop-access__serial" aria-hidden="true">BL / MEMBER RECORD / {{ mode === 'signin' ? '01 — RETURN' : '02 — REGISTER' }}</p>
      </section>
    </div>
  </div>
</template>
