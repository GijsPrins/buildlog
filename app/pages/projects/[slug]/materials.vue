<script setup lang="ts">
import type { Item, Project, ProjectItemDetail, ProjectItemRole, ProjectItemStatus, ProjectMembership } from '~/types/domain'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const project = ref<Project | null>(null)
const projectItems = ref<ProjectItemDetail[]>([])
const loading = ref(true)
const busy = ref(false)
const canEdit = ref(false)
const errorMessage = ref('')
const name = ref('')
const brand = ref('')
const role = ref<ProjectItemRole>('part')
const status = ref<ProjectItemStatus>('planned')
const notes = ref('')
const purchaseAmount = ref<number | null>(null)
const attributedAmount = ref<number | null>(null)
const estimatedAmount = ref<number | null>(null)
const demoMode = useDemoMode()
const demo = useDemoStore()
const userId = ref('')
const ownedItems = ref<Item[]>([])
const existingItemId = ref('')
const availableItems = computed(() => ownedItems.value.filter(item => !projectItems.value.some(entry => entry.item_id === item.id)))
async function linkExisting() {
  if (!project.value || !canEdit.value || !existingItemId.value) return
  busy.value = true; errorMessage.value = ''
  try {
    if (demoMode.value) demo.linkOwnedItem(project.value.id, existingItemId.value, role.value, status.value)
    else {
      const { error } = await useSupabase()!.from('project_items').insert({ project_id: project.value.id, item_id: existingItemId.value, role: role.value, status: status.value }).select('id').single()
      if (error) throw error
    }
    existingItemId.value = ''; await loadMaterials()
  } catch (cause) { errorMessage.value = cause instanceof Error ? cause.message : 'Could not link item.' }
  finally { busy.value = false }
}

const roleOptions: Array<{ value: ProjectItemRole; label: string }> = [
  { value: 'subject', label: 'Build subject' }, { value: 'part', label: 'Part' },
  { value: 'material', label: 'Material' }, { value: 'consumable', label: 'Consumable' },
  { value: 'tool', label: 'Tool' }, { value: 'external_service', label: 'External service' }
]
const statusOptions: ProjectItemStatus[] = ['planned', 'ordered', 'available', 'installed', 'used', 'removed']
const projectStyle = computed(() => projectThemeStyle(project.value?.theme_config))

async function loadMaterials() {
  errorMessage.value = ''
  if (demoMode.value) {
    await useLocalAccounts().initialize()
    demo.initialize()
    userId.value = useLocalAccounts().current.value?.id || ''
    ownedItems.value = demo.ownedItems()
    const data = demo.getProject(slug.value)
    if (!data) errorMessage.value = 'Project not found in this browser.'
    else {
      project.value = data.project
      projectItems.value = data.projectItems
      canEdit.value = useLocalAccounts().canWrite(data.project.id)
      if (!data.project.items_enabled) errorMessage.value = 'The parts ledger is not enabled for this project.'
    }
    loading.value = false
    return
  }

  const supabase = useSupabase()
  if (!supabase) return
  const [{ data: projectData, error }, { data: userData }] = await Promise.all([
    supabase.from('projects').select('*').eq('slug', slug.value).maybeSingle(),
    supabase.auth.getUser()
  ])
  if (error || !projectData || !userData.user) {
    errorMessage.value = error?.message || 'Project unavailable.'
    loading.value = false
    return
  }
  userId.value = userData.user.id
  const { data: owned, error: ownedError } = await supabase.from('items').select('*').eq('owner_user_id', userData.user.id).order('name')
  if (ownedError) { errorMessage.value = ownedError.message; loading.value = false; return }
  ownedItems.value = (owned ?? []) as Item[]
  project.value = projectData as Project
  if (!project.value.items_enabled) {
    errorMessage.value = 'The parts ledger is not enabled for this project.'
    loading.value = false
    return
  }
  const [{ data: membershipData }, { data: itemData, error: itemError }] = await Promise.all([
    supabase.from('project_members').select('project_id,user_id,role').eq('project_id', project.value.id).eq('user_id', userData.user.id).maybeSingle(),
    supabase.from('project_items').select('*,item:items(*)').eq('project_id', project.value.id).order('role')
  ])
  const membership = membershipData as ProjectMembership | null
  canEdit.value = membership?.role === 'owner' || membership?.role === 'contributor'
  projectItems.value = (itemData ?? []) as ProjectItemDetail[]
  if (itemError) errorMessage.value = itemError.message
  loading.value = false
}

