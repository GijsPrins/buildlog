<script setup lang="ts">
import type { Project, ThemeConfig } from '~/types/domain'
import { copyTheme, projectThemePresets } from '~/utils/projectEditor'
import { validateTheme } from '~/utils/themes'

definePageMeta({ middleware: 'auth' })
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const project = ref<Project | null>(null)
const theme = ref<ThemeConfig | null>(null)
const loading = ref(true)
const busy = ref(false)
const owner = ref(false)
const error = ref('')
const message = ref('')
const heroUrl = ref('')
const fingerprint = ref('')
const dirty = computed(() => theme.value && JSON.stringify(theme.value) !== fingerprint.value)
const demoMode = useDemoMode()
const demo = useDemoStore()
const library = useThemeLibrary()
const preset = computed(() => projectThemePresets.find(entry => entry.name === theme.value?.preset))
const libraryThemeId = ref('')

async function load() {
  try {
    if (demoMode.value) {
      await useLocalAccounts().initialize(); demo.initialize()
      const data = demo.getProject(slug.value)
      if (!data) throw new Error('Project not found.')
      heroUrl.value = data.images.find(image => image.id === data.project.hero_image_id)?.signedUrl || ''
      project.value = data.project; owner.value = useLocalAccounts().role(data.project.id) === 'owner'
    } else {
      const client = useSupabase()!
      const [{ data, error: projectError }, { data: auth }] = await Promise.all([
        client.from('projects').select('*').eq('slug', slug.value).single(), client.auth.getUser()
      ])
      if (projectError) throw projectError
      project.value = data as Project
      if (auth.user) {
        const { data: member } = await client.from('project_members').select('role').eq('project_id', data.id).eq('user_id', auth.user.id).maybeSingle()
        if (data.hero_image_id) {
          const { data: image } = await client.from('project_images').select('storage_path').eq('id', data.hero_image_id).eq('upload_status', 'ready').is('deleted_at', null).maybeSingle()
          if (image) heroUrl.value = (await client.storage.from('project-originals').createSignedUrl(image.storage_path, 3600)).data?.signedUrl || ''
        }
        owner.value = member?.role === 'owner'
      }
    }
    theme.value = copyTheme(project.value!.theme_config)
    fingerprint.value = JSON.stringify(theme.value)
    if (owner.value) await library.load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not open the Theme Workshop.' }
  finally { loading.value = false }
}

function apply(config: ThemeConfig) { theme.value = copyTheme(config); message.value = '' }
function applyLibraryTheme() {
  const entry = library.themes.value.find(entry => entry.id === libraryThemeId.value)
  if (entry) apply(entry.config)
  libraryThemeId.value = ''
}
async function save() {
  if (!owner.value || !project.value || !theme.value) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    const invalid = validateTheme(theme.value)
    if (invalid) throw new Error(invalid)
    if (demoMode.value) demo.updateProjectTheme(project.value.id, theme.value)
    else {
      const { error: updateError } = await useSupabase()!.from('projects').update({ theme_config: theme.value }).eq('id', project.value.id).select('id').single()
      if (updateError) throw updateError
    }
    project.value.theme_config = copyTheme(theme.value)
    fingerprint.value = JSON.stringify(theme.value)
    message.value = 'Project theme saved.'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not save the theme.' }
  finally { busy.value = false }
}

onMounted(load)
onBeforeRouteLeave(() => !dirty.value || window.confirm('Leave without saving this project theme?'))
</script>

<template>
  <p v-if="loading" class="loading">Opening the paint shelf…</p>
  <div v-else-if="!project || !owner" class="empty-state"><h1>Owner access required</h1><p>{{ error || 'Only the project owner can change its theme.' }}</p><NuxtLink :to="`/projects/${slug}`">Back to project</NuxtLink></div>
  <div v-else-if="theme" class="project-theme-workshop">
    <NuxtLink :to="`/projects/${slug}`">← {{ project.name }}</NuxtLink>
    <header><p class="eyebrow">Project paint shelf</p><h1>Theme Workshop</h1><p>Try the colours and type on your build. Save when it feels right.</p></header>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <div class="project-theme-workshop__layout">
      <form class="form-card" @submit.prevent="save">
        <fieldset :disabled="busy"><legend>Starting palette</legend>
          <div class="palette-options"><button v-for="entry in projectThemePresets" :key="entry.name" type="button" :aria-pressed="theme.preset === entry.name" @click="apply(entry.config)">{{ entry.label }}</button></div>
          <label v-if="library.themes.value.length" class="field"><span>Your theme library</span><select v-model="libraryThemeId" @change="applyLibraryTheme"><option disabled value="">Choose a saved theme</option><option v-for="entry in library.themes.value" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></label>
          <ThemeControls v-model="theme" />
          <div class="form-actions"><button v-if="preset" class="button button--ghost" type="button" @click="apply(preset.config)">Reset to preset</button><button class="button button--ghost" type="button" @click="apply(project.theme_config)">Restore saved theme</button></div>
        </fieldset>
        <button class="button" type="submit" :disabled="busy || !dirty">{{ busy ? 'Saving…' : 'Save project theme' }}</button>
      </form>
      <ThemePreview :theme="theme" :name="project.name" :photo-src="heroUrl" />
    </div>
  </div>
</template>

<style scoped>
.project-theme-workshop header { margin: 2rem 0; }
.project-theme-workshop__layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2rem; align-items: start; }
fieldset { border: 0; padding: 0; margin: 0 0 1.5rem; min-width: 0; }
legend { margin-bottom: 1rem; }
.palette-options { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1.5rem; }
.palette-options button { padding: .6rem; border: 1px solid #d8d6ce; cursor: pointer; }
.palette-options [aria-pressed=true] { outline: 2px solid #123f36; }
@media (max-width: 750px) { .project-theme-workshop__layout { grid-template-columns: minmax(0, 1fr); } }
</style>
