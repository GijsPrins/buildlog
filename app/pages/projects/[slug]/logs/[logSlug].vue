<script setup lang="ts">
import type { ImageRole, LogItemUsageDetail, Project, ProjectImage, ProjectItemDetail, ProjectItemStatus, ProjectLog, ProjectMembership, ProjectPhase } from '~/types/domain'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const logSlug = computed(() => String(route.params.logSlug))
const project = ref<Project | null>(null)
const log = ref<ProjectLog | null>(null)
const phases = ref<ProjectPhase[]>([])
const images = ref<Array<ProjectImage & { signedUrl?: string }>>([])
const projectItems = ref<ProjectItemDetail[]>([])
const usage = ref<LogItemUsageDetail[]>([])
const canEdit = ref(false)
const editing = ref(route.query.edit === '1')
const loading = ref(true)
const busy = ref(false)
const errorMessage = ref('')

const deleting = ref(false)
const deleteConfirmation = ref('')
const deletionConfirmed = computed(() => Boolean(log.value) && deleteConfirmation.value.trim().toLowerCase() === log.value!.title.trim().toLowerCase())
async function deleteLog() {
  if (!log.value || !canEdit.value || !deletionConfirmed.value) return
  busy.value = true; errorMessage.value = ''
  try {
    if (demoMode.value) demo.deleteLog(log.value.id)
    else {
      const { error } = await useSupabase()!.from('logs').delete().eq('id', log.value.id).eq('project_id', project.value!.id).select('id').single()
      if (error) throw error
    }
    await navigateTo(`/projects/${slug.value}`)
  } catch (cause) { errorMessage.value = cause instanceof Error ? cause.message : 'Could not delete log.' }
  finally { busy.value = false }
}

const title = ref('')
const phaseId = ref('')
const workDate = ref('')
const durationHours = ref<number | null>(null)
const durationMinutes = ref<number | null>(null)
const summary = ref('')
const content = ref('')
const observations = ref<Array<{ finding: string; decision: string }>>([{ finding: '', decision: '' }])
const selectedItems = ref<Record<string, boolean>>({})
const itemAmounts = ref<Record<string, number | null>>({})
const itemCosts = ref<Record<string, number | null>>({})
const itemNotes = ref<Record<string, string>>({})
const itemStatuses = ref<Record<string, ProjectItemStatus | ''>>({})
const removedImageIds = ref<string[]>([])
const { photos, files, selectFiles, removeFile, clearPhotos } = useLogPhotos()
const imageEdits = ref<Array<ProjectImage & { signedUrl?: string }>>([])
const demoMode = useDemoMode()
const demo = useDemoStore()
const { loadAuthors, authorName } = useLogAuthors()

const phaseName = computed(() => phases.value.find(entry => entry.id === log.value?.phase_id)?.name || 'Unassigned')
const visibleImages = computed(() => images.value.filter(image => !removedImageIds.value.includes(image.id)))
const projectStyle = computed(() => projectThemeStyle(project.value?.theme_config))

function fillForm() {
  if (!log.value) return
  title.value = log.value.title; phaseId.value = log.value.phase_id || ''; workDate.value = log.value.work_date
  durationHours.value = log.value.duration_minutes ? Math.floor(log.value.duration_minutes / 60) : null
  durationMinutes.value = log.value.duration_minutes ? log.value.duration_minutes % 60 : null
  summary.value = log.value.summary; content.value = log.value.content
  observations.value = log.value.finding_decisions?.length ? log.value.finding_decisions.map(entry => ({ ...entry })) : [{ finding: '', decision: '' }]
  selectedItems.value = {}; itemAmounts.value = {}; itemCosts.value = {}; itemNotes.value = {}; itemStatuses.value = {}
  for (const entry of usage.value) {
    selectedItems.value[entry.project_item_id] = true
    itemAmounts.value[entry.project_item_id] = entry.usage_amount
    itemCosts.value[entry.project_item_id] = entry.usage_cost ?? null
    itemNotes.value[entry.project_item_id] = entry.note || ''
  }
  removedImageIds.value = []
  imageEdits.value = images.value.map(image => ({ ...image }))
  clearPhotos()
}