function clearForm() {
  name.value = ''; brand.value = ''; role.value = 'part'; status.value = 'planned'; notes.value = ''
  purchaseAmount.value = null; attributedAmount.value = null; estimatedAmount.value = null
}

async function submit() {
  if (!project.value || !canEdit.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    purchaseAmount.value = optionalAmount(purchaseAmount.value)
    estimatedAmount.value = optionalAmount(estimatedAmount.value)
    attributedAmount.value = optionalAmount(attributedAmount.value)
    if (demoMode.value) {
      projectItems.value.push(demo.addProjectItem({
        projectId: project.value.id, name: name.value.trim(), brand: brand.value.trim() || null,
        role: role.value, status: status.value, notes: notes.value.trim() || null,
        purchaseAmount: project.value.cost_tracking_enabled ? purchaseAmount.value : null,
        estimatedAmount: project.value.cost_tracking_enabled ? estimatedAmount.value : null,
        attributedAmount: project.value.cost_tracking_enabled ? attributedAmount.value : null,
        currencyCode: project.value.currency_code
      }))
    } else {
      const supabase = useSupabase()!
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Your session expired.')
      const { data: item, error: itemError } = await supabase.from('items').insert({
        owner_user_id: userData.user.id, created_by_user_id: userData.user.id,
        name: name.value.trim(), brand: brand.value.trim() || null, notes: notes.value.trim() || null,
        estimated_amount: project.value.cost_tracking_enabled ? estimatedAmount.value : null,
        estimated_currency_code: project.value.cost_tracking_enabled && estimatedAmount.value != null ? project.value.currency_code : null,
        purchase_amount: project.value.cost_tracking_enabled ? purchaseAmount.value : null,
        purchase_currency_code: project.value.cost_tracking_enabled && purchaseAmount.value !== null ? project.value.currency_code : null
      }).select('*').single()
      if (itemError || !item) throw itemError || new Error('The item could not be created.')
      const { data: link, error: linkError } = await supabase.from('project_items').insert({
        project_id: project.value.id, item_id: item.id, role: role.value, status: status.value,
        attributed_amount: project.value.cost_tracking_enabled ? attributedAmount.value : null
      }).select('*').single()
      if (linkError || !link) {
        await supabase.from('items').delete().eq('id', item.id)
        throw linkError || new Error('The item could not be added to this project.')
      }
      projectItems.value.push({ ...link, item } as ProjectItemDetail)
    }
    clearForm()
    await loadMaterials()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'The part could not be added.'
  } finally {
    busy.value = false
  }
}

onMounted(loadMaterials)
</script>

