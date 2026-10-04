<script setup lang="ts">
import type { Project, ProjectImage, ProjectMembership, ProjectPhase, ThemeConfig } from '~/types/domain'
import type { ProjectEditorPhase } from '~/utils/projectEditor'
import { copyTheme } from '~/utils/projectEditor'
import { collectPages } from '~/utils/workshopFinancials'
import { checkedData } from '~/utils/workshopSaves'
import { validateTheme } from '~/utils/themes'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const slugParam = computed(() => String(route.params.slug))
const project = ref<Project | null>(null)
const loading = ref(true)
const busy = ref(false)
const isOwner = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const currentHeroUrl = ref('')
const heroFile = ref<File | null>(null)
const heroId = ref('')
const heroPreview = ref('')
const name = ref('')
const projectSlug = ref('')
const subtitle = ref('')
const description = ref('')
const startedStory = ref('')
const motivationStory = ref('')
const objectStory = ref('')
const isCompleted = ref(false)
const isPublic = ref(false)
const itemsEnabled = ref(false)
const costsEnabled = ref(false)
const currencyCode = ref('EUR')
const theme = ref<ThemeConfig | null>(null)
const phases = ref<ProjectEditorPhase[]>([])
const currentPhaseKey = ref<string | null>(null)
const demoMode = useDemoMode()
const demo = useDemoStore()

function applyProject(projectData: Project, phaseData: ProjectPhase[], heroUrl = '') {
  project.value = projectData; name.value = projectData.name; projectSlug.value = projectData.slug
  subtitle.value = projectData.subtitle || ''; description.value = projectData.description || ''
  startedStory.value = projectData.started_story || ''; motivationStory.value = projectData.motivation_story || ''; objectStory.value = projectData.object_story || ''
  isCompleted.value = projectData.is_completed; isPublic.value = projectData.is_public; itemsEnabled.value = projectData.items_enabled; costsEnabled.value = projectData.cost_tracking_enabled
  currencyCode.value = projectData.currency_code; theme.value = copyTheme(projectData.theme_config); currentHeroUrl.value = heroUrl
  phases.value = phaseData.map(phase => ({ key: phase.id, id: phase.id, name: phase.name, archived: Boolean(phase.archived_at) }))
  currentPhaseKey.value = projectData.current_phase_id
}

async function loadProject() {
  loading.value = true; isOwner.value = false; errorMessage.value = ''
  try {
    if (demoMode.value) {
      await useLocalAccounts().initialize()
      demo.initialize(); const data = demo.getProject(slugParam.value)
      if (!data) errorMessage.value = 'Project not found in this browser.'
      else { applyProject(data.project, data.phases, data.images.find(image => image.id === data.project.hero_image_id)?.signedUrl || ''); isOwner.value = useLocalAccounts().role(data.project.id) === 'owner' }
      loading.value = false; return
    }
    const supabase = useSupabase(); if (!supabase) return
    const [{ data: projectData, error }, { data: userData }] = await Promise.all([
      supabase.from('projects').select('*').eq('slug', slugParam.value).maybeSingle(), supabase.auth.getUser()
    ])
    if (error || !projectData || !userData.user) { errorMessage.value = error?.message || 'Project unavailable.'; loading.value = false; return }
    const [phaseData, memberResult, imageResult] = await Promise.all([
      collectPages<ProjectPhase>((from, to) => supabase.from('project_phases').select('*', { count: 'exact' }).eq('project_id', projectData.id).order('sort_order').order('id').range(from, to)),
      supabase.from('project_members').select('project_id,user_id,role').eq('project_id', projectData.id).eq('user_id', userData.user.id).maybeSingle(),
      projectData.hero_image_id ? supabase.from('project_images').select('*').eq('id', projectData.hero_image_id).maybeSingle() : Promise.resolve({ data: null, error: null })
    ])
    const membership = checkedData(memberResult) as ProjectMembership | null
    isOwner.value = membership?.role === 'owner'
    let heroUrl = ''
    const image = checkedData(imageResult) as ProjectImage | null
    if (image) heroUrl = (await supabase.storage.from('project-originals').createSignedUrl(image.storage_path, 3600)).data?.signedUrl || ''
    applyProject(projectData as Project, phaseData, heroUrl)
  } catch (cause) { isOwner.value = false; errorMessage.value = cause instanceof Error ? cause.message : 'Could not load the complete project.' }
  finally { loading.value = false }
}

function selectHero(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  if (heroPreview.value) URL.revokeObjectURL(heroPreview.value)
  heroId.value = file ? crypto.randomUUID() : ''; heroFile.value = file; heroPreview.value = file ? URL.createObjectURL(file) : ''
}
function fileAsDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) }) }
async function reserveHero(projectId: string, userId: string) {
  if (!heroFile.value) return null
  const supabase = useSupabase()!
  heroId.value ||= crypto.randomUUID()
  let image = checkedData<Pick<ProjectImage, 'id' | 'storage_path' | 'upload_status'>>(await supabase.from('project_images').select('id,storage_path,upload_status').eq('id', heroId.value).maybeSingle())
  if (!image) image = checkedData<Pick<ProjectImage, 'id' | 'storage_path' | 'upload_status'>>(await supabase.from('project_images').insert({ id: heroId.value, project_id: projectId, log_id: null,
    original_file_name: heroFile.value.name, media_type: heroFile.value.type || 'image/jpeg', byte_size: heroFile.value.size,
    role: 'before', caption: `Current cover for ${name.value.trim()}.`, sort_order: 0, upload_status: 'reserved', uploaded_by_user_id: userId }).select('id,storage_path,upload_status').single())
  if (!image) throw new Error('The new cover could not be reserved.')
  if (image.upload_status === 'ready') return image.id as string
  checkedData(await supabase.from('project_images').update({ upload_status: 'reserved' }).eq('id', image.id).select('id').single())
  const { error: uploadError } = await supabase.storage.from('project-originals').upload(image.storage_path, heroFile.value, { contentType: heroFile.value.type || 'image/jpeg', upsert: false })
  if (uploadError && !(uploadError.statusCode === '409' || uploadError.message === 'The resource already exists')) throw uploadError
  const { error: readyError } = await supabase.from('project_images').update({ upload_status: 'ready' }).eq('id', image.id).select('id').single()
  if (readyError) throw readyError
  return image.id as string
}

