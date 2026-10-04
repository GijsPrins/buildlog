<script setup lang="ts">
import type { ProjectItemDetail, ProjectItemRole, ProjectItemStatus } from '~/types/domain'
const props = defineProps<{ entry: ProjectItemDetail; currency: string; costs: boolean; userId: string }>()
const emit = defineEmits<{ saved: [] }>()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const role = ref<ProjectItemRole>(props.entry.role)
const status = ref<ProjectItemStatus | null>(props.entry.status)
const notes = ref(props.entry.notes || '')
const allocation = ref(props.entry.attributed_amount)
const owner = computed(() => props.userId === props.entry.item.owner_user_id)
function start() {
  role.value = props.entry.role; status.value = props.entry.status
  notes.value = props.entry.notes || ''; allocation.value = props.entry.attributed_amount
  error.value = ''; open.value = true
}
async function save() {
  busy.value = true; error.value = ''
  try {
    const changes = { role: role.value, status: status.value, notes: notes.value.trim() || null, attributed_amount: optionalAmount(allocation.value) }
    if (useDemoMode().value) useDemoStore().editLedgerEntry(props.entry.project_id, props.entry.id, changes)
    else {
      const { error: failure } = await useSupabase()!.from('project_items').update(changes).eq('id', props.entry.id).eq('project_id', props.entry.project_id).select('id').single()
      if (failure) throw failure
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
      <form @submit.prevent="save">
        <h3>On this project</h3>
        <label>Role<select v-model="role"><option v-for="value in ['subject','part','material','consumable','tool','external_service']" :key="value" :value="value">{{ value.replace('_', ' ') }}</option></select></label>
        <label>Status<select v-model="status"><option :value="null">Not marked</option><option v-for="value in ['planned','ordered','available','installed','used','removed']" :key="value" :value="value">{{ value }}</option></select></label>
        <p>Choose “removed” when this item leaves the build. Its logs and costs remain in the record.</p>
        <label>Project note<textarea v-model="notes" /></label>
        <label v-if="costs">Project allocation ({{ currency }})<input v-model.number="allocation" type="number" min="0" step="0.01"></label>
        <button class="button" :disabled="busy">Save project details</button>
      </form>
      <SharedItemEditor v-if="owner" :item="entry.item" :currency="currency" :costs="costs" :user-id="userId" @saved="open = false; emit('saved')" @cancel="open = false" />
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
