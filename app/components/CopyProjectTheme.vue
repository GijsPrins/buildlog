<script setup lang="ts">
import type { ThemeConfig } from '~/types/domain'
const props = defineProps<{ theme: ThemeConfig; projectName: string }>()
const route = useRoute()
const { user, initialize } = useAuth()
const library = useThemeLibrary()
const opened = ref(false)
const busy = ref(false)
const saved = ref(false)
const error = ref('')
const name = ref(`${props.projectName.slice(0, 67)} — theme`)
const loginUrl = computed(() => `/login?redirect=${encodeURIComponent(`${route.path}#copy-theme`)}`)
onMounted(initialize)
async function copy() {
  if (busy.value || !name.value.trim()) return
  busy.value = true; error.value = ''
  try {
    await initialize()
    await library.save(null, name.value, props.theme)
    saved.value = true; opened.value = false
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not copy this theme.' }
  finally { busy.value = false }
}
</script>

<template>
  <div id="copy-theme" class="project-theme-copy">
    <template v-if="saved"><p role="status">Theme copied to your library. Make it your own!</p><NuxtLink to="/themes">Open my themes →</NuxtLink></template>
    <template v-else>
      <button class="button button--ghost" type="button" :aria-expanded="opened" :disabled="busy" @click="opened = !opened">Copy theme</button>
      <div v-if="opened" class="project-theme-copy__panel">
        <p>Inspired by this build? Keep its colours, typography and finishes in your own theme library. The original build stays unchanged.</p>
        <template v-if="user"><label class="field"><span>Name your copy</span><input v-model="name" maxlength="80" :disabled="busy" @keydown.enter.prevent="copy"></label><button class="button" type="button" :disabled="busy || !name.trim()" @click="copy">{{ busy ? 'Copying…' : 'Save to my themes' }}</button></template>
        <template v-else><p>Sign in to keep this palette for your own builds.</p><NuxtLink class="button" :to="loginUrl">Sign in to copy</NuxtLink></template>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.project-theme-copy{margin-top:24px}.project-theme-copy__panel{max-width:32rem;padding:18px;margin-top:12px;border:1px solid var(--project-border);background:var(--project-surface);border-radius:var(--project-radius)}.project-theme-copy p{font-size:.9rem;line-height:1.6}.project-theme-copy .field{margin:14px 0}
</style>
