<script setup lang="ts">
import type { Item, Project, ProjectItemDetail } from '~/types/domain'
import { collectPages, formatPurchaseAmount, workshopFinancials } from '~/utils/workshopFinancials'

definePageMeta({ middleware: 'auth' })
const { user, initialize } = useAuth()
const demoMode = useDemoMode()
const demo = useDemoStore()
const items = ref<Item[]>([])
const links = ref<ProjectItemDetail[]>([])
const projects = ref<Pick<Project, 'id' | 'name' | 'slug' | 'items_enabled'>[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const editingId = ref<string | null>(null)
const newItem = ref<Item | null>(null)
const totals = computed(() => workshopFinancials(items.value, links.value))
const visibleItems = computed(() => items.value.filter(item => `${item.name} ${item.brand || ''} ${item.supplier || ''}`.toLowerCase().includes(search.value.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)))
const disabledLedgers = computed(() => projects.value.filter(project => !project.items_enabled).length)
let generation = 0

function itemProjects(itemId: string) {
  const ids = new Set(links.value.filter(link => link.item_id === itemId).map(link => link.project_id))
  return projects.value.filter(project => ids.has(project.id))
}

async function load() {
  const request = ++generation
  const userId = user.value?.id
  loading.value = true; error.value = ''; items.value = []; links.value = []; projects.value = []
  if (!userId) { loading.value = false; return }
  try {
    let loadedItems: Item[], loadedLinks: ProjectItemDetail[], loadedProjects: typeof projects.value
    if (demoMode.value) {
      demo.initialize()
      const data = demo.workshopItems()
      loadedItems = data.items; loadedLinks = data.links; loadedProjects = data.projects
    } else {
      const client = useSupabase()!
      const [owned, memberships] = await Promise.all([
        collectPages<Item>((from, to) => client.from('items').select('*', { count: 'exact' }).eq('owner_user_id', userId).order('id').range(from, to)),
        collectPages<{ project_id: string }>((from, to) => client.from('project_members').select('project_id', { count: 'exact' }).eq('user_id', userId).order('project_id').range(from, to))
      ])
      loadedProjects = []; loadedLinks = []
      const ids = [...new Set(memberships.map(member => member.project_id))]
      // Keep URL sizes bounded even for workshops with many project memberships.
      for (let offset = 0; offset < ids.length; offset += 100) {
        const subset = ids.slice(offset, offset + 100)
        const [memberProjects, projectLinks] = await Promise.all([
          collectPages<(typeof projects.value)[number]>((from, to) => client.from('projects').select('id,name,slug,items_enabled', { count: 'exact' }).in('id', subset).order('id').range(from, to)),
          collectPages<ProjectItemDetail>((from, to) => client.from('project_items').select('*,item:items(*)', { count: 'exact' }).in('project_id', subset).order('id').range(from, to))
        ])
        loadedProjects.push(...memberProjects)
        loadedLinks.push(...projectLinks.filter(link => link.item))
      }
      loadedItems = [...new Map([...owned, ...loadedLinks.map(link => link.item)].map(item => [item.id, item])).values()]
    }
    if (request !== generation || user.value?.id !== userId) return
    items.value = loadedItems; links.value = loadedLinks; projects.value = loadedProjects
  } catch (cause) {
    if (request === generation) error.value = cause instanceof Error ? cause.message : 'Could not load workshop purchases.'
  } finally { if (request === generation) loading.value = false }
}
function startItem() {
  if (!user.value) return
  editingId.value = null
  newItem.value = {
    id: '', owner_user_id: user.value.id, created_by_user_id: user.value.id, name: '', brand: null,
    purchase_amount: null, purchase_currency_code: null, estimated_amount: null, estimated_currency_code: null,
    supplier: null, url: null, notes: null, created_at: '', updated_at: ''
  }
}
async function saved() { editingId.value = null; newItem.value = null; await load() }
onMounted(async () => { await initialize(); await load() })
watch(() => user.value?.id, () => { editingId.value = null; newItem.value = null; load() })
</script>

<template>
  <div class="workshop-purchases">
    <header><p class="eyebrow">The workshop ledger</p><h1>Purchases</h1><p>Your own items and items shared with projects you belong to, with each purchase counted once.</p><button v-if="user && !newItem" class="button" type="button" :disabled="Boolean(editingId)" @click="startItem">+ Record an item</button></header>
    <SharedItemEditor v-if="newItem && user" :item="newItem" :user-id="user.id" create @saved="saved" @cancel="newItem = null" />
    <p v-if="loading" class="loading">Opening the purchase records…</p>
    <div v-else-if="error" class="empty-state"><p class="form-error" role="alert">{{ error }}</p><button class="button" type="button" @click="load">Try again</button></div>
    <template v-else>
      <section class="purchase-totals" aria-label="Workshop purchase totals">
        <h2>Overall totals</h2>
        <p>Actual purchases and unpurchased estimates are separate. Currencies stay separate; no exchange rates are applied.</p>
        <div v-for="group in totals.currencies" :key="group.currency" class="purchase-currency">
          <h3>{{ group.currency }}</h3>
          <dl><div><dt>Actual purchases</dt><dd>{{ formatPurchaseAmount(group.actual, group.currency) }}</dd><small>{{ group.purchases }} recorded purchases</small></div><div><dt>Planned expenditure</dt><dd>{{ formatPurchaseAmount(group.planned, group.currency) }}</dd><small>{{ group.estimates }} unpurchased estimates</small></div><div><dt>Tools within actual purchases</dt><dd>{{ formatPurchaseAmount(group.tools, group.currency) }}</dd><small>Items linked as tools in your project ledgers</small></div></dl>
        </div>
        <p v-if="!totals.currencies.length">No purchase amounts or estimates recorded yet.</p>
        <p v-if="totals.unknown" role="status">{{ totals.unknown }} {{ totals.unknown === 1 ? 'item has' : 'items have' }} no purchase amount or estimate. These totals cover recorded amounts.</p>
        <p v-if="disabledLedgers" class="muted">{{ disabledLedgers }} project {{ disabledLedgers === 1 ? 'ledger is' : 'ledgers are' }} disabled. Shared items from those ledgers are hidden; your own purchases remain included.</p>
        <p class="muted">Project allocations and consumable usage belong to each project's costs. They are not extra purchases. Tools are already included in actual purchases.</p>
      </section>
      <section aria-labelledby="purchase-records-heading">
        <h2 id="purchase-records-heading">Purchase records</h2>
        <label class="field"><span>Find an item</span><input v-model="search" type="search" placeholder="Name, brand or supplier"></label>
        <p>{{ visibleItems.length }} of {{ totals.itemCount }} items</p>
        <article v-for="item in visibleItems" :key="item.id" class="purchase-record">
          <header><div><h3>{{ item.name }}</h3><p>{{ [item.brand, item.supplier].filter(Boolean).join(' · ') }}</p></div><span>{{ item.owner_user_id === user?.id ? 'Your item' : 'Shared item' }}</span></header>
          <dl><div><dt>Purchase</dt><dd>{{ item.purchase_amount !== null && item.purchase_currency_code ? formatPurchaseAmount(item.purchase_amount, item.purchase_currency_code) : 'Not recorded' }}</dd></div><div><dt>Estimate</dt><dd>{{ item.estimated_amount !== null && item.estimated_currency_code ? formatPurchaseAmount(item.estimated_amount, item.estimated_currency_code) : 'Not recorded' }}<small v-if="item.purchase_amount !== null && item.estimated_amount !== null">Reference only; already purchased</small></dd></div></dl>
          <p class="purchase-projects"><NuxtLink v-for="project in itemProjects(item.id)" :key="project.id" :to="`/projects/${project.slug}/materials`">{{ project.name }}</NuxtLink><span v-if="!itemProjects(item.id).length">No enabled ledger link in your projects</span></p>
          <template v-if="item.owner_user_id === user?.id"><button v-if="editingId !== item.id" class="button button--ghost button--small" type="button" :disabled="Boolean(newItem || editingId)" @click="editingId = item.id">Edit purchase</button><SharedItemEditor v-else :key="item.id" :item="item" :user-id="user.id" @saved="saved" @cancel="editingId = null" /></template>
          <p v-else class="muted">The item owner manages its purchase details.</p>
        </article>
        <p v-if="!visibleItems.length">{{ items.length ? 'No items match your search.' : 'Record an item here or add one from a project’s parts ledger to get started.' }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.workshop-purchases > header { max-width: 48rem; margin-bottom: 2rem; }
.purchase-totals { padding: 1.5rem; margin-bottom: 2.5rem; border: 1px solid var(--line); background: var(--surface); }
.purchase-currency { padding: 1rem 0; border-bottom: 1px solid var(--line); }
dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5rem; } dd { margin: .4rem 0; font-size: 1.4rem; font-weight: bold; } dt,small { font-size: .8rem; color: var(--muted); } small { display: block; } p { line-height: 1.6; }
.purchase-record { margin: 1rem 0; padding: 1.5rem; border: 1px solid var(--line); background: var(--surface); }
.purchase-record > header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; } h3 { margin: 0; } .purchase-record header p { margin: .3rem 0; } .purchase-record dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.purchase-projects { display: flex; flex-wrap: wrap; gap: 1rem; font-size: .85rem; }
@media (max-width: 600px) { dl, .purchase-record dl { grid-template-columns: minmax(0, 1fr); gap: 1rem; } .purchase-totals, .purchase-record { padding: 1rem; } }
</style>