async function save() {
  if (busy.value || loading.value || !project.value || !theme.value || !isOwner.value) return
  busy.value = true; errorMessage.value = ''; successMessage.value = ''
  try {
    const invalidTheme = validateTheme(theme.value)
    if (invalidTheme) throw new Error(invalidTheme)
    const cleanSlug = slugify(projectSlug.value)
    const usablePhases = phases.value.filter(phase => phase.name.trim())
    if (!usablePhases.some(phase => !phase.archived)) throw new Error('Keep at least one active project phase.')
    if (heroFile.value && demoMode.value && heroFile.value.size > 2_500_000) throw new Error('The demo cover can be at most 2.5 MB.')
    if (demoMode.value) {
      const heroImage = heroFile.value ? { name: heroFile.value.name, type: heroFile.value.type || 'image/jpeg', size: heroFile.value.size, dataUrl: await fileAsDataUrl(heroFile.value) } : null
      demo.updateProject({ projectId: project.value.id, name: name.value.trim(), slug: cleanSlug, subtitle: subtitle.value.trim() || null,
        description: description.value.trim() || null, startedStory: startedStory.value.trim() || null, motivationStory: motivationStory.value.trim() || null,
        objectStory: objectStory.value.trim() || null, isCompleted: isCompleted.value, isPublic: isPublic.value, itemsEnabled: itemsEnabled.value,
        costsEnabled: itemsEnabled.value && costsEnabled.value, currencyCode: currencyCode.value.toUpperCase(), theme: theme.value, currentPhaseKey: currentPhaseKey.value,
        phases: usablePhases, heroImage })
    } else {
      const supabase = useSupabase()!; const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Your session expired.')
      const heroImageId = await reserveHero(project.value.id, userData.user.id)
      for (const phase of usablePhases) phase.id ||= crypto.randomUUID()
      const selectedPhase = usablePhases.find(phase => phase.key === currentPhaseKey.value)
      const { error } = await supabase.rpc('save_project_record', {
        p_project: { id: project.value.id, slug: cleanSlug, name: name.value.trim(), subtitle: subtitle.value.trim() || null,
          description: description.value.trim() || null, started_story: startedStory.value.trim() || null, motivation_story: motivationStory.value.trim() || null,
          object_story: objectStory.value.trim() || null, current_phase_id: selectedPhase?.id || null,
          hero_image_id: heroImageId || project.value.hero_image_id, is_completed: isCompleted.value, is_public: isPublic.value,
          currency_code: currencyCode.value.toUpperCase(), items_enabled: itemsEnabled.value, cost_tracking_enabled: itemsEnabled.value && costsEnabled.value,
          theme_config: theme.value },
        p_phases: usablePhases.map((phase, index) => ({ id: phase.id, name: phase.name.trim(), archived: phase.archived, sort_order: index }))
      })
      if (error) throw error
    }
    await navigateTo(`/projects/${cleanSlug}`)
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : 'The project could not be updated.' }
  finally { busy.value = false }
}

onMounted(loadProject)
onBeforeUnmount(() => { if (heroPreview.value) URL.revokeObjectURL(heroPreview.value) })
</script>

<template>
  <p v-if="loading" class="loading">Opening the project ledger…</p>
  <div v-else-if="!project || !isOwner" class="empty-state"><h2>Owner access required</h2><button v-if="errorMessage" type="button" class="button" @click="loadProject">Try again</button><p>{{ errorMessage || 'Only the project owner can change the project record.' }}</p><NuxtLink class="button" :to="`/projects/${slugParam}`">Back to project</NuxtLink></div>
  <ProjectRecordForm
    v-else-if="theme"
    v-model:name="name" v-model:project-slug="projectSlug" v-model:subtitle="subtitle" v-model:description="description"
    v-model:started-story="startedStory" v-model:motivation-story="motivationStory" v-model:object-story="objectStory"
    v-model:is-completed="isCompleted" v-model:is-public="isPublic" v-model:items-enabled="itemsEnabled" v-model:costs-enabled="costsEnabled"
    v-model:currency-code="currencyCode" v-model:theme="theme" v-model:phases="phases" v-model:current-phase-key="currentPhaseKey"
    :project-id="project.id" mode="edit" :back-to="`/projects/${slugParam}`" :back-label="project.name" :current-hero-url="currentHeroUrl"
    :hero-preview="heroPreview" :busy="busy" :error-message="errorMessage" :success-message="successMessage"
    @hero-selected="selectHero" @submit="save"
  />
</template>
