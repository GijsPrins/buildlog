<script setup lang="ts">
import { collectPages } from '~/utils/workshopFinancials'
import { checkedData, saveWorkshopLog } from '~/utils/workshopSaves'
import type { ImageRole, Project, ProjectItemDetail, ProjectItemStatus, ProjectMembership, ProjectPhase } from '~/types/domain'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const nuxtApp = useNuxtApp()
const auth = useAuth()
const discardDraft = ref(false)
const draftOwner = ref('')
const slug = computed(() => String(route.params.slug))
const project = ref<Project | null>(null)
const phases = ref<ProjectPhase[]>([])
const projectItems = ref<ProjectItemDetail[]>([])
const selectedItems = ref<Record<string, boolean>>({})
const itemAmounts = ref<Record<string, number | null>>({})
const itemCosts = ref<Record<string, number | null>>({})
const itemNotes = ref<Record<string, string>>({})
const itemStatuses = ref<Record<string, ProjectItemStatus | ''>>({})
const title = ref('')
const phaseId = ref('')
const workDate = ref(todayIso())
const durationHours = ref<number | null>(null)
const durationMinutes = ref<number | null>(null)
const summary = ref('')
const content = ref('')
const observations = ref<Array<{ finding: string; decision: string }>>([{ finding: '', decision: '' }])
const { photos, files, selectFiles, removeFile } = useLogPhotos()
const logId = ref('')
const stableLogSlug = ref('')
const busy = ref(false)
const loading = ref(true)
const errorMessage = ref('')
const uploadProgress = ref<string[]>([])
const canEdit = ref(false)
const demoMode = useDemoMode()
const demo = useDemoStore()
const selectedPhase = computed(() => phases.value.find(phase => phase.id === phaseId.value))
const durationLabel = computed(() => {
  const minutes = Math.max(0, (durationHours.value ?? 0) * 60 + (durationMinutes.value ?? 0))
  return minutes ? formatDuration(minutes) : 'Not timed'
})
const projectStyle = computed(() => projectThemeStyle(project.value?.theme_config))

async function loadProject() {
  loading.value = true; canEdit.value = false; errorMessage.value = ''
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
    projectItems.value = data.projectItems
    phaseId.value = data.project.current_phase_id || data.phases[0]?.id || ''
    canEdit.value = useLocalAccounts().canWrite(data.project.id)
    loading.value = false
    restoreDraft()
    return
  }

  try {
    const supabase = useSupabase()!
    const { data: userData, error: authError } = await supabase.auth.getUser()
    if (authError || !userData.user) throw new Error('Your session expired. Sign in again.')
    const data = checkedData(await supabase.from('projects').select('*').eq('slug', slug.value).maybeSingle()) as Project | null
    if (!data) throw new Error('Project unavailable.')
    const [phaseData, membershipData, itemData] = await Promise.all([
      collectPages<ProjectPhase>((from, to) => supabase.from('project_phases').select('*', { count: 'exact' }).eq('project_id', data.id).is('archived_at', null).order('sort_order').order('id').range(from, to)),
      supabase.from('project_members').select('project_id,user_id,role').eq('project_id', data.id).eq('user_id', userData.user.id).maybeSingle(),
      data.items_enabled ? collectPages<ProjectItemDetail>((from, to) => supabase.from('project_items').select('*,item:items(*)', { count: 'exact' }).eq('project_id', data.id).order('id').range(from, to)) : Promise.resolve([])
    ])
    const member = checkedData(membershipData) as ProjectMembership | null
    project.value = data; phases.value = phaseData; projectItems.value = itemData
    phaseId.value = data.current_phase_id || phaseData[0]?.id || ''
    canEdit.value = member?.role === 'owner' || member?.role === 'contributor'
    if (!canEdit.value) errorMessage.value = 'You have read-only access to this Project.'
  } catch (cause) { canEdit.value = false; errorMessage.value = cause instanceof Error ? cause.message : 'Could not load the complete project. Please retry.' }
  finally { loading.value = false }
  if (canEdit.value) restoreDraft()
}

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

