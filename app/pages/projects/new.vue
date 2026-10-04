<script setup lang="ts">
import type { ThemeConfig } from '~/types/domain'
import type { ProjectEditorPhase } from '~/utils/projectEditor'
import { createProjectTemplateSnapshot, projectTemplates } from '~/utils/projectTemplates'
import { saveProjectCreation } from '~/utils/workshopSaves'
import { validateTheme } from '~/utils/themes'

definePageMeta({ middleware: 'auth' })

const name = ref('')
const slug = ref('')
const subtitle = ref('')
const description = ref('')
const startedStory = ref('')
const motivationStory = ref('')
const objectStory = ref('')
const projectId = ref('')
const heroId = ref('')
const heroFile = ref<File | null>(null)
const heroPreview = ref('')
const isPublic = ref(false)
const templateId = ref<string | null>('bicycle-restoration')
const templateDefaults = createProjectTemplateSnapshot(templateId.value)
const itemsEnabled = ref(templateDefaults.itemsEnabled)
const costsEnabled = ref(templateDefaults.costsEnabled)
const currencyCode = ref('EUR')
const theme = ref<ThemeConfig>(templateDefaults.theme)
const phases = ref<ProjectEditorPhase[]>(templateDefaults.phases.map((phaseName, index) => ({ key: `new-${index}`, id: null, name: phaseName, archived: false })))
const currentPhaseKey = ref<string | null>(phases.value[0]?.key || null)
const busy = ref(false)
const errorMessage = ref('')
const demoMode = useDemoMode()
const demo = useDemoStore()

function applyTemplate() {
  const nextId = templateId.value || null
  templateId.value = nextId
  const snapshot = createProjectTemplateSnapshot(nextId)
  theme.value = snapshot.theme; itemsEnabled.value = snapshot.itemsEnabled; costsEnabled.value = snapshot.costsEnabled
  phases.value = snapshot.phases.map((name, index) => ({ key: `new-${index}`, id: null, name, archived: false }))
  currentPhaseKey.value = phases.value[0]?.key || null
}

function selectHero(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (heroPreview.value) URL.revokeObjectURL(heroPreview.value)
  heroId.value = file ? crypto.randomUUID() : ''
  heroFile.value = file
  heroPreview.value = file ? URL.createObjectURL(file) : ''
}

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

onBeforeUnmount(() => {
  if (heroPreview.value) URL.revokeObjectURL(heroPreview.value)
})

watch(name, (value, previousValue) => {
  if (!slug.value || slug.value === slugify(previousValue)) {
    slug.value = slugify(value)
  }
})

