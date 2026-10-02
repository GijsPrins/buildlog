<script setup lang="ts">
import { copyTheme, defaultProjectTheme, projectThemePresets } from '~/utils/projectEditor'
import type { SavedTheme } from '~/composables/useThemeLibrary'
definePageMeta({ middleware: 'auth' })
const library = useThemeLibrary()
const id = ref<string | null>(null)
const name = ref('')
const theme = ref(defaultProjectTheme())
const busy = ref(false)
const error = ref('')
const message = ref('')
const deletePending = ref(false)
const savedFingerprint = ref('')
const dirty = computed(() => savedFingerprint.value !== JSON.stringify([id.value,name.value,theme.value]))
function remember() { savedFingerprint.value = JSON.stringify([id.value,name.value,theme.value]) }
function open(entry?: SavedTheme) {
  if (dirty.value && !window.confirm('Discard the unsaved changes to this theme?')) return
  id.value = entry?.id || null; name.value = entry?.name || ''; theme.value = entry ? copyTheme(entry.config) : defaultProjectTheme()
  deletePending.value = false; error.value = ''; message.value = ''; remember()
}
async function run(action: () => Promise<void>) {
  busy.value = true; error.value = ''; message.value = ''
  try { await action() } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not update the theme library.' }
  finally { busy.value = false }
}
async function save() { await run(async () => { id.value = await library.save(id.value,name.value,theme.value); theme.value.preset = `custom-${id.value}`; remember(); message.value = 'Theme saved. You can now choose it in a project.' }) }
async function duplicate(entry: SavedTheme) { await run(async () => { await library.save(null, `${entry.name.slice(0,73)} (copy)`,entry.config); message.value = 'Copy added to your library.' }) }
async function remove() { await run(async () => { await library.remove(id.value!); id.value = null; name.value = ''; theme.value = defaultProjectTheme(); deletePending.value = false; remember(); message.value = 'Theme removed. Projects using it keep their own copy.' }) }
remember()
onMounted(() => run(async () => { await library.load() }))
onBeforeRouteLeave(() => !dirty.value || window.confirm('Leave without saving this theme?'))
</script>
<template>
  <div class="theme-workshop">
    <header><p class="eyebrow">The paint shelf / your personal library</p><h1>Workshop themes</h1><p>Give your builds their own character. Mix a palette, try it on the stand, keep it for the next project.</p></header>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <div class="theme-workshop__layout">
      <aside><button class="button" :disabled="busy" @click="open()">+ New theme</button><h2>Your mixes</h2><p v-if="!library.themes.value.length" class="muted">Nothing on the shelf yet. Start with one of the workshop palettes.</p>
        <div v-for="entry in library.themes.value" :key="entry.id" class="theme-shelf"><button :disabled="busy" :aria-pressed="id === entry.id" @click="open(entry)"><i :style="{background:entry.config.colors.primary}" />{{ entry.name }}</button><button :disabled="busy" :aria-label="`Duplicate ${entry.name}`" @click="duplicate(entry)">Copy</button></div>
      </aside>
      <form class="theme-workshop__form" @submit.prevent="save"><label class="field"><span>Theme name</span><input v-model="name" maxlength="80" required placeholder="Ivory & oxblood, turquoise sprint…" :disabled="busy"></label>
        <fieldset :disabled="busy"><legend>Start from the workshop shelf</legend><div class="theme-starters"><button v-for="preset in projectThemePresets" :key="preset.name" type="button" @click="theme = copyTheme(preset.config)"><i :style="{background:preset.config.colors.primary}" />{{ preset.label }}</button></div><ThemeControls v-model="theme" /></fieldset>
        <div class="form-actions"><button class="button" :disabled="busy" type="submit">{{ busy ? 'Working…' : 'Save theme' }}</button><button v-if="id" class="button button--ghost" type="button" :disabled="busy" @click="deletePending = !deletePending">Delete theme</button></div>
        <div v-if="deletePending" class="theme-delete"><p>Remove this theme from your library? Existing projects will keep their colours.</p><button type="button" :disabled="busy" @click="remove">Yes, remove theme</button><button type="button" @click="deletePending = false">Cancel</button></div><p class="muted">Project colours are saved as a snapshot. Editing a library theme does not change existing builds.</p>
      </form><ThemePreview :theme="theme" :name="name" />
    </div>
  </div>
</template>
<style scoped>
.theme-workshop{max-width:1400px;margin:0 auto;padding:50px 24px}.theme-workshop h1{font-family:Georgia,serif;font-size:clamp(2.5rem,6vw,5rem);margin:10px 0}.theme-workshop header{max-width:760px;margin-bottom:40px}.theme-workshop__layout{display:grid;grid-template-columns:210px minmax(280px,1fr) minmax(300px,1fr);gap:26px;align-items:start}.theme-workshop__form{padding:24px;border:1px solid #d8d6ce;background:#fffdf8}.theme-workshop fieldset{border:0;padding:0;margin:24px 0}.theme-workshop legend{font:12px monospace;margin-bottom:12px}.theme-shelf{display:flex;gap:6px;margin:10px 0}.theme-shelf button,.theme-starters button{background:#fffdf8;border:1px solid #d8d6ce;padding:10px;text-align:left;cursor:pointer}.theme-shelf button:first-child{flex:1}.theme-shelf [aria-pressed=true]{outline:2px solid #123f36}.theme-shelf i,.theme-starters i{display:inline-block;width:16px;height:16px;border-radius:50%;margin-right:6px;vertical-align:middle}.theme-starters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}.theme-delete{padding:14px;border:1px solid #a33;margin-top:16px}.theme-delete button{margin-right:8px}@media(max-width:1100px){.theme-workshop__layout{grid-template-columns:190px 1fr}.theme-workshop__layout>:last-child{grid-column:2}}@media(max-width:700px){.theme-workshop__layout{display:flex;flex-direction:column}.theme-workshop__layout>*{width:100%}}
</style>