async function saveDemoLog() {
  if (!project.value) return
  const totalBytes = files.value.reduce((total, file) => total + file.size, 0)
  if (totalBytes > 2_500_000) {
    throw new Error('Demo photos can use at most 2.5 MB in total because they are stored in this browser.')
  }
  const demoImages = []
  for (const [index, file] of files.value.entries()) {
    uploadProgress.value[index] = `Saving ${file.name} locally…`
    demoImages.push({ name: file.name, type: file.type || 'image/jpeg', size: file.size, role: photos.value[index]!.role, caption: photos.value[index]!.caption.trim() || null, dataUrl: await fileAsDataUrl(file) })
  }
  const duration = Math.max(0, (durationHours.value ?? 0) * 60 + (durationMinutes.value ?? 0)) || null
  demo.addLog({
    projectId: project.value.id,
    phaseId: phaseId.value || null,
    title: title.value.trim(),
    workDate: workDate.value,
    durationMinutes: duration,
    summary: summary.value.trim(),
    content: content.value.trim(),
    findingDecisions: normalizeFindings(observations.value),
    imageRole: 'gallery',
    images: demoImages,
    itemUsage: projectItems.value.filter(entry => selectedItems.value[entry.id]).map(entry => ({
      projectItemId: entry.id, usageAmount: optionalAmount(itemAmounts.value[entry.id]), usageCost: project.value?.cost_tracking_enabled ? optionalAmount(itemCosts.value[entry.id]) : null,
      note: itemNotes.value[entry.id]?.trim() || null, statusAfter: itemStatuses.value[entry.id] || null
    }))
  })
}

async function submit() {
  if (busy.value || loading.value || !project.value || !canEdit.value) return
  busy.value = true; errorMessage.value = ''; uploadProgress.value = []
  try {
    if (demoMode.value) await saveDemoLog()
    else {
      logId.value ||= crypto.randomUUID()
      stableLogSlug.value ||= `${slugify(title.value)}-${workDate.value}-${logId.value.slice(0, 8)}`
      const duration = Math.max(0, (durationHours.value ?? 0) * 60 + (durationMinutes.value ?? 0)) || null
      await saveWorkshopLog(useSupabase()!, {
        log: { id: logId.value, create: true, project_id: project.value.id, phase_id: phaseId.value || null,
          slug: stableLogSlug.value, title: title.value.trim(), work_date: workDate.value, duration_minutes: duration,
          summary: summary.value.trim(), content: content.value.trim(), finding_decisions: normalizeFindings(observations.value) },
        usage: project.value.items_enabled ? projectItems.value.filter(entry => selectedItems.value[entry.id]).map(entry => ({
          project_item_id: entry.id, usage_amount: optionalAmount(itemAmounts.value[entry.id]),
          usage_cost: project.value!.cost_tracking_enabled ? optionalAmount(itemCosts.value[entry.id]) : null,
          note: itemNotes.value[entry.id]?.trim() || null, status_after: itemStatuses.value[entry.id] || null
        })) : null,
        imageEdits: [], photos: photos.value
      }, (index, text) => { uploadProgress.value[index] = text })
    }
    discardDraft.value = true
    await navigateTo(`/projects/${slug.value}`)
  } catch (cause) { errorMessage.value = cause instanceof Error ? cause.message : 'The session could not be saved. Retry safely.' }
  finally { busy.value = false }
}

function draftStore() {
  return logDrafts(nuxtApp, draftOwner.value, slug.value)
}

onBeforeRouteLeave(() => {
  if (!draftOwner.value) return
  if (discardDraft.value || auth.user.value?.id !== draftOwner.value) { draftStore().clear(); return }
  draftStore().save({
    logId: logId.value, logSlug: stableLogSlug.value, title: title.value, phaseId: phaseId.value, workDate: workDate.value,
    durationHours: durationHours.value, durationMinutes: durationMinutes.value,
    summary: summary.value, content: content.value, finding: '', decision: '', findingDecisions: observations.value.map(entry => ({ ...entry })),
    selectedItems: { ...selectedItems.value }, itemAmounts: { ...itemAmounts.value }, itemCosts: { ...itemCosts.value },
    itemNotes: { ...itemNotes.value }, itemStatuses: { ...itemStatuses.value },
    photos: photos.value.map(({ id, file, caption, role }) => ({ id, file, caption, role }))
  })
})

