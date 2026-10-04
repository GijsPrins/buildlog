<script setup lang="ts">
import { collectPages, collectInBatches } from '~/utils/workshopFinancials'
import type { Project, ProjectImage, ProjectLog, ProjectPhase, ProjectSummary } from '~/types/domain'

const configured = useSupabaseConfigured()
const demoMode = useDemoMode()
const demo = useDemoStore()
const loading = ref(configured)
const errorMessage = ref('')
const projects = ref<ProjectSummary[]>(demoMode.value ? demo.listProjects() : [])
const quickProjectSlug = ref('')
const { user, initialize } = useAuth()

const isCompleted = (project: ProjectSummary) => project.is_completed
const activeProjects = computed(() => projects.value.filter(project => !isCompleted(project)))
const completedProjects = computed(() => projects.value.filter(isCompleted))
const totalMinutes = computed(() => projects.value.reduce((total, project) => total + (project.totalMinutes ?? 0), 0))
const totalSessions = computed(() => projects.value.reduce((total, project) => total + (project.logCount ?? 0), 0))
const canLog = computed(() => Boolean(user.value))
const writableProjectIds = ref<string[]>([])
const writableProjects = computed(() => projects.value.filter(project => demoMode.value ? useLocalAccounts().canWrite(project.id) : writableProjectIds.value.includes(project.id)))
const quickProjects = computed(() => { const active = writableProjects.value.filter(project => !isCompleted(project)); return active.length ? active : writableProjects.value })

watch(user, () => { if (demoMode.value) projects.value = demo.listProjects() })

watch(quickProjects, current => {
  if (!current.some(project => project.slug === quickProjectSlug.value)) {
    quickProjectSlug.value = current[0]?.slug ?? ''
  }
}, { immediate: true })

function projectStyle(project: ProjectSummary) {
  return {
    ...projectThemeStyle(project.theme_config),
    '--stand-primary': project.theme_config.colors.primary,
    '--stand-secondary': project.theme_config.colors.secondary,
    '--stand-accent': project.theme_config.colors.accent,
    '--stand-surface': project.theme_config.colors.surface,
    '--stand-ink': project.theme_config.colors.text
  }
}

async function startQuickLog() {
  if (!quickProjectSlug.value) return
  await navigateTo(`/projects/${quickProjectSlug.value}/logs/new`)
}

let generation = 0
async function loadProjects() {
  const request = ++generation
  const userId = user.value?.id
  try {
    if (demoMode.value) {
      demo.initialize()
      projects.value = demo.listProjects()
      loading.value = false
      return
    }

    const supabase = useSupabase()
    if (!supabase) {
      loading.value = false
      return
    }

    loading.value = true
    errorMessage.value = ''

    const baseProjects = await collectPages<Project>((from, to) => supabase.from('projects').select('*', { count: 'exact' }).order('updated_at', { ascending: false }).order('id').range(from, to))
    let writableIds: string[] = []
    if (userId) {
      const memberships = await collectPages<{ project_id: string }>((from, to) => supabase.from('project_members').select('project_id', { count: 'exact' }).eq('user_id', userId).in('role', ['owner', 'contributor']).order('project_id').range(from, to))
      writableIds = memberships.map(entry => entry.project_id)
    }
    if (request !== generation) return
    if (!baseProjects.length) {
      projects.value = []
      loading.value = false
      return
    }

    const projectIds = baseProjects.map(project => project.id)
    const phaseIds = baseProjects.flatMap(project => project.current_phase_id ? [project.current_phase_id] : [])
    const heroImageIds = baseProjects.flatMap(project => project.hero_image_id ? [project.hero_image_id] : [])
    const [logs, phases, heroImages] = await Promise.all([
      collectInBatches<Pick<ProjectLog, 'project_id' | 'duration_minutes'>>(projectIds, ids => collectPages((from, to) => supabase.from('logs').select('project_id,duration_minutes', { count: 'exact' }).in('project_id', ids).order('id').range(from, to))),
      collectInBatches<Pick<ProjectPhase, 'id' | 'name'>>(phaseIds, ids => collectPages((from, to) => supabase.from('project_phases').select('id,name', { count: 'exact' }).in('id', ids).order('id').range(from, to))),
      collectInBatches<Pick<ProjectImage, 'id' | 'storage_path'>>(heroImageIds, ids => collectPages((from, to) => supabase.from('project_images').select('id,storage_path', { count: 'exact' }).in('id', ids).eq('upload_status', 'ready').is('deleted_at', null).order('id').range(from, to)))
    ])
    const signedHeroes = new Map<string, string>()

    await Promise.all(heroImages.map(async image => {
      const { data: signed } = await supabase.storage.from('project-originals').createSignedUrl(image.storage_path, 3600)
      if (signed?.signedUrl) signedHeroes.set(image.id, signed.signedUrl)
    }))

    if (request !== generation) return
    writableProjectIds.value = writableIds
    projects.value = baseProjects.map(project => {
      const projectLogs = logs.filter(log => log.project_id === project.id)
      return {
        ...project,
        currentPhase: phases.find(phase => phase.id === project.current_phase_id)?.name ?? null,
        logCount: projectLogs.length,
        totalMinutes: projectLogs.reduce((total, log) => total + (log.duration_minutes ?? 0), 0),
        heroImageUrl: project.hero_image_id ? signedHeroes.get(project.hero_image_id) ?? null : null
      }
    })
  } catch (cause) { if (request === generation) { projects.value = []; errorMessage.value = cause instanceof Error ? cause.message : 'Could not load all projects.' } }
  finally { if (request === generation) loading.value = false }
}

