<script setup lang="ts">
import { collectPages } from '~/utils/workshopFinancials'
import type { Project, ProjectSpec } from '~/types/domain'
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const project = ref<Project | null>(null)
const specs = ref<ProjectSpec[]>([])
const loading = ref(true)
const busy = ref(false)
const canEdit = ref(false)
const error = ref('')
const editingId = ref<string | null>(null)
const removingId = ref<string | null>(null)
const suggestion = ref('')
const form = reactive({ section: '', label: '', value: '', notes: '', source: '', sort_order: 0 })
const demo = useDemoStore()
const demoMode = useDemoMode()
const groups = computed(() => {
  const grouped = new Map<string, ProjectSpec[]>()
  for (const spec of [...specs.value].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))) {
    grouped.set(spec.section, [...(grouped.get(spec.section) || []), spec])
  }
  return [...grouped].map(([section, entries]) => ({ section, entries }))
})
function reset() {
  editingId.value = null; suggestion.value = ''
  Object.assign(form, { section: '', label: '', value: '', notes: '', source: '', sort_order: Math.max(-1, ...specs.value.map(spec => spec.sort_order)) + 1 })
}
function edit(spec: ProjectSpec) {
  editingId.value = spec.id; suggestion.value = ''; error.value = ''
  Object.assign(form, { section: spec.section, label: spec.label, value: spec.value, notes: spec.notes || '', source: spec.source || '', sort_order: spec.sort_order })
}
function suggest() {
  const selected = bicycleSpecSuggestions[Number(suggestion.value)]
  if (suggestion.value !== '' && selected) { form.section = selected.section; form.label = selected.label }
}
async function load() {
  canEdit.value = false
  try {
    await useAuth().initialize()
    if (demoMode.value) {
      demo.initialize()
      const data = demo.getProject(slug.value)
      if (!data) throw new Error('Project unavailable.')
      project.value = data.project
      canEdit.value = useLocalAccounts().canWrite(data.project.id)
      specs.value = demo.listSpecifications(data.project.id)
    } else {
      const client = useSupabase()!
      const { data, error: failure } = await client.from('projects').select('*').eq('slug', slug.value).single()
      if (failure) throw failure
      project.value = data as Project
      const user = useAuth().user.value
      if (user) {
        const { data: member, error: memberError } = await client.from('project_members').select('role').eq('project_id', data.id).eq('user_id', user.id).maybeSingle()
        if (memberError) throw memberError
        canEdit.value = member?.role === 'owner' || member?.role === 'contributor'
      }
      const rows = await collectPages<ProjectSpec>((from, to) => client.from('project_specs').select('*', { count: 'exact' }).eq('project_id', data.id).order('sort_order').order('id').range(from, to))
      specs.value = rows as ProjectSpec[]
    }
  } catch (cause) { canEdit.value = false; error.value = cause instanceof Error ? cause.message : 'Could not load specifications.' }
  finally { loading.value = false }
}
async function save() {
  if (!project.value || !canEdit.value) return
  busy.value = true; error.value = ''
  try {
    const changes = normalizeSpecification(form)
    if (demoMode.value) demo.saveSpecification(project.value.id, editingId.value, changes)
    else {
      const client = useSupabase()!
      const query = editingId.value
        ? client.from('project_specs').update(changes).eq('id', editingId.value).eq('project_id', project.value.id)
        : client.from('project_specs').insert({ ...changes, project_id: project.value.id })
      const { error: failure } = await query.select('id').single()
      if (failure) throw failure
    }
    await load(); reset()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not save specification.' }
  finally { busy.value = false }
}
async function remove(id: string) {
  if (!project.value || !canEdit.value) return
  busy.value = true; error.value = ''
  try {
    if (demoMode.value) demo.deleteSpecification(project.value.id, id)
    else {
      const { error: failure } = await useSupabase()!.from('project_specs').delete().eq('id', id).eq('project_id', project.value.id).select('id').single()
      if (failure) throw failure
    }
    removingId.value = null; await load(); if (editingId.value === id) reset()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Could not delete specification.' }
  finally { busy.value = false }
}
onMounted(async () => { await load(); reset() })
</script>
<template>
  <p v-if="loading" role="status">Opening the project dossier…</p>
  <div v-else class="specifications" :style="projectThemeStyle(project?.theme_config)">
    <NuxtLink :to="`/projects/${slug}`">← {{ project?.name || 'Back to project' }}</NuxtLink>
    <h1>Project specifications</h1>
    <p>Measurements, identification and facts worth keeping with the build.</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <template v-if="project">
      <p v-if="!specs.length">No specifications recorded yet.</p>
      <section v-for="group in groups" :key="group.section" class="spec-section">
        <h2>{{ group.section }}</h2>
        <article v-for="spec in group.entries" :key="spec.id">
          <h3>{{ spec.label }}</h3><p class="spec-value">{{ spec.value }}</p>
          <p v-if="spec.notes">{{ spec.notes }}</p><p v-if="spec.source" class="muted">Source: {{ spec.source }}</p>
          <div v-if="canEdit">
            <button type="button" class="button button--ghost button--small" :disabled="busy" @click="edit(spec)">Edit {{ spec.label }}</button>
            <button v-if="removingId !== spec.id" type="button" class="button button--ghost button--small" :disabled="busy" @click="removingId = spec.id">Delete {{ spec.label }}</button>
            <span v-else>Delete this fact? <button type="button" :disabled="busy" @click="remove(spec.id)">Confirm delete</button> <button type="button" :disabled="busy" @click="removingId = null">Keep it</button></span>
          </div>
        </article>
      </section>
      <form v-if="canEdit" class="form-card" @submit.prevent="save">
        <h2>{{ editingId ? 'Edit specification' : 'Add specification' }}</h2>
        <fieldset :disabled="busy">
          <label v-if="!editingId" class="field">Optional bicycle suggestion<select v-model="suggestion" @change="suggest"><option value="">Write your own fact</option><option v-for="(entry, index) in bicycleSpecSuggestions" :key="index" :value="String(index)">{{ entry.section }} — {{ entry.label }}</option></select></label>
          <label class="field">Section<input v-model="form.section" required maxlength="120" placeholder="Frame, engine, roof…"></label>
          <label class="field">Label<input v-model="form.label" required maxlength="160" placeholder="Material, serial number, size…"></label>
          <label class="field">Value<textarea v-model="form.value" required /></label>
          <label class="field">Notes<textarea v-model="form.notes" /></label>
          <label class="field">Source<input v-model="form.source" placeholder="Manual, measurement, website or original marking"></label>
          <label class="field">Display order<input v-model.number="form.sort_order" type="number" min="0" step="1" required></label>
          <button class="button" type="submit">{{ busy ? 'Saving…' : editingId ? 'Save specification' : 'Add specification' }}</button>
          <button v-if="editingId" class="button button--ghost" type="button" @click="reset">Cancel edit</button>
        </fieldset>
      </form>
    </template>
  </div>
</template>
<style scoped>
.specifications { max-width: 900px; margin: 2rem auto; }
.spec-section { margin: 2rem 0; }
article { border-top: 1px solid #ccc; padding: 1rem 0; overflow-wrap: anywhere; }
article h3 { font-size: 1rem; } .spec-value { font-size: 1.15rem; white-space: pre-wrap; }
fieldset { border: 0; padding: 0; min-width: 0; } h1 { margin-top: 1rem; }
</style>