function restoreDraft() {
  if (!draftOwner.value || !canEdit.value) return
  const draft = draftStore().take()
  if (!draft) return
  logId.value = draft.logId || ''; stableLogSlug.value = draft.logSlug || ''
  title.value = draft.title; phaseId.value = draft.phaseId; workDate.value = draft.workDate
  durationHours.value = draft.durationHours; durationMinutes.value = draft.durationMinutes
  summary.value = draft.summary; content.value = draft.content; observations.value = draft.findingDecisions?.map(entry => ({ ...entry })) || [{ finding: draft.finding, decision: draft.decision }]
  selectedItems.value = draft.selectedItems; itemAmounts.value = draft.itemAmounts; itemCosts.value = draft.itemCosts ?? {}
  itemNotes.value = draft.itemNotes; itemStatuses.value = draft.itemStatuses
  photos.value = draft.photos.map(photo => ({ ...photo, id: photo.id || crypto.randomUUID(), preview: URL.createObjectURL(photo.file) }))
}

onMounted(async () => {
  await auth.initialize()
  draftOwner.value = auth.user.value?.id || ''
  await loadProject()
})
</script>

<template>
  <p v-if="loading" class="loading">Preparing a new Log…</p>
  <div v-else class="session-builder" :style="projectStyle">
    <div v-if="!canEdit" class="empty-state">
      <h2>Read-only Project</h2>
      <p>{{ errorMessage }}</p><button type="button" class="button button--ghost" @click="loadProject">Try again</button>
      <NuxtLink class="button" :to="`/projects/${slug}`">Back to the Project</NuxtLink>
    </div>

    <form v-else class="session-form" @submit.prevent="submit">
      <div class="session-form__bar">
        <NuxtLink :to="`/projects/${slug}`">← {{ project?.name }}</NuxtLink>
        <strong>FORM WL-01</strong>
        <span>Workshop session // {{ selectedPhase?.name || 'Unassigned' }}</span>
      </div>

      <section class="session-lead">
        <div class="session-lead__copy">
          <p class="eyebrow">Capture it while it is still on the bench</p>
          <label class="sr-only" for="title">What did you do?</label>
          <textarea id="title" v-model="title" class="session-title-input" required placeholder="What happened in the workshop?" @keydown.enter.prevent />
          <label class="sr-only" for="summary">Short summary</label>
          <textarea id="summary" v-model="summary" class="session-summary-input" placeholder="The one thing worth remembering from this session…" />
          <p class="session-lead__nudge">A title and one photo already make a useful log. Add detail only while it helps.</p>
        </div>

        <div class="session-photo-board">
          <input id="photos" class="sr-only" type="file" accept="image/*" multiple :disabled="busy" @change="selectFiles">
          <div class="log-photo-list">
            <LogPhotoEditor v-for="(photo, index) in photos" :key="photo.preview" v-model:caption="photo.caption" v-model:role="photo.role" :src="photo.preview" :name="photo.file.name" :disabled="busy" @remove="removeFile(index)" />
          </div>
          <label class="session-photo-add" for="photos">{{ photos.length ? '+ Add more photos' : '+ Add workshop photos' }}</label>
          <div class="session-photo-options"><small>{{ demoMode ? 'Stored in this browser · 2.5 MB total maximum' : 'Originals are stored unchanged' }}</small></div>
        </div>
      </section>

      <div class="session-meta-strip">
        <div>
          <label for="phase">Stage</label>
          <select id="phase" v-model="phaseId">
            <option value="">No phase</option>
            <option v-for="phase in phases" :key="phase.id" :value="phase.id">{{ phase.name }}</option>
          </select>
        </div>
        <div>
          <label for="date">Workshop date</label>
          <input id="date" v-model="workDate" type="date" required>
        </div>
        <div class="session-duration">
          <span>Time on the bench</span>
          <label><span class="sr-only">Hours</span><input id="hours" v-model.number="durationHours" type="number" min="0" inputmode="numeric" placeholder="0"><small>h</small></label>
          <label><span class="sr-only">Minutes</span><input id="minutes" v-model.number="durationMinutes" type="number" min="0" max="59" inputmode="numeric" placeholder="00"><small>m</small></label>
        </div>
        <div class="session-meta-strip__readout"><span>Session total</span><strong>{{ durationLabel }}</strong></div>
      </div>

      <section v-if="project?.items_enabled" class="session-parts" aria-labelledby="session-parts-title">
        <header class="builder-section-heading">
          <span>01</span>
          <div><p class="eyebrow">Issue from stores</p><h2 id="session-parts-title">Parts used</h2></div>
          <p>Tick only what touched the bench today. This turns the BOM into a history, not admin.</p>
        </header>
        <div v-if="projectItems.length" class="session-parts__grid">
          <article v-for="entry in projectItems" :key="entry.id" :class="{ 'is-selected': selectedItems[entry.id] }">
            <label class="session-parts__check"><input v-model="selectedItems[entry.id]" type="checkbox"><span><strong>{{ entry.item.name }}</strong><small>{{ entry.item.brand || entry.role.replace('_', ' ') }} · {{ entry.status || 'unmarked' }}</small></span></label>
            <div v-if="selectedItems[entry.id]" class="session-parts__detail session-parts__detail--status">
              <label><span>Qty / amount</span><input v-model.number="itemAmounts[entry.id]" min="0" step="0.01" type="number" placeholder="1"></label>
              <label v-if="project?.cost_tracking_enabled"><span>Usage cost ({{ project.currency_code }})</span><input v-model.number="itemCosts[entry.id]" min="0" step="0.01" type="number" placeholder="Not recorded"></label>
              <label><span>Note</span><input v-model="itemNotes[entry.id]" placeholder="Installed, tested, partly used…"></label>
              <label><span>After this session</span><select v-model="itemStatuses[entry.id]"><option value="">Keep {{ entry.status || 'status' }}</option><option value="installed">Installed</option><option value="used">Used</option><option value="removed">Removed</option></select></label>
            </div>
          </article>
        </div>
        <p v-else class="session-parts__empty">Nothing is in the parts ledger yet.</p>
        <NuxtLink :to="{ path: `/projects/${slug}/materials`, query: { returnTo: 'new-log' } }">Add items to the parts ledger →</NuxtLink>
      </section>

      <section class="session-notes" aria-labelledby="session-notes-title">
        <header class="builder-section-heading">
          <span>{{ project?.items_enabled ? '02' : '01' }}</span>
          <div><p class="eyebrow">Leave a trail</p><h2 id="session-notes-title">Workshop notes</h2></div>
          <p>Write for your future self: order of work, tools, measurements and anything that will save time next session.</p>
        </header>
        <label class="sr-only" for="content">Workshop notes</label>
        <textarea id="content" v-model="content" class="session-notes-input" placeholder="What did you try? What came apart easily? What needs another look?" />
      </section>

      <section class="session-decisions" aria-labelledby="session-decisions-title">
        <header class="builder-section-heading builder-section-heading--compact">
          <span>{{ project?.items_enabled ? '03' : '02' }}</span>
          <div><p class="eyebrow">Turn observation into progress</p><h2 id="session-decisions-title">Findings &amp; decisions</h2></div>
        </header>
        <FindingDecisionEditor v-model="observations" :disabled="busy" />
      </section>

      <ul v-if="files.length && uploadProgress.length" class="upload-list session-upload-progress">
        <li v-for="(file, index) in files" :key="`${file.name}-${file.size}`"><span>{{ file.name }}</span><span>{{ uploadProgress[index] || `${Math.ceil(file.size / 1024)} KB` }}</span></li>
      </ul>
      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
      <footer class="builder-submit session-submit">
        <div><p class="eyebrow">Session ready</p><strong>{{ files.length ? `${files.length} photo${files.length === 1 ? '' : 's'} on the bench` : 'A log can start with words alone.' }}</strong></div>
        <div><NuxtLink class="button button--ghost" :to="`/projects/${slug}`" @click="discardDraft = true">Cancel</NuxtLink><button class="button" type="submit" :disabled="busy">{{ busy ? 'Saving workshop session…' : 'Add session to the build →' }}</button></div>
      </footer>
    </form>
  </div>
</template>
