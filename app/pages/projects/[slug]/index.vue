<script setup lang="ts">
import { collectPages } from '~/utils/workshopFinancials'
import { checkedData } from '~/utils/workshopSaves'
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
const { loadAuthors, authorName } = useLogAuthors()

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
const projectStyle = computed(() => projectThemeStyle(project.value?.theme_config))

async function loadProject() {
  loading.value = true; errorMessage.value = ''; membership.value = null
  try {
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
      await loadAuthors(data.logs)
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

    const [phaseData, logData, baseImages, authResult] = await Promise.all([
      collectPages<ProjectPhase>((from, to) => supabase.from('project_phases').select('*', { count: 'exact' }).eq('project_id', project.value!.id).order('sort_order').order('id').range(from, to)),
      collectPages<ProjectLog>((from, to) => supabase.from('logs').select('*', { count: 'exact' }).eq('project_id', project.value!.id).order('work_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to)),
      collectPages<ProjectImage>((from, to) => supabase.from('project_images').select('*', { count: 'exact' }).eq('project_id', project.value!.id).eq('upload_status', 'ready').is('deleted_at', null).order('sort_order').order('id').range(from, to)),
      supabase.auth.getUser()
    ])
    if (authResult.error && authResult.error.name !== 'AuthSessionMissingError') throw new Error(authResult.error.message)
    phases.value = phaseData; logs.value = logData
    await loadAuthors(logData)
    images.value = await Promise.all(baseImages.map(async image => {
      const result = await supabase.storage
        .from('project-originals')
        .createSignedUrl(image.storage_path, 3600)
      const signed = checkedData(result)
      if (!signed?.signedUrl) throw new Error('Could not load the original photo.')
      return { ...image, signedUrl: signed.signedUrl }
    }))

    if (authResult.data.user) {
      const memberResult = await supabase
        .from('project_members')
        .select('project_id,user_id,role')
        .eq('project_id', project.value.id)
        .eq('user_id', authResult.data.user.id)
        .maybeSingle()
      membership.value = checkedData(memberResult) as ProjectMembership | null
    }

    if (project.value.items_enabled) {
      const [itemData, usageData] = await Promise.all([
        collectPages<ProjectItemDetail>((from, to) => supabase.from('project_items').select('*,item:items(*)', { count: 'exact' }).eq('project_id', project.value!.id).order('id').range(from, to)),
        collectPages<LogItemUsageDetail>((from, to) => supabase.from('log_item_usage').select('*,projectItem:project_items(*,item:items(*))', { count: 'exact' }).eq('project_id', project.value!.id).order('id').range(from, to))
      ])
      projectItems.value = itemData; logItemUsage.value = usageData
    }

  } catch (cause) { project.value = null; errorMessage.value = cause instanceof Error ? cause.message : 'Could not load the complete project.' }
  finally { loading.value = false }
}

onMounted(loadProject)
</script>

<template>
  <p v-if="loading" class="loading">Opening the workshop…</p>
  <div v-else-if="errorMessage" class="empty-state">
    <h2>Project unavailable</h2>
    <p>{{ errorMessage }}</p>
    <button type="button" class="button" @click="loadProject">Try again</button>
    <NuxtLink class="button" to="/">Back to projects</NuxtLink>
  </div>
  <div v-else-if="project" class="project-workshop" :class="[`project-texture--${project.theme_config.decoration?.texture || 'none'}`, `project-frame--${project.theme_config.decoration?.imageFrame || 'none'}`]" :style="projectStyle">
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
            <NuxtLink class="button button--ghost" :to="`/projects/${project.slug}/specs`">Specifications</NuxtLink>
            <NuxtLink v-if="isOwner" class="button button--ghost" :to="`/projects/${project.slug}/theme`">Theme Workshop</NuxtLink>
            <NuxtLink v-if="isOwner" class="button button--ghost project-work-order__edit" :to="`/projects/${project.slug}/edit`">Edit project</NuxtLink>
            <a class="project-work-order__jump" href="#build-log">View workshop sessions ↓</a>
            <a class="project-work-order__jump" href="#project-workshop-notes">Join the bench ↓</a>
          </div>
          <CopyProjectTheme v-if="!isOwner" :key="project.id" :theme="project.theme_config" :project-name="project.name" />
        </div>

        <figure class="project-work-order__visual">
          <img v-if="heroImage?.signedUrl" :src="heroImage.signedUrl" :alt="`Starting point for ${project.name}`">
          <div v-else class="project-work-order__placeholder" aria-hidden="true">{{ project.name.charAt(0) }}</div>
          <figcaption>Starting point // {{ heroImage?.caption || 'Hero image not logged yet' }}</figcaption>
        </figure>
      </div>

      <dl class="project-work-order__stats">
        <div><dt>Build status</dt><dd>{{ project.is_completed ? 'Completed' : 'In progress' }}</dd></div>
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

    <section v-if="images.some(image => !image.log_id)" class="project-photo-archive">
      <h2>Project photo archive</h2>
      <div class="photo-grid"><figure v-for="image in images.filter(image => !image.log_id)" :key="image.id"><img :src="image.signedUrl" :alt="image.caption || 'Project photo'"><figcaption>{{ image.caption || image.role }}</figcaption></figure></div>
    </section>
    <ProjectFinancials v-if="project.cost_tracking_enabled" :items="projectItems" :usages="logItemUsage" :currency="project.currency_code" />
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
          <strong v-if="project.cost_tracking_enabled">{{ entry.attributed_amount ?? '—' }} {{ project.currency_code }}</strong>
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
          :author-name="authorName(log)"
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
    <WorkshopSocial id="project-workshop-notes" :project-id="project.id" />
  </div>
</template>