onMounted(async () => {
  await initialize()
  await loadProjects()
})

watch(() => user.value?.id, () => loadProjects())
</script>

<template>
  <div class="workshop-home">
    <header class="workshop-board-header">
      <div>
        <p class="workshop-kicker"><span aria-hidden="true" /> Workshop board</p>
        <h1>On the Stand</h1>
        <p>{{ activeProjects.length }} builds currently taking up bench space.</p>
      </div>

      <form v-if="canLog && quickProjects.length" class="quick-log" @submit.prevent="startQuickLog">
        <label for="quick-project">Quick capture</label>
        <div class="quick-log__controls">
          <select id="quick-project" v-model="quickProjectSlug" aria-label="Project for quick workshop log">
            <option v-for="project in quickProjects" :key="project.id" :value="project.slug">
              {{ project.name }}
            </option>
          </select>
          <button class="button quick-log__button" type="submit">+ Quick Workshop Log</button>
        </div>
      </form>
      <NuxtLink v-else-if="!canLog" class="button" to="/login">Sign in to log work</NuxtLink>
    </header>

    <section class="workshop-stats" aria-label="Workshop totals">
      <article><strong>{{ activeProjects.length }}</strong><span>Active {{ activeProjects.length === 1 ? 'project' : 'projects' }}</span></article>
      <article><strong>{{ totalMinutes ? formatDuration(totalMinutes) : '0h' }}</strong><span>Spent in workshop</span></article>
      <article><strong>{{ totalSessions }}</strong><span>{{ totalSessions === 1 ? 'Session' : 'Sessions' }} logged</span></article>
    </section>

    <p v-if="loading" class="loading">Opening the workshop…</p>
    <p v-else-if="errorMessage" class="form-error">{{ errorMessage }}</p>

    <section v-else class="stand-section" aria-labelledby="stand-heading">
      <div class="status-heading">
        <div>
          <span class="status-heading__number">01</span>
          <div><p>Work in progress</p><h2 id="stand-heading">On the Stand</h2></div>
        </div>
        <NuxtLink v-if="canLog" to="/projects/new">+ New build</NuxtLink>
      </div>

      <div v-if="activeProjects.length" class="stand-grid">
        <NuxtLink
          v-for="project in activeProjects"
          :key="project.id"
          class="stand-project"
          :class="`project-texture--${project.theme_config.decoration.texture}`"
          :style="projectStyle(project)"
          :to="`/projects/${project.slug}`"
        >
          <div class="stand-project__image">
            <img v-if="project.heroImageUrl" :src="project.heroImageUrl" :alt="project.name">
            <span v-else class="stand-project__initial">{{ project.name.slice(0, 1) }}</span>
            <span class="stand-project__clamp" aria-hidden="true" />
            <span class="stand-project__phase">{{ project.currentPhase || 'Bench ready' }}</span>
          </div>
          <div class="stand-project__body">
            <p>{{ project.theme_config.preset.replaceAll('-', ' ') }}</p>
            <h3>{{ project.name }}</h3>
            <span>{{ project.subtitle || project.description }}</span>
            <dl>
              <div><dt>Sessions</dt><dd>{{ project.logCount ?? 0 }}</dd></div>
              <div><dt>Bench time</dt><dd>{{ formatDuration(project.totalMinutes) }}</dd></div>
              <div><dt>Updated</dt><dd>{{ formatProjectDate(project.updated_at) }}</dd></div>
            </dl>
            <strong class="stand-project__open">Open build <span aria-hidden="true">→</span></strong>
          </div>
        </NuxtLink>
      </div>

      <div v-else class="empty-state">
        <h2>The stands are clear</h2><p>Start a new build or pull something back out of the vault.</p>
        <NuxtLink v-if="canLog" class="button" to="/projects/new">Start a project</NuxtLink>
      </div>
    </section>

    <section class="vault-section" aria-labelledby="vault-heading">
      <div class="status-heading status-heading--quiet">
        <div>
          <span class="status-heading__number">02</span>
          <div><p>Finished builds</p><h2 id="vault-heading">In the Vault</h2></div>
        </div>
        <span>{{ completedProjects.length }} completed</span>
      </div>

      <div v-if="completedProjects.length" class="vault-grid">
        <NuxtLink v-for="project in completedProjects" :key="project.id" :to="`/projects/${project.slug}`">
          <img v-if="project.heroImageUrl" :src="project.heroImageUrl" alt="">
          <div><strong>{{ project.name }}</strong><span>{{ formatDuration(project.totalMinutes) }} · {{ project.logCount }} sessions</span></div>
        </NuxtLink>
      </div>
      <div v-else class="vault-empty"><span aria-hidden="true">—</span><p>Nothing finished yet. Good workshops are rarely tidy.</p></div>
    </section>
  </div>
</template>
