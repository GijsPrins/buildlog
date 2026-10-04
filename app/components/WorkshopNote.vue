<script setup lang="ts">
import type { WorkshopReply } from '~/utils/workshopSocial'
import { commentLimit } from '~/utils/workshopSocial'
defineProps<{ note: WorkshopReply; userId?: string; owner: boolean; busy: boolean; editing: boolean; removing: boolean }>()
const editText = defineModel<string>('editText', { required: true })
defineEmits<{ reply: [note: WorkshopReply]; edit: [note: WorkshopReply]; cancelEdit: []; save: [id: string]; requestRemoval: [id: string]; remove: [id: string]; cancelRemoval: [] }>()
const fieldId = useId()
</script>

<template>
  <article :id="`workshop-note-${note.id}`" class="workshop-note">
    <p v-if="note.deleted_at" class="workshop-note__removed">Removed note · The replies remain.</p>
    <template v-else>
      <header><strong>{{ note.author_display_name }}</strong><time :datetime="note.created_at">{{ formatProjectDate(note.created_at.slice(0, 10)) }}</time><small v-if="note.updated_at !== note.created_at">Edited</small></header>
      <p v-if="note.parent" class="workshop-note__context">Replying to {{ note.parent.deleted_at ? 'a removed note' : note.parent.author_display_name }}<span v-if="!note.parent.deleted_at">“{{ note.parent.content.slice(0, 120) }}{{ note.parent.content.length > 120 ? '…' : '' }}”</span></p>
      <form v-if="editing" class="workshop-note__form" @submit.prevent="$emit('save', note.id)">
        <label :for="`${fieldId}-edit`">Edit your workshop note</label><textarea :id="`${fieldId}-edit`" v-model="editText" :maxlength="commentLimit" :disabled="busy" required />
        <div><button type="submit" class="button" :disabled="busy || !editText.trim()">Save note</button><button type="button" class="button button--ghost" :disabled="busy" @click="$emit('cancelEdit')">Cancel edit</button></div>
      </form>
      <p v-else class="workshop-social__content">{{ note.content }}</p>
      <div v-if="userId" class="workshop-note__actions">
        <button type="button" :disabled="busy" @click="$emit('reply', note)">Reply</button>
        <template v-if="note.author_user_id === userId || owner">
          <button v-if="note.author_user_id === userId && !editing" type="button" :disabled="busy" @click="$emit('edit', note)">Edit note</button>
          <template v-if="removing"><span>Remove this note? Answers from others will stay.</span><button type="button" :disabled="busy" @click="$emit('remove', note.id)">Confirm removal</button><button type="button" :disabled="busy" @click="$emit('cancelRemoval')">Keep note</button></template>
          <button v-else type="button" :disabled="busy" @click="$emit('requestRemoval', note.id)">{{ note.author_user_id === userId ? 'Remove note' : 'Remove note as owner' }}</button>
        </template>
      </div>
    </template>
    <slot />
  </article>
</template>

<style scoped>
.workshop-note { min-width: 0; padding: 1.25rem 0; border-top: 1px dashed var(--project-border, var(--line)); }
header { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; }
header strong { min-width: 0; overflow-wrap: anywhere; }
time, small { font-size: .8rem; }
.workshop-social__content { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.workshop-note__context { padding-left: .6rem; border-left: 2px solid var(--project-border, var(--line)); font-size: .8rem; overflow-wrap: anywhere; }
.workshop-note__context span { display: block; margin-top: .3rem; }
.workshop-note__actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.workshop-note__actions button { min-height: 44px; padding: .5rem .7rem; border: 1px solid var(--project-border, var(--line)); background: transparent; color: inherit; cursor: pointer; }
.workshop-note__form { display: grid; gap: .6rem; margin: 1rem 0; }
textarea { min-height: 6rem; width: 100%; padding: .8rem; border: 1px solid var(--project-border, var(--line)); background: var(--project-background, var(--surface)); color: inherit; font: inherit; resize: vertical; }
.button--ghost { background: transparent; color: inherit; }
.workshop-note__removed { font-style: italic; }
</style>