async function loadDetail() {
  loading.value = true; errorMessage.value = ''
  if (demoMode.value) {
    await useLocalAccounts().initialize()
    demo.initialize()
    const data = demo.getLog(slug.value, logSlug.value)
    if (!data) errorMessage.value = 'Workshop session not found in this browser.'
    else {
      project.value = data.project; log.value = data.log; phases.value = data.phases
      images.value = data.images; projectItems.value = data.projectItems; usage.value = data.usage; canEdit.value = useLocalAccounts().canWrite(data.project.id)
      await loadAuthors([data.log])
      fillForm()
    }
    loading.value = false
    return
  }

  const supabase = useSupabase()
  if (!supabase) return
  const [{ data: projectData, error: projectError }, { data: userData }] = await Promise.all([
    supabase.from('projects').select('*').eq('slug', slug.value).maybeSingle(), supabase.auth.getUser()
  ])
  if (projectError || !projectData) { errorMessage.value = projectError?.message || 'Project unavailable.'; loading.value = false; return }
  project.value = projectData as Project
  const { data: logData, error: logError } = await supabase.from('logs').select('*').eq('project_id', project.value.id).eq('slug', logSlug.value).maybeSingle()
  if (logError || !logData) { errorMessage.value = logError?.message || 'Workshop session not found.'; loading.value = false; return }
  log.value = logData as ProjectLog
  await loadAuthors([log.value])
  const requests = await Promise.all([
    supabase.from('project_phases').select('*').eq('project_id', project.value.id).is('archived_at', null).order('sort_order'),
    supabase.from('project_images').select('*').eq('log_id', log.value.id).eq('upload_status', 'ready').is('deleted_at', null).order('sort_order'),
    project.value.items_enabled ? supabase.from('project_items').select('*,item:items(*)').eq('project_id', project.value.id).order('role') : Promise.resolve({ data: [] }),
    project.value.items_enabled ? supabase.from('log_item_usage').select('*,projectItem:project_items(*,item:items(*))').eq('log_id', log.value.id) : Promise.resolve({ data: [] }),
    userData.user ? supabase.from('project_members').select('project_id,user_id,role').eq('project_id', project.value.id).eq('user_id', userData.user.id).maybeSingle() : Promise.resolve({ data: null })
  ])
  phases.value = (requests[0].data ?? []) as ProjectPhase[]
  const baseImages = (requests[1].data ?? []) as ProjectImage[]
  images.value = await Promise.all(baseImages.map(async image => {
    const { data } = await supabase.storage.from('project-originals').createSignedUrl(image.storage_path, 3600)
    return { ...image, signedUrl: data?.signedUrl }
  }))
  projectItems.value = (requests[2].data ?? []) as ProjectItemDetail[]
  usage.value = (requests[3].data ?? []) as LogItemUsageDetail[]
  const membership = requests[4].data as ProjectMembership | null
  canEdit.value = membership?.role === 'owner' || membership?.role === 'contributor'
  fillForm(); loading.value = false
}

function toggleRemoveImage(imageId: string) {
  removedImageIds.value = removedImageIds.value.includes(imageId) ? removedImageIds.value.filter(id => id !== imageId) : [...removedImageIds.value, imageId]
}
function fileAsDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) }) }

function usageInput() {
  return projectItems.value.filter(entry => selectedItems.value[entry.id]).map(entry => ({
    projectItemId: entry.id, usageAmount: optionalAmount(itemAmounts.value[entry.id]), usageCost: optionalAmount(itemCosts.value[entry.id]),
    note: itemNotes.value[entry.id]?.trim() || null, statusAfter: itemStatuses.value[entry.id] || null
  }))
}

