<script setup lang="ts">
import type { ThemeConfig } from '~/types/domain'
import type { ProjectEditorPhase } from '~/utils/projectEditor'
import { createProjectTemplateSnapshot, projectTemplates } from '~/utils/projectTemplates'
import { validateTheme } from '~/utils/themes'

definePageMeta({ middleware: 'auth' })

const name = ref('')
const slug = ref('')
const subtitle = ref('')
const description = ref('')
const startedStory = ref('')
const motivationStory = ref('')
const objectStory = ref('')
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

  const { data, error } = await supabase.rpc('create_project', {
    p_slug: slugify(slug.value),
    p_name: name.value.trim(),
    p_subtitle: subtitle.value.trim() || null,
    p_description: description.value.trim() || null,
    p_is_public: isPublic.value,
    p_currency_code: currencyCode.value.toUpperCase(),
    p_items_enabled: itemsEnabled.value,
    p_cost_tracking_enabled: itemsEnabled.value && costsEnabled.value,
    p_theme_config: theme.value,
    p_phases: usablePhases.map((phase, index) => ({ name: phase.name.trim(), sortOrder: index }))
  })

  if (error) {
    errorMessage.value = error.message
    busy.value = false
    return
  }

  if (data) {
    const { error: storyError } = await supabase
      .from('projects')
      .update({
        started_story: startedStory.value.trim() || null,
        motivation_story: motivationStory.value.trim() || null,
        object_story: objectStory.value.trim() || null
      })
      .eq('id', data)

    if (storyError) {
      errorMessage.value = `Project created, but its story could not be saved: ${storyError.message}`
      busy.value = false
      return
    }

    if (!currentPhaseKey.value) {
      const { error: currentPhaseError } = await supabase.from('projects').update({ current_phase_id: null }).eq('id', data)
      if (currentPhaseError) { errorMessage.value = `Project created, but its current phase could not be cleared: ${currentPhaseError.message}`; busy.value = false; return }
    } else {
      const selectedIndex = usablePhases.findIndex(phase => phase.key === currentPhaseKey.value)
      if (selectedIndex > 0) {
        const { data: selectedPhase, error: phaseError } = await supabase.from('project_phases').select('id').eq('project_id', data).eq('sort_order', selectedIndex).single()
        if (phaseError) { errorMessage.value = `Project created, but its current phase could not be set: ${phaseError.message}`; busy.value = false; return }
        const selectedPhaseId = selectedPhase?.id
        if (selectedPhaseId) {
          const { error: currentPhaseError } = await supabase.from('projects').update({ current_phase_id: selectedPhaseId }).eq('id', data)
          if (currentPhaseError) { errorMessage.value = `Project created, but its current phase could not be set: ${currentPhaseError.message}`; busy.value = false; return }
        }
      }
    }

    if (heroFile.value) {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        errorMessage.value = 'Project created, but the photo could not be uploaded because your session expired.'
        busy.value = false
        return
      }

      const { data: image, error: reservationError } = await supabase
        .from('project_images')
        .insert({
          project_id: data,
          log_id: null,
          original_file_name: heroFile.value.name,
          media_type: heroFile.value.type || 'image/jpeg',
          byte_size: heroFile.value.size,
          role: 'before',
          caption: `The starting point for ${name.value.trim()}.`,
          sort_order: 0,
          upload_status: 'reserved',
          uploaded_by_user_id: userData.user.id
        })
        .select('id,storage_path')
        .single()

      if (reservationError || !image) {
        errorMessage.value = `Project created, but its photo could not be reserved: ${reservationError?.message || 'Unknown error'}`
        busy.value = false
        return
      }

      const { error: uploadError } = await supabase.storage
        .from('project-originals')
        .upload(image.storage_path, heroFile.value, {
          contentType: heroFile.value.type || 'image/jpeg',
          upsert: false
        })

      if (uploadError) {
        await supabase.from('project_images').update({ upload_status: 'failed' }).eq('id', image.id)
        errorMessage.value = `Project created, but its photo could not be uploaded: ${uploadError.message}`
        busy.value = false
        return
      }

      const { error: readyError } = await supabase
        .from('project_images')
        .update({ upload_status: 'ready' })
        .eq('id', image.id)

      if (readyError) {
        errorMessage.value = `Project and photo were saved, but the upload could not be finalized: ${readyError.message}`
        busy.value = false
        return
      }

      const { error: projectHeroError } = await supabase
        .from('projects')
        .update({ hero_image_id: image.id })
        .eq('id', data)
      if (projectHeroError) {
        errorMessage.value = `Project and photo were saved, but the photo could not be set as the cover: ${projectHeroError.message}`
        busy.value = false
        return
      }
    }

    await navigateTo(`/projects/${slugify(slug.value)}`)
  }
}
</script>

<template>
  <section class="form-card" aria-label="Project starting point">
    <label class="field"><span>Starting point</span><select v-model="templateId" :disabled="busy"><option value="">Start without a template</option><option v-for="template in projectTemplates" :key="template.id" :value="template.id">{{ template.name }}</option></select></label>
    <button class="button button--ghost" type="button" :disabled="busy" @click="applyTemplate">Apply starting point</button>
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
