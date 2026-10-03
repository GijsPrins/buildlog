<script setup lang="ts">
import type { ImageRole } from '~/types/domain'
defineProps<{ src?: string; name: string | null; disabled?: boolean; removed?: boolean }>()
const caption = defineModel<string | null>('caption', { required: true })
const role = defineModel<ImageRole>('role', { required: true })
defineEmits<{ remove: [] }>()
</script>

<template>
  <figure class="log-photo-editor" :class="{ 'is-removed': removed }">
    <div class="log-photo-editor__image">
      <img :src="src" :alt="caption || name || 'Workshop photo'">
      <button type="button" :disabled="disabled" :aria-label="`${removed ? 'Keep' : 'Remove'} photo: ${name}`" @click="$emit('remove')">{{ removed ? 'Undo removal' : 'Remove photo' }}</button>
      <span v-if="removed" class="log-photo-editor__removed">Removed when you save</span>
    </div>
    <figcaption>
      <label><span>Caption</span><input v-model="caption" :disabled="disabled || removed" placeholder="What’s the story behind this photo?"></label>
      <label><span>This photo shows</span><select v-model="role" :disabled="disabled || removed">
        <option value="gallery">The session in general</option>
        <option value="before">Before</option><option value="after">After</option>
        <option value="damage">Damage</option><option value="identification">Identification</option>
        <option value="detail">A detail</option><option value="process">The process</option>
      </select></label>
    </figcaption>
  </figure>
</template>

<style scoped>
.log-photo-editor { min-width: 0; margin: 0; background: #202a27; color: white; }
.log-photo-editor__image { position: relative; }
.log-photo-editor__image img { display: block; width: 100%; height: 20rem; object-fit: contain; background: #17211e; }
.log-photo-editor__image button { position: absolute; top: .75rem; right: .75rem; padding: .6rem .8rem; border: 1px solid #ffffff80; background: #202a27; color: white; cursor: pointer; }
.log-photo-editor__image button:focus-visible { outline: 3px solid white; outline-offset: 3px; }
.is-removed img { opacity: .35; }
.log-photo-editor__removed { position: absolute; bottom: 1rem; left: 1rem; }
figcaption { display: grid; gap: .8rem; padding: 1rem; }
label { display: grid; gap: .4rem; font-size: .75rem; }
input, select { width: 100%; min-width: 0; padding: .65rem; border: 1px solid #8d9c93; border-radius: 0; background: #fffdf8; color: #18211e; font: inherit; }
</style>