async function uploadNewImages(userId: string) {
  const supabase = useSupabase()!
  for (const [index, file] of files.value.entries()) {
    const { data: reservation, error } = await supabase.from('project_images').insert({
      project_id: project.value!.id, log_id: log.value!.id, original_file_name: file.name,
      media_type: file.type || 'image/jpeg', byte_size: file.size, role: photos.value[index]!.role, caption: photos.value[index]!.caption.trim() || null,
      sort_order: images.value.length + index, upload_status: 'reserved', uploaded_by_user_id: userId
    }).select('id,storage_path').single()
    if (error || !reservation) throw error || new Error(`Could not reserve ${file.name}`)
    const { error: uploadError } = await supabase.storage.from('project-originals').upload(reservation.storage_path, file, { contentType: file.type || 'image/jpeg' })
    if (uploadError) throw uploadError
    const { error: readyError } = await supabase.from('project_images').update({ upload_status: 'ready' }).eq('id', reservation.id)
    if (readyError) throw readyError
  }
}

async function save() {
  if (!project.value || !log.value || !canEdit.value) return
  busy.value = true; errorMessage.value = ''
  const duration = Math.max(0, (durationHours.value ?? 0) * 60 + (durationMinutes.value ?? 0)) || null
  const findingDecisions = normalizeFindings(observations.value)
  try {
    if (demoMode.value) {
      const newImages = []
      for (const [index, file] of files.value.entries()) newImages.push({ name: file.name, type: file.type || 'image/jpeg', size: file.size, role: photos.value[index]!.role, caption: photos.value[index]!.caption.trim() || null, dataUrl: await fileAsDataUrl(file) })
      demo.updateLog({ logId: log.value.id, phaseId: phaseId.value || null, title: title.value.trim(), workDate: workDate.value,
        durationMinutes: duration, summary: summary.value.trim(), content: content.value.trim(), findingDecisions,
        imageRole: 'gallery', imageEdits: imageEdits.value.map(image => ({ id: image.id, role: image.role, caption: image.caption?.trim() || null })), newImages, removedImageIds: removedImageIds.value, itemUsage: usageInput() })
    } else {
      const supabase = useSupabase()!
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Your session expired.')
      const { error: updateError } = await supabase.from('logs').update({ phase_id: phaseId.value || null, title: title.value.trim(), work_date: workDate.value,
        duration_minutes: duration, summary: summary.value.trim(), content: content.value.trim(), finding_decisions: findingDecisions }).eq('id', log.value.id).eq('project_id', project.value.id)
      if (updateError) throw updateError
      const { error: deleteUsageError } = await supabase.from('log_item_usage').delete().eq('log_id', log.value.id).eq('project_id', project.value.id)
      if (deleteUsageError) throw deleteUsageError
      const rows = usageInput()
      if (rows.length) {
        const { error } = await supabase.from('log_item_usage').insert(rows.map(entry => ({ project_id: project.value!.id, log_id: log.value!.id, project_item_id: entry.projectItemId, usage_amount: entry.usageAmount, usage_cost: entry.usageCost, note: entry.note })))
        if (error) throw error
      }
      for (const entry of rows.filter(entry => entry.statusAfter)) {
        const { error } = await supabase.from('project_items').update({ status: entry.statusAfter }).eq('id', entry.projectItemId).eq('project_id', project.value.id)
        if (error) throw error
      }
      if (removedImageIds.value.length) {
        const { error } = await supabase.from('project_images').update({ deleted_at: new Date().toISOString() }).in('id', removedImageIds.value).eq('project_id', project.value.id)
        if (error) throw error
      }
      for (const image of imageEdits.value.filter(image => !removedImageIds.value.includes(image.id))) {
        const { error } = await supabase.from('project_images').update({ role: image.role, caption: image.caption?.trim() || null }).eq('id', image.id).eq('log_id', log.value.id).eq('project_id', project.value.id)
        if (error) throw error
      }
      await uploadNewImages(userData.user.id)
    }
    editing.value = false; clearPhotos(); await navigateTo(`/projects/${slug.value}/logs/${logSlug.value}`, { replace: true }); await loadDetail()
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : 'The work order could not be updated.' }
  finally { busy.value = false }
}

