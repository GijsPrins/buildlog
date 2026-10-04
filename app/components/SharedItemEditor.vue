<script setup lang="ts">
import type { Item } from '~/types/domain'
import { normalizeItemDetails } from '~/utils/itemDetails'
const props = withDefaults(defineProps<{ item: Item; userId: string; currency?: string; costs?: boolean; create?: boolean }>(), { currency: 'EUR', costs: true, create: false })
const emit = defineEmits<{ saved: []; cancel: [] }>()
const draft = ref<Item>({ ...props.item })
const busy = ref(false)
const error = ref('')
async function save() {
  busy.value = true; error.value = ''
  try {
    if (props.userId !== props.item.owner_user_id) throw new Error('Only the item owner can edit shared details.')
    const changes = normalizeItemDetails(draft.value, props.currency)
    if (useDemoMode().value) {
      if (props.create) useDemoStore().createOwnedItem(changes)
      else useDemoStore().editOwnedItem(props.item.id, changes)
    }
    else {
      const client = useSupabase()!
      const request = props.create
        ? client.from('items').insert({ ...changes, owner_user_id: props.userId, created_by_user_id: props.userId })
        : client.from('items').update(changes).eq('id', props.item.id).eq('owner_user_id', props.userId)
      const { error: failure } = await request.select('id').single()
      if (failure) throw failure
    }
    emit('saved')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not save item.' }
  finally { busy.value = false }
}
</script>
<template>
  <form class="shared-item-editor" @submit.prevent="save">
    <h3>{{ create ? 'New workshop item' : 'Shared item details' }}</h3>
    <p>{{ create ? 'Record an item now and link it to a build later from its parts ledger.' : 'Changes here appear on every project using this item. The purchase is recorded once.' }}</p>
    <fieldset :disabled="busy">
      <legend class="sr-only">Purchase details</legend>
      <label>Item name<input v-model="draft.name" required maxlength="200"></label>
      <label>Brand<input v-model="draft.brand"></label>
      <label>Supplier<input v-model="draft.supplier"></label>
      <label>Supplier URL<input v-model="draft.url" type="url"></label>
      <label>Item notes<textarea v-model="draft.notes" /></label>
      <template v-if="costs">
        <label>Purchase amount<input v-model.number="draft.purchase_amount" type="number" min="0" step="0.01"></label>
        <label>Purchase currency<input v-model="draft.purchase_currency_code" maxlength="3" pattern="[A-Za-z]{3}" :placeholder="currency"></label>
        <label>Estimated amount<input v-model.number="draft.estimated_amount" type="number" min="0" step="0.01"></label>
        <label>Estimate currency<input v-model="draft.estimated_currency_code" maxlength="3" pattern="[A-Za-z]{3}" :placeholder="currency"></label>
      </template>
    </fieldset>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="form-actions"><button class="button" :disabled="busy">{{ busy ? 'Saving…' : create ? 'Record item' : 'Save shared item' }}</button><button class="button button--ghost" type="button" :disabled="busy" @click="emit('cancel')">Cancel</button></div>
  </form>
</template>
<style scoped>
.shared-item-editor { display: grid; gap: .75rem; margin: 1rem 0; padding: 1rem; border: 1px solid var(--project-border, #d8d6ce); }
fieldset { display: grid; gap: .75rem; border: 0; padding: 0; min-width: 0; } label { display: grid; gap: .3rem; } input,textarea { width: 100%; min-width: 0; padding: .5rem; }
p { font-size: .85rem; line-height: 1.5; } h3 { margin: 0; }
</style>
