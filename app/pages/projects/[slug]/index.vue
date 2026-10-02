<script setup lang="ts">
import type {
  Project,
  ProjectImage,
  ProjectLog,
  ProjectMembership,
  LogItemUsageDetail,
  ProjectItemDetail,
  ProjectPhase
} from '~/types/domain'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const loading = ref(true)
const errorMessage = ref('')
const project = ref<Project | null>(null)
const phases = ref<ProjectPhase[]>([])
const logs = ref<ProjectLog[]>([])
const images = ref<Array<ProjectImage & { signedUrl?: string }>>([])
const membership = ref<ProjectMembership | null>(null)
const projectItems = ref<ProjectItemDetail[]>([])
const logItemUsage = ref<LogItemUsageDetail[]>([])
const demoMode = useDemoMode()
const demo = useDemoStore()

const canEdit = computed(() => membership.value?.role === 'owner' || membership.value?.role === 'contributor')
const isOwner = computed(() => membership.value?.role === 'owner')
const currentPhase = computed(() => phases.value.find(phase => phase.id === project.value?.current_phase_id))
const phaseNames = computed(() => new Map(phases.value.map(phase => [phase.id, phase.name])))
const imagesByLog = computed(() => {
  const grouped = new Map<string, Array<ProjectImage & { signedUrl?: string }>>()
  for (const image of images.value) {
    if (!image.log_id) continue
    grouped.set(image.log_id, [...(grouped.get(image.log_id) ?? []), image])
  }
  return grouped
})
const usageByLog = computed(() => {
  const grouped = new Map<string, LogItemUsageDetail[]>()
  for (const usage of logItemUsage.value) grouped.set(usage.log_id, [...(grouped.get(usage.log_id) ?? []), usage])
  return grouped
})
const totalMinutes = computed(() => logs.value.reduce((total, log) => total + (log.duration_minutes ?? 0), 0))
const heroImage = computed(() => images.value.find(image => image.id === project.value?.hero_image_id))
const storyChapters = computed(() => project.value ? [
  {
    number: '01',
    label: 'How it started',
    text: project.value.started_story
  },
  {
    number: '02',
    label: 'Why this build',
    text: project.value.motivation_story
  },
  {
    number: '03',
    label: 'The object before us',
    text: project.value.object_story
  }
] : [])
const hasStory = computed(() => storyChapters.value.some(chapter => chapter.text))
const projectStyle = computed(() => ({
  '--project-background': project.value?.theme_config?.colors?.background || '#f3f0e9',
  '--project-radius': { none: '0px', small: '4px', medium: '14px' }[project.value?.theme_config?.shape?.radius || 'small'],
  '--project-shadow': project.value?.theme_config?.shape?.shadow === 'none' ? 'none' : '8px 8px 0 #00000014',
  '--project-primary': project.value?.theme_config?.colors?.primary || '#123f36',
  '--project-secondary': project.value?.theme_config?.colors?.secondary || '#596b8c',
  '--project-accent': project.value?.theme_config?.colors?.accent || '#e27143',
  '--project-surface': project.value?.theme_config?.colors?.surface || '#fffdf8',
  '--project-border': project.value?.theme_config?.colors?.border || '#d8d6ce',
  '--project-text': project.value?.theme_config?.colors?.text || '#18211e',
  '--project-muted': project.value?.theme_config?.colors?.muted || '#63706b',
  '--project-heading': project.value?.theme_config?.typography?.heading === 'serif' ? 'Georgia, serif' : 'Inter, sans-serif',
  '--project-on-primary': '#ffffff'
}))

