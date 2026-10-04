<script setup lang="ts">
import type { ProjectItemDetail } from '~/types/domain'
const props = defineProps<{ entry: ProjectItemDetail; currency: string }>()
const emit = defineEmits<{ saved: [] }>()
const open = ref(false)
const amount = ref<number | null>(props.entry.attributed_amount)
const busy = ref(false)
const error = ref('')
async function save() {
  busy.value = true; error.value = ''
  try {
    const normalized = amount.value === null || (amount.value as unknown) === '' ? null : Number(amount.value)
    if (normalized !== null && (!Number.isFinite(normalized) || normalized < 0)) throw new Error('Enter a non-negative amount.')
    if (useDemoMode().value) useDemoStore().setItemAllocation(props.entry.project_id, props.entry.id, normalized)
    else {
      const { error: failure } = await useSupabase()!.from('project_items').update({ attributed_amount: normalized }).eq('id', props.entry.id).eq('project_id', props.entry.project_id).select('id').single()
      if (failure) throw failure
    }
    open.value = false; emit('saved')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not save allocation.' }
  finally { busy.value = false }
}
</script>
<template>
  <div>
    <button v-if="!open" class="button button--ghost button--small" type="button" @click="amount = entry.attributed_amount; open = true">Set allocation</button>
    <form v-else @submit.prevent="save">
      <label>Allocated to this build ({{ currency }})<input v-model.number="amount" type="number" min="0" step="0.01" placeholder="Not recorded" :disabled="busy"></label>
      <button class="button button--small" :disabled="busy">Save</button>
      <button class="button button--ghost button--small" type="button" :disabled="busy" @click="open = false">Cancel</button>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