async function submit() {
  if (busy.value) return
  const invalidTheme = validateTheme(theme.value)
  if (invalidTheme) { errorMessage.value = invalidTheme; return }
  const usablePhases = phases.value.filter(phase => !phase.archived && phase.name.trim())
  if (!usablePhases.length) {
    errorMessage.value = 'Keep at least one active project phase.'
    return
  }
  if (demoMode.value) {
    busy.value = true
    errorMessage.value = ''
    try {
      demo.initialize()
      const projectSlug = slugify(slug.value)
      if (demo.listProjects().some(project => project.slug === projectSlug)) {
        throw new Error('That web address is already in use in this demo.')
      }
      if (heroFile.value && heroFile.value.size > 2_500_000) {
        throw new Error('The demo starting photo can be at most 2.5 MB because it is stored in this browser.')
      }
      const heroImage = heroFile.value
        ? {
            name: heroFile.value.name,
            type: heroFile.value.type || 'image/jpeg',
            size: heroFile.value.size,
            dataUrl: await fileAsDataUrl(heroFile.value)
          }
        : null
      const project = demo.createProject({
        name: name.value.trim(),
        slug: projectSlug,
        subtitle: subtitle.value.trim() || null,
        description: description.value.trim() || null,
        startedStory: startedStory.value.trim() || null,
        motivationStory: motivationStory.value.trim() || null,
        objectStory: objectStory.value.trim() || null,
        isPublic: isPublic.value,
        itemsEnabled: itemsEnabled.value,
        costsEnabled: costsEnabled.value,
        theme: theme.value,
        currencyCode: currencyCode.value.toUpperCase(),
        currentPhaseIndex: currentPhaseKey.value ? Math.max(0, usablePhases.findIndex(phase => phase.key === currentPhaseKey.value)) : null,
        phases: usablePhases.map(phase => phase.name.trim()),
        heroImage
      })
      await navigateTo(`/projects/${project.slug}`)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'The project could not be created.'
      busy.value = false
    }
    return
  }

  const supabase = useSupabase()
  if (!supabase) return

  busy.value = true
  errorMessage.value = ''

  try {
    const { data, error: authError } = await supabase.auth.getUser()
    if (authError || !data.user) throw new Error('Your session expired. Sign in again.')
    projectId.value ||= crypto.randomUUID()
    for (const phase of usablePhases) phase.id ||= crypto.randomUUID()
    // A retry may resume a project created by an earlier attempt: phases it sent stay in the payload, archived if removed.
    const sentPhases = phases.value.filter(phase => phase.id)
    if (sentPhases.some(phase => !phase.name.trim())) throw new Error('Name every phase, or archive it instead.')
    const current = usablePhases.find(phase => phase.key === currentPhaseKey.value)
    const cleanSlug = slugify(slug.value)
    await saveProjectCreation(supabase, {
      id: projectId.value, slug: cleanSlug, name: name.value.trim(), subtitle: subtitle.value.trim() || null,
      description: description.value.trim() || null, started_story: startedStory.value.trim() || null,
      motivation_story: motivationStory.value.trim() || null, object_story: objectStory.value.trim() || null,
      current_phase_id: current?.id || null, hero_image_id: null, is_completed: false, is_public: isPublic.value,
      currency_code: currencyCode.value.toUpperCase(), items_enabled: itemsEnabled.value,
      cost_tracking_enabled: itemsEnabled.value && costsEnabled.value, theme_config: theme.value
    }, sentPhases.map((phase, index) => ({ id: phase.id, name: phase.name.trim(), archived: phase.archived, sort_order: index })),
      heroFile.value ? { id: heroId.value, file: heroFile.value, role: 'before', caption: `The starting point for ${name.value.trim()}.` } : null, data.user.id)
    await navigateTo(`/projects/${cleanSlug}`)
  } catch (cause) { errorMessage.value = cause instanceof Error ? cause.message : 'Could not save the project. Retry to resume the same project.' }
  finally { busy.value = false }

}
</script>

<template>
  <section class="form-card" aria-label="Project starting point">
    <label class="field"><span>Starting point</span><select v-model="templateId" :disabled="busy || Boolean(projectId)"><option value="">Start without a template</option><option v-for="template in projectTemplates" :key="template.id" :value="template.id">{{ template.name }}</option></select></label>
    <button class="button button--ghost" type="button" :disabled="busy || Boolean(projectId)" @click="applyTemplate">Apply starting point</button>
    <p class="muted">Applying replaces the phases, palette and ledger defaults. Your name, story and photo stay.</p>
    <p>{{ projectTemplates.find(template => template.id === templateId)?.description || 'Choose your own phases, facts and visual identity for any kind of build.' }}</p>
    <p class="muted">These are starting defaults. Everything belongs to your project once it is created. Optional specification suggestions are available in its dossier.</p>
  </section>
  <ProjectRecordForm
    v-model:name="name" v-model:project-slug="slug" v-model:subtitle="subtitle" v-model:description="description"
    v-model:started-story="startedStory" v-model:motivation-story="motivationStory" v-model:object-story="objectStory"
    v-model:is-public="isPublic" v-model:items-enabled="itemsEnabled" v-model:costs-enabled="costsEnabled"
    v-model:currency-code="currencyCode" v-model:theme="theme" v-model:phases="phases" v-model:current-phase-key="currentPhaseKey"
    mode="create" back-to="/" back-label="Workshop board" :hero-preview="heroPreview" :busy="busy" :error-message="errorMessage"
    @hero-selected="selectHero" @submit="submit"
  />
</template>