onMounted(loadDetail)
watch(() => route.query.edit, value => { editing.value = value === '1'; if (editing.value) fillForm() })

</script>

<template>
  <p v-if="loading" class="loading">Pulling the work order from the drawer…</p>
  <div v-else-if="errorMessage && !log" class="empty-state"><h2>Work order unavailable</h2><p>{{ errorMessage }}</p><NuxtLink class="button" :to="`/projects/${slug}`">Back to the project</NuxtLink></div>
  <div v-else-if="project && log" class="log-sheet" :style="projectStyle">
    <div class="log-sheet__bar"><NuxtLink :to="`/projects/${slug}`">← {{ project.name }}</NuxtLink><strong>FORM WL-{{ log.id.slice(-4).toUpperCase() }}</strong><span>{{ editing ? 'Correction copy' : 'Workshop archive' }}</span></div>

    <template v-if="!editing">
      <header class="log-sheet__hero">
        <div><p class="eyebrow">{{ phaseName }} // {{ formatProjectDate(log.work_date) }}</p><h1>{{ log.title }}</h1><p class="log-author">Recorded by {{ authorName(log) }}</p><p>{{ log.summary || 'No summary was written for this session.' }}</p><NuxtLink v-if="canEdit" class="button" :to="{ query: { edit: '1' } }">Edit work order</NuxtLink></div>
        <div class="log-sheet__stamp"><span>Bench time</span><strong>{{ formatDuration(log.duration_minutes) }}</strong><small>{{ usage.length }} {{ usage.length === 1 ? 'item' : 'items' }} issued</small></div>
      </header>
      <div v-if="images.length" class="log-sheet__photos"><figure v-for="image in images" :key="image.id"><img :src="image.signedUrl" :alt="image.caption || log.title"><figcaption>{{ image.caption || image.role }}</figcaption></figure></div>
      <section class="log-sheet__notes"><p class="eyebrow">Workshop notes</p><p>{{ log.content || 'No extended notes were recorded.' }}</p></section>
      <section v-if="usage.length" class="log-sheet__issued"><header><p class="eyebrow">Issued from stores</p><h2>Parts on this work order</h2></header><article v-for="entry in usage" :key="entry.id"><div><strong>{{ entry.projectItem.item.name }}</strong><small>{{ entry.projectItem.item.brand || entry.projectItem.role.replace('_', ' ') }}</small></div><span>{{ entry.usage_amount ?? '—' }}</span><p>{{ entry.note || 'Used during this session.' }}</p><b>{{ entry.projectItem.status || 'unmarked' }}</b></article></section>
      <section v-if="log.finding_decisions?.length" class="log-sheet__decisions"><article v-for="(entry, index) in log.finding_decisions" :key="index"><div><span>Finding</span><p>{{ entry.finding }}</p></div><div><span>Decision</span><p>{{ entry.decision }}</p></div></article></section>
    </template>

    <form v-else class="log-edit" @submit.prevent="save">
      <header><p class="eyebrow">Correct the workshop record</p><h1>Edit work order</h1><p>Keep the useful history accurate without turning it into paperwork.</p></header>
      <div class="log-edit__grid">
        <label class="field field--full"><span>Title</span><input v-model="title" required></label>
        <label class="field"><span>Stage</span><select v-model="phaseId"><option value="">No phase</option><option v-for="phase in phases" :key="phase.id" :value="phase.id">{{ phase.name }}</option></select></label>
        <label class="field"><span>Workshop date</span><input v-model="workDate" type="date" required></label>
        <label class="field"><span>Hours</span><input v-model.number="durationHours" type="number" min="0"></label>
        <label class="field"><span>Minutes</span><input v-model.number="durationMinutes" type="number" min="0" max="59"></label>
        <label class="field field--full"><span>Summary</span><textarea v-model="summary" /></label>
        <label class="field field--full"><span>Workshop notes</span><textarea v-model="content" /></label>
        <div class="field field--full"><h2>Findings &amp; decisions</h2><FindingDecisionEditor v-model="observations" :disabled="busy" /></div>
      </div>
      <section v-if="project.items_enabled" class="log-edit__parts"><h2>Parts used</h2><article v-for="entry in projectItems" :key="entry.id" :class="{ 'is-selected': selectedItems[entry.id] }"><label><input v-model="selectedItems[entry.id]" type="checkbox"><strong>{{ entry.item.name }}</strong><small>{{ entry.status || 'unmarked' }}</small></label><div v-if="selectedItems[entry.id]"><input v-model.number="itemAmounts[entry.id]" min="0" step="0.01" type="number" :aria-label="`Quantity for ${entry.item.name}`" placeholder="Qty"><label v-if="project.cost_tracking_enabled">Usage cost ({{ project.currency_code }})<input v-model.number="itemCosts[entry.id]" min="0" step="0.01" type="number" placeholder="Not recorded"></label><input v-model="itemNotes[entry.id]" :aria-label="`Usage note for ${entry.item.name}`" placeholder="Usage note"><select v-model="itemStatuses[entry.id]" :aria-label="`Status after this session for ${entry.item.name}`"><option value="">Keep status</option><option value="installed">Installed</option><option value="used">Used</option><option value="removed">Removed</option></select></div></article></section>
      <section class="log-photo-section">
        <h2>Workshop photos</h2>
        <div class="log-photo-list">
          <LogPhotoEditor v-for="image in imageEdits" :key="image.id" v-model:caption="image.caption" v-model:role="image.role" :src="image.signedUrl" :name="image.original_file_name" :removed="removedImageIds.includes(image.id)" :disabled="busy" @remove="toggleRemoveImage(image.id)" />
          <LogPhotoEditor v-for="(photo, index) in photos" :key="photo.preview" v-model:caption="photo.caption" v-model:role="photo.role" :src="photo.preview" :name="photo.file.name" :disabled="busy" @remove="removeFile(index)" />
        </div>
        <input id="more-photos" class="sr-only" type="file" accept="image/*" multiple :disabled="busy" @change="selectFiles">
        <label class="session-photo-add" for="more-photos">+ Add more photos</label>
      </section>
      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
      <footer class="builder-submit"><div><p class="eyebrow">Archive correction</p><strong>The original work date remains part of the record.</strong></div><div><NuxtLink class="button button--ghost" :to="`/projects/${slug}/logs/${logSlug}`">Cancel</NuxtLink><button class="button" type="submit" :disabled="busy">{{ busy ? 'Updating work order…' : 'Save corrected work order →' }}</button></div></footer>
    </form>
    <section v-if="canEdit" class="form-card">
      <button v-if="!deleting" type="button" class="button button--ghost" @click="deleting = true">Delete work order</button>
      <template v-else>
        <h2>Delete this work order?</h2>
        <p>This permanently removes the log, its recorded time and item usage costs. Item purchases and statuses stay unchanged. Original photos stay with the project, including its cover.</p>
        <label class="field">Type the log title to confirm: {{ log.title }}<input v-model="deleteConfirmation" :disabled="busy" autocomplete="off"></label>
        <button type="button" class="button" :disabled="busy || !deletionConfirmed" @click="deleteLog">Confirm delete</button>
        <button type="button" class="button button--ghost" :disabled="busy" @click="deleting = false; deleteConfirmation = ''">Keep work order</button>
      </template>
      <p v-if="errorMessage && deleting" class="form-error" role="alert">{{ errorMessage }}</p>
    </section>
  </div>
</template>
