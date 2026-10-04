<script setup lang="ts">
import type { Item, ProjectItemDetail, ProjectItemRole, ProjectItemStatus } from '~/types/domain'
const props = defineProps<{ entry: ProjectItemDetail; currency: string; costs: boolean; userId: string }>()
const emit = defineEmits<{ saved: [] }>()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const item = ref<Item>({ ...props.entry.item })
const role = ref<ProjectItemRole>(props.entry.role)
const status = ref<ProjectItemStatus | null>(props.entry.status)
const notes = ref(props.entry.notes || '')
const allocation = ref(props.entry.attributed_amount)
const owner = computed(() => props.userId === props.entry.item.owner_user_id)
function start() {
  item.value = { ...props.entry.item }; role.value = props.entry.role; status.value = props.entry.status
  notes.value = props.entry.notes || ''; allocation.value = props.entry.attributed_amount
  error.value = ''; open.value = true
}
async function save(shared: boolean) {
  busy.value = true; error.value = ''
  try {
    if (shared) {
      if (!owner.value) throw new Error('Only the item owner can edit shared details.')
      if (!item.value.name.trim()) throw new Error('Enter an item name.')
      if (item.value.url && !/^https?:\/\//i.test(item.value.url)) throw new Error('Use an http or https supplier URL.')
      const purchase = optionalAmount(item.value.purchase_amount), estimate = optionalAmount(item.value.estimated_amount)
      const changes = { name: item.value.name.trim(), brand: item.value.brand?.trim() || null, notes: item.value.notes?.trim() || null,
        supplier: item.value.supplier?.trim() || null, url: item.value.url?.trim() || null,
        purchase_amount: purchase, purchase_currency_code: purchase == null ? null : item.value.purchase_currency_code || props.currency,
        estimated_amount: estimate, estimated_currency_code: estimate == null ? null : item.value.estimated_currency_code || props.currency }
      if (useDemoMode().value) useDemoStore().editOwnedItem(item.value.id, changes)
      else {
        const { error: failure } = await useSupabase()!.from('items').update(changes).eq('id', item.value.id).eq('owner_user_id', props.userId).select('id').single()
        if (failure) throw failure
      }
    } else {
      const changes = { role: role.value, status: status.value, notes: notes.value.trim() || null, attributed_amount: optionalAmount(allocation.value) }
      if (useDemoMode().value) useDemoStore().editLedgerEntry(props.entry.project_id, props.entry.id, changes)
      else {
        const { error: failure } = await useSupabase()!.from('project_items').update(changes).eq('id', props.entry.id).eq('project_id', props.entry.project_id).select('id').single()
        if (failure) throw failure
      }
    }
    open.value = false; emit('saved')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not save item.' }
  finally { busy.value = false }
}
</script>
<template>
  <div class="ledger-item-editor">
    <button v-if="!open" type="button" class="button button--ghost button--small" @click="start">Edit item</button>
    <div v-else>
      <form @submit.prevent="save(false)">
        <h3>On this project</h3>
        <label>Role<select v-model="role"><option v-for="value in ['subject','part','material','consumable','tool','external_service']" :key="value" :value="value">{{ value.replace('_', ' ') }}</option></select></label>
        <label>Status<select v-model="status"><option :value="null">Not marked</option><option v-for="value in ['planned','ordered','available','installed','used','removed']" :key="value" :value="value">{{ value }}</option></select></label>
        <p>Choose “removed” when this item leaves the build. Its logs and costs remain in the record.</p>
        <label>Project note<textarea v-model="notes" /></label>
        <label v-if="costs">Project allocation ({{ currency }})<input v-model.number="allocation" type="number" min="0" step="0.01"></label>
        <button class="button" :disabled="busy">Save project details</button>
      </form>
      <form v-if="owner" @submit.prevent="save(true)">
        <h3>Shared item details</h3>
        <p>Changes here appear on every project using this item. The purchase is recorded once.</p>
        <label>Item name<input v-model="item.name" required maxlength="200"></label>
        <label>Brand<input v-model="item.brand"></label>
        <label>Supplier<input v-model="item.supplier"></label>
        <label>Supplier URL<input v-model="item.url" type="url"></label>
        <label>Item notes<textarea v-model="item.notes" /></label>
        <template v-if="costs">
          <label>Purchase amount<input v-model.number="item.purchase_amount" type="number" min="0" step="0.01"></label>
          <label>Purchase currency<input v-model="item.purchase_currency_code" maxlength="3" pattern="[A-Z]{3}" :placeholder="currency"></label>
          <label>Estimated amount<input v-model.number="item.estimated_amount" type="number" min="0" step="0.01"></label>
          <label>Estimate currency<input v-model="item.estimated_currency_code" maxlength="3" pattern="[A-Z]{3}" :placeholder="currency"></label>
        </template>
        <button class="button" :disabled="busy">Save shared item</button>
      </form>
      <p v-else>The item owner manages its shared name, purchase and supplier details.</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <button type="button" class="button button--ghost" :disabled="busy" @click="open = false">Cancel</button>
    </div>
  </div>
</template>
<style scoped>
.ledger-item-editor { margin-top: .75rem; }
form { display: grid; gap: .75rem; margin: 1rem 0; padding: 1rem; border: 1px solid var(--project-border); }
label { display: grid; gap: .3rem; } input,select,textarea { width: 100%; min-width: 0; padding: .5rem; }
p { font-size: .85rem; line-height: 1.5; } h3 { margin: 0; }
</style>