<template>
  <p v-if="loading" class="loading">Opening the parts cabinet…</p>
  <div v-else-if="!project || !project.items_enabled" class="empty-state">
    <h2>Parts ledger unavailable</h2><p>{{ errorMessage }}</p><NuxtLink class="button" :to="`/projects/${slug}`">Back to the project</NuxtLink>
  </div>
  <div v-else class="materials-builder" :style="projectStyle">
    <p v-if="route.query.returnTo === 'new-log'" class="materials-draft-return"><NuxtLink class="button" :to="`/projects/${slug}/logs/new`">← Back to your log draft</NuxtLink> Your draft is kept while you add parts in this tab.</p>
    <div class="materials-builder__bar"><NuxtLink :to="`/projects/${slug}`">← {{ project.name }}</NuxtLink><strong>FORM BOM-01</strong><span>Parts &amp; materials ledger</span></div>
    <header class="materials-builder__header">
      <div><p class="eyebrow">Keep only what is useful</p><h1>Parts counter</h1><p>Plan replacements, remember what is already on the shelf and connect used parts to a workshop session.</p></div>
      <div><strong>{{ projectItems.length }}</strong><span>items logged</span><small>{{ project.cost_tracking_enabled ? `Costs tracked in ${project.currency_code}` : 'Costs deliberately hidden' }}</small></div>
    </header>

    <form v-if="canEdit" class="form-card" @submit.prevent="linkExisting">
      <h2>Use an item you already own</h2>
      <p>Link the same item to this build without recording another purchase. Its role and status below apply only to this project. Shared details become visible to people who can view this project.</p>
      <label class="field">Existing item<select v-model="existingItemId" required><option value="">Choose an item</option><option v-for="item in availableItems" :key="item.id" :value="item.id">{{ item.name }}{{ item.brand ? ` — ${item.brand}` : '' }}</option></select></label>
      <label class="field">Role on this project<select v-model="role"><option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
      <label class="field">Status on this project<select v-model="status"><option v-for="option in statusOptions" :key="option" :value="option">{{ option }}</option></select></label>
      <p v-if="!availableItems.length">All your existing items are already linked here. Create a new item below.</p>
      <button class="button" :disabled="busy || !existingItemId">Add existing item</button>
    </form>
    <section class="materials-workbench">
      <form v-if="canEdit" class="materials-ticket" @submit.prevent="submit">
        <div class="materials-ticket__title"><span>New line item</span><strong># {{ String(projectItems.length + 1).padStart(3, '0') }}</strong></div>
        <label class="field"><span>What is it?</span><input v-model="name" required maxlength="200" placeholder="e.g. brake cable set"></label>
        <label class="field"><span>Brand / maker</span><input v-model="brand" placeholder="Optional"></label>
        <div class="materials-ticket__split">
          <label class="field"><span>Role</span><select v-model="role"><option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          <label class="field"><span>Status</span><select v-model="status"><option v-for="option in statusOptions" :key="option" :value="option">{{ option }}</option></select></label>
        </div>
        <label class="field"><span>Bench note</span><textarea v-model="notes" placeholder="Size, condition, source or the reason for choosing it…" /></label>
        <div v-if="project.cost_tracking_enabled" class="materials-ticket__split">
          <label class="field"><span>Purchase amount</span><input v-model.number="purchaseAmount" min="0" step="0.01" type="number" :placeholder="project.currency_code"></label>
          <label class="field"><span>Estimated purchase</span><input v-model.number="estimatedAmount" min="0" step="0.01" type="number" :placeholder="project.currency_code"></label>
          <label class="field"><span>Attributed to build</span><input v-model.number="attributedAmount" min="0" step="0.01" type="number" :placeholder="project.currency_code"></label>
        </div>
        <button class="button" type="submit" :disabled="busy">{{ busy ? 'Writing line…' : '+ Add to parts counter' }}</button>
      </form>

      <div class="materials-ledger-sheet">
        <div class="materials-ledger-sheet__head"><span>Item / note</span><span>Role</span><span>Status</span><span v-if="project.cost_tracking_enabled">Cost</span></div>
        <article v-for="entry in projectItems" :key="entry.id">
          <div><strong>{{ entry.item.name }}</strong><small>{{ entry.item.brand || entry.item.notes || 'No extra note' }}</small><p v-if="entry.notes">{{ entry.notes }}</p></div>
          <span>{{ entry.role.replace('_', ' ') }}</span><span class="parts-ledger__stamp">{{ entry.status || 'unmarked' }}</span>
          <div v-if="project.cost_tracking_enabled">
            <strong>{{ entry.attributed_amount ?? '—' }} {{ project.currency_code }} allocated</strong>

          </div>
          <div v-if="canEdit" class="ledger-edit-row"><LedgerItemEditor :entry="entry" :currency="project.currency_code" :costs="project.cost_tracking_enabled" :user-id="userId" @saved="loadMaterials" /></div>
        </article>
        <div v-if="!projectItems.length" class="materials-ledger-sheet__empty">The sheet is blank. Add the first thing waiting on the bench.</div>
      </div>
    </section>
    <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.ledger-edit-row { grid-column: 1 / -1; min-width: 0; }
</style>