async function loadProject() {
  if (demoMode.value) {
    await useLocalAccounts().initialize()
    demo.initialize()
    const data = demo.getProject(slug.value)
    if (!data) {
      errorMessage.value = 'Project not found in this browser.'
      loading.value = false
      return
    }
    project.value = data.project
    phases.value = data.phases
    logs.value = data.logs
    images.value = data.images
    projectItems.value = data.projectItems
    logItemUsage.value = data.logItemUsage
    const local = useLocalAccounts()
    const role = local.role(data.project.id)
    membership.value = role && local.current.value ? { project_id: data.project.id, user_id: local.current.value.id, role } : null
    loading.value = false
    return
  }

  const supabase = useSupabase()
  if (!supabase) {
    errorMessage.value = 'Supabase is not configured.'
    loading.value = false
    return
  }

  loading.value = true
  const { data: projectData, error } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', slug.value)
    .maybeSingle()

  if (error || !projectData) {
    errorMessage.value = error?.message || 'Project not found or not available to you.'
    loading.value = false
    return
  }

  project.value = projectData as Project

  const [{ data: phaseData }, { data: logData }, { data: imageData }, authResult] = await Promise.all([
    supabase.from('project_phases').select('*').eq('project_id', project.value.id).is('archived_at', null).order('sort_order'),
    supabase.from('logs').select('*').eq('project_id', project.value.id).order('work_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('project_images').select('*').eq('project_id', project.value.id).eq('upload_status', 'ready').is('deleted_at', null).order('sort_order'),
    supabase.auth.getUser()
  ])

  phases.value = (phaseData ?? []) as ProjectPhase[]
  logs.value = (logData ?? []) as ProjectLog[]
  const baseImages = (imageData ?? []) as ProjectImage[]

  images.value = await Promise.all(baseImages.map(async image => {
    const { data } = await supabase.storage
      .from('project-originals')
      .createSignedUrl(image.storage_path, 3600)
    return { ...image, signedUrl: data?.signedUrl }
  }))

  if (authResult.data.user) {
    const { data: membershipData } = await supabase
      .from('project_members')
      .select('project_id,user_id,role')
      .eq('project_id', project.value.id)
      .eq('user_id', authResult.data.user.id)
      .maybeSingle()
    membership.value = membershipData as ProjectMembership | null
  }

  if (project.value.items_enabled) {
    const [{ data: itemData, error: itemError }, { data: usageData }] = await Promise.all([
      supabase.from('project_items').select('*,item:items(*)').eq('project_id', project.value.id).order('role'),
      supabase.from('log_item_usage').select('*,projectItem:project_items(*,item:items(*))').eq('project_id', project.value.id)
    ])
    if (itemError) errorMessage.value = itemError.message
    projectItems.value = (itemData ?? []) as ProjectItemDetail[]
    logItemUsage.value = (usageData ?? []) as LogItemUsageDetail[]
  }

  loading.value = false
}

onMounted(loadProject)
</script>

<template>
  <p v-if="loading" class="loading">Opening the workshop…</p>
  <div v-else-if="errorMessage" class="empty-state">
    <h2>Project unavailable</h2>
    <p>{{ errorMessage }}</p>
    <NuxtLink class="button" to="/">Back to projects</NuxtLink>
  </div>
  <div v-else-if="project" class="project-workshop" :class="[`theme--${project.theme_config.preset}`, `project-texture--${project.theme_config.decoration?.texture || 'none'}`, `project-frame--${project.theme_config.decoration?.imageFrame || 'none'}`]" :style="projectStyle">
    <section class="project-work-order">
      <div class="project-work-order__bar">
        <NuxtLink to="/">← Workshop board</NuxtLink>
        <span>Work order // {{ currentPhase?.name || 'Unassigned' }}</span>
      </div>

      <div class="project-work-order__grid">
        <div class="project-work-order__copy">
          <p class="eyebrow">{{ project.is_public ? 'Open workshop record' : 'Private workshop record' }}</p>
          <h1>{{ project.name }}</h1>
          <p class="project-work-order__intro">{{ project.subtitle || project.description }}</p>
          <div class="project-work-order__actions">
            <NuxtLink v-if="canEdit" class="button" :to="`/projects/${project.slug}/logs/new`">+ Quick workshop log</NuxtLink>
            <NuxtLink v-if="isOwner" class="button button--ghost project-work-order__edit" :to="`/projects/${project.slug}/edit`">Edit project</NuxtLink>
            <a class="project-work-order__jump" href="#build-log">View workshop sessions ↓</a>
          </div>
        </div>

        <figure class="project-work-order__visual">
          <img v-if="heroImage?.signedUrl" :src="heroImage.signedUrl" :alt="`Starting point for ${project.name}`">
          <div v-else class="project-work-order__placeholder" aria-hidden="true">{{ project.name.charAt(0) }}</div>
          <figcaption>Starting point // {{ heroImage?.caption || 'Hero image not logged yet' }}</figcaption>
        </figure>
      </div>

      <dl class="project-work-order__stats">
        <div><dt>Current stage</dt><dd>{{ currentPhase?.name || 'Not set' }}</dd></div>
        <div><dt>Sessions logged</dt><dd>{{ logs.length }}</dd></div>
        <div><dt>Workshop time</dt><dd>{{ formatDuration(totalMinutes) }}</dd></div>
        <div><dt>Record</dt><dd>{{ project.is_public ? 'Public' : 'Private' }}</dd></div>
      </dl>
    </section>

    <section class="project-story-section" aria-labelledby="project-story-heading">
      <header class="project-section-marker">
        <span>00</span>
        <div>
          <p class="eyebrow">Project anchor</p>
          <h2 id="project-story-heading">The story</h2>
        </div>
        <p>{{ project.description || 'The reason this object is on the stand.' }}</p>
      </header>

      <div v-if="hasStory" class="project-story-grid">
        <article v-for="chapter in storyChapters" :key="chapter.number" :class="{ 'is-empty': !chapter.text }">
          <span>{{ chapter.number }}</span>
          <h3>{{ chapter.label }}</h3>
          <p>{{ chapter.text || 'This part of the story still needs to be written.' }}</p>
        </article>
      </div>
      <div v-else class="project-story-empty">
        <p>This build has a timeline, but its reason for existing has not been written down yet.</p>
        <small>Capture how it started, why it matters and what the object has already lived through.</small>
      </div>
    </section>

    <section v-if="phases.length" class="project-sequence" aria-labelledby="project-sequence-heading">
      <header class="project-section-marker project-section-marker--compact">
        <span>01</span>
        <div>
          <p class="eyebrow">Build sequence</p>
          <h2 id="project-sequence-heading">Across the bench</h2>
        </div>
      </header>
      <ol class="project-phase-track" aria-label="Project phases">
        <li
          v-for="(phase, index) in phases"
          :key="phase.id"
          :class="{ current: phase.id === project.current_phase_id }"
        >
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          {{ phase.name }}
        </li>
      </ol>
    </section>

    <section v-if="project.items_enabled" class="project-materials-section" aria-labelledby="project-materials-heading">
      <header class="project-section-marker">
        <span>02</span>
        <div>
          <p class="eyebrow">Parts ledger</p>
          <h2 id="project-materials-heading">On the parts counter</h2>
        </div>
        <NuxtLink v-if="canEdit" class="button" :to="`/projects/${project.slug}/materials`">Manage materials</NuxtLink>
      </header>

      <div v-if="projectItems.length" class="parts-ledger">
        <div class="parts-ledger__head"><span>Item</span><span>Role</span><span>Status</span><span v-if="project.cost_tracking_enabled">Cost</span></div>
        <article v-for="entry in projectItems" :key="entry.id" :class="`is-${entry.status || 'unmarked'}`">
          <div><strong>{{ entry.item.name }}</strong><small>{{ entry.item.brand || entry.item.notes || 'Unbranded workshop item' }}</small></div>
          <span>{{ entry.role.replace('_', ' ') }}</span>
          <span class="parts-ledger__stamp">{{ entry.status || 'unmarked' }}</span>
          <strong v-if="project.cost_tracking_enabled">{{ entry.attributed_amount ?? entry.item.purchase_amount ?? '—' }} {{ project.currency_code }}</strong>
        </article>
      </div>
      <div v-else class="parts-ledger-empty">
        <strong>No parts on the counter yet.</strong>
        <span>Add only what helps this build — the BOM stays as light as you want it.</span>
      </div>
    </section>

    <section id="build-log" class="project-log-section" aria-labelledby="project-log-heading">
      <header class="project-section-marker">
        <span>{{ project.items_enabled ? '03' : '02' }}</span>
        <div>
          <p class="eyebrow">Work, in order</p>
          <h2 id="project-log-heading">Workshop sessions</h2>
        </div>
        <NuxtLink v-if="canEdit" class="button" :to="`/projects/${project.slug}/logs/new`">Add a log</NuxtLink>
      </header>

      <div v-if="logs.length" class="timeline project-timeline">
        <LogCard
          v-for="log in logs"
          :key="log.id"
          :log="log"
          :phase-name="log.phase_id ? phaseNames.get(log.phase_id) : undefined"
          :images="imagesByLog.get(log.id)"
          :item-usages="usageByLog.get(log.id)"
          :project-slug="project.slug"
        />
      </div>
      <div v-else class="empty-state">
        <h2>The bench is ready</h2>
        <p>The first Log can be an inspection, a purchase story, or simply a photograph of the starting point.</p>
        <NuxtLink v-if="canEdit" class="button" :to="`/projects/${project.slug}/logs/new`">Add the first log</NuxtLink>
      </div>
    </section>
  </div>
</template>
