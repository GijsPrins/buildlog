<script setup lang="ts">
import type { ThemeConfig } from '~/types/domain'
import type { ProjectEditorPhase } from '~/utils/projectEditor'
import { copyTheme, projectThemePresets } from '~/utils/projectEditor'

const props = defineProps<{
  projectId?: string
  mode: 'create' | 'edit'
  backTo: string
  backLabel: string
  currentHeroUrl?: string
  heroPreview?: string
  busy?: boolean
  errorMessage?: string
  successMessage?: string
}>()
const emit = defineEmits<{ submit: []; heroSelected: [event: Event] }>()

const name = defineModel<string>('name', { required: true })
const projectSlug = defineModel<string>('projectSlug', { required: true })
const subtitle = defineModel<string>('subtitle', { required: true })
const description = defineModel<string>('description', { required: true })
const startedStory = defineModel<string>('startedStory', { required: true })
const motivationStory = defineModel<string>('motivationStory', { required: true })
const objectStory = defineModel<string>('objectStory', { required: true })
const isCompleted = defineModel<boolean>('isCompleted', { default: false })
const isPublic = defineModel<boolean>('isPublic', { required: true })
const itemsEnabled = defineModel<boolean>('itemsEnabled', { required: true })
const costsEnabled = defineModel<boolean>('costsEnabled', { required: true })
const currencyCode = defineModel<string>('currencyCode', { required: true })
const theme = defineModel<ThemeConfig>('theme', { required: true })
const phases = defineModel<ProjectEditorPhase[]>('phases', { required: true })
const currentPhaseKey = defineModel<string | null>('currentPhaseKey', { required: true })
const themeLibrary = useThemeLibrary()
const themeLibraryError = ref('')
const themeLibraryName = ref('')
const themeLibraryBusy = ref(false)
const themeLibraryMessage = ref('')
async function savePalette() {
  themeLibraryError.value = ''; themeLibraryMessage.value = ''; themeLibraryBusy.value = true
  try {
    const id = await themeLibrary.save(null, themeLibraryName.value, theme.value)
    theme.value = copyTheme(theme.value); theme.value.preset = `custom-${id}`
    themeLibraryMessage.value = 'Palette saved in your theme library.'
  } catch (cause) { themeLibraryError.value = cause instanceof Error ? cause.message : 'Could not save this palette.' }
  finally { themeLibraryBusy.value = false }
}
onMounted(async () => { try { await themeLibrary.load() } catch (cause) { themeLibraryError.value = cause instanceof Error ? cause.message : 'Could not load saved themes.' } })

const activePhases = computed(() => phases.value.filter(phase => !phase.archived))
const projectStyle = computed(() => ({
  '--project-background': theme.value.colors.background,
  '--project-heading': theme.value.typography.heading === 'serif' ? 'Georgia, serif' : 'Arial, sans-serif',
  '--project-radius': { none: '0px', small: '4px', medium: '14px' }[theme.value.shape.radius],
  '--project-shadow': theme.value.shape.shadow === 'subtle' ? '8px 8px 0 #00000014' : 'none',
  '--project-primary': theme.value.colors.primary,
  '--project-secondary': theme.value.colors.secondary,
  '--project-accent': theme.value.colors.accent,
  '--project-surface': theme.value.colors.surface,
  '--project-border': theme.value.colors.border,
  '--project-text': theme.value.colors.text,
  '--project-muted': theme.value.colors.muted
}))

function applyPreset(preset: ThemeConfig) { theme.value = copyTheme(preset) }
function addPhase() { phases.value = [...phases.value, { key: `new-${crypto.randomUUID()}`, id: null, name: 'New phase', archived: false }] }
function movePhase(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= phases.value.length) return
  const next = [...phases.value]
  const [entry] = next.splice(index, 1)
  if (entry) next.splice(target, 0, entry)
  phases.value = next
}
function archivePhase(phase: ProjectEditorPhase) {
  phase.archived = !phase.archived
  phases.value = [...phases.value]
  if (phase.archived && currentPhaseKey.value === phase.key) currentPhaseKey.value = activePhases.value[0]?.key || null
}
</script>

<template>
  <form class="project-editor" :class="[`project-texture--${theme.decoration.texture}`, `project-frame--${theme.decoration.imageFrame}`]" :style="projectStyle" @submit.prevent="emit('submit')">
    <div class="project-editor__bar">
      <NuxtLink :to="backTo">← {{ backLabel }}</NuxtLink>
      <strong>{{ mode === 'create' ? 'FORM PRJ-01' : 'FORM PRJ-02' }}</strong>
      <span>{{ mode === 'create' ? 'New project record' : 'Master project record' }}</span>
    </div>

    <section class="project-editor__cover">
      <div>
        <p class="eyebrow">The object on the stand</p>
        <textarea v-model="name" required maxlength="160" aria-label="Project name" placeholder="Name this build" />
        <textarea v-model="subtitle" aria-label="Project subtitle" placeholder="One line that captures its character" />
        <textarea v-model="description" aria-label="Project description" placeholder="What are you making or restoring?" />
        <label><span>Workshop address</span><div>/projects/ <input v-model="projectSlug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*"></div></label>
      </div>
      <label class="project-editor__hero">
        <input class="sr-only" type="file" accept="image/*" @change="emit('heroSelected', $event)">
        <img v-if="heroPreview || currentHeroUrl" :src="heroPreview || currentHeroUrl" :alt="name || 'Project cover'">
        <span><strong>{{ heroPreview || currentHeroUrl ? 'Replace cover photo' : 'Choose cover photo' }}</strong><small>The image that makes you want to get back to the bench</small></span>
      </label>
    </section>

    <section class="project-editor__section">
      <header class="builder-section-heading"><span>01</span><div><p class="eyebrow">Project anchor</p><h2>The story</h2></div><p>Keep the reason for the build close to the work itself.</p></header>
      <div class="builder-story-grid"><article><span>01</span><label>How it started</label><textarea v-model="startedStory" placeholder="Where did you find it? What made you stop and look?" /></article><article><span>02</span><label>Why this build</label><textarea v-model="motivationStory" placeholder="What do you want to preserve, change or prove?" /></article><article><span>03</span><label>The object before us</label><textarea v-model="objectStory" placeholder="Known history, clues, scars — and what remains unknown." /></article></div>
    </section>

    <section class="project-editor__section">
      <header class="builder-section-heading"><span>02</span><div><p class="eyebrow">Route across the bench</p><h2>Build phases</h2></div><p>Shape the route now; it can keep changing as the work develops.</p></header>
      <div class="phase-editor">
        <article v-for="(phase, index) in phases" :key="phase.key" :class="{ 'is-archived': phase.archived, 'is-current': currentPhaseKey === phase.key }"><strong>{{ String(index + 1).padStart(2, '0') }}</strong><input v-model="phase.name" required aria-label="Phase name"><div><button type="button" :disabled="index === 0" @click="movePhase(index, -1)">↑</button><button type="button" :disabled="index === phases.length - 1" @click="movePhase(index, 1)">↓</button><button type="button" @click="archivePhase(phase)">{{ phase.archived ? 'Restore' : 'Archive' }}</button></div></article>
        <button class="phase-editor__add" type="button" @click="addPhase">+ Add project phase</button>
        <label class="phase-editor__current"><span>Current stage on the work order</span><select v-model="currentPhaseKey"><option :value="null">Not set</option><option v-for="phase in activePhases" :key="phase.key" :value="phase.key">{{ phase.name }}</option></select></label>
      </div>
    </section>

    <section class="project-editor__section">
      <header class="builder-section-heading"><span>03</span><div><p class="eyebrow">Visual identity</p><h2>Workshop colours</h2></div><p>Start with a preset, then tune it to the actual object.</p></header>
      <p><NuxtLink to="/themes">Manage your theme library →</NuxtLink></p>
      <p v-if="themeLibraryError" class="form-error" role="alert">{{ themeLibraryError }}</p>
      <div v-if="themeLibrary.themes.value.length" class="theme-editor"><button v-for="entry in themeLibrary.themes.value" :key="entry.id" type="button" :class="{ current: theme.preset === entry.config.preset }" :style="{ '--swatch-a': entry.config.colors.primary, '--swatch-b': entry.config.colors.accent, '--swatch-c': entry.config.colors.background }" @click="applyPreset(entry.config)"><i /><strong>{{ entry.name }}</strong><span>Your library</span></button></div>
      <div class="theme-editor"><button v-for="preset in projectThemePresets" :key="preset.name" type="button" :class="{ current: theme.preset === preset.name }" :style="{ '--swatch-a': preset.config.colors.primary, '--swatch-b': preset.config.colors.accent, '--swatch-c': preset.config.colors.background }" @click="applyPreset(preset.config)"><i /><strong>{{ preset.label }}</strong><span>{{ preset.name }}</span></button></div>
      <ThemeControls v-model="theme" />
      <div class="form-actions"><label class="field"><span>Keep this palette for another build</span><input v-model="themeLibraryName" maxlength="80" placeholder="Name this palette" :disabled="themeLibraryBusy"></label><button class="button button--ghost" type="button" :disabled="themeLibraryBusy || !themeLibraryName.trim()" @click="savePalette">{{ themeLibraryBusy ? 'Saving palette…' : 'Save to theme library' }}</button></div>
      <p v-if="themeLibraryMessage" role="status">{{ themeLibraryMessage }}</p>
    </section>

    <section class="project-editor__section">
      <header class="builder-section-heading"><span>04</span><div><p class="eyebrow">Workshop rules</p><h2>Record setup</h2></div><p>The buildlog can stay simple; enable only what earns its place.</p></header>
      <label v-if="mode === 'edit'" class="builder-toggle"><input v-model="isCompleted" type="checkbox" :disabled="busy"><span><strong>Project completed</strong><small>Move this build to the Vault. Uncheck to reopen it; phases and logs stay available.</small></span></label>
      <div class="project-editor__settings"><label class="builder-toggle"><input v-model="isPublic" type="checkbox"><span><strong>Public project</strong><small>Anyone with the address can read the project.</small></span></label><label class="builder-toggle"><input v-model="itemsEnabled" type="checkbox"><span><strong>Parts &amp; materials</strong><small>Show the BOM and connect parts to work orders.</small></span></label><label class="builder-toggle" :class="{ disabled: !itemsEnabled }"><input v-model="costsEnabled" type="checkbox" :disabled="!itemsEnabled"><span><strong>Track costs</strong><small>Optional amounts appear only while enabled.</small></span></label><label class="field"><span>Currency</span><input v-model="currencyCode" maxlength="3" pattern="[A-Za-z]{3}"></label></div>
    </section>

    <ProjectMembers v-if="projectId" :project-id="projectId" />
    <section v-else class="project-editor__section project-editor__collaboration">
      <header class="builder-section-heading"><span>05</span><div><p class="eyebrow">People around the bench</p><h2>Collaboration</h2></div><p>Roles belong to the project, not to the paperwork.</p></header>
      <div><article><span>Owner</span><strong>{{ mode === 'create' ? 'You will control the master project record' : 'You control the master project record' }}</strong><small>Contributors can add workshop logs; readers can follow the build.</small></article><aside><strong>Add people after creating your project</strong><p>Save the project, then open Edit project to add contributors and readers to your workshop.</p></aside></div>
    </section>

    <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p><p v-if="successMessage" class="form-success">{{ successMessage }}</p>
    <footer class="builder-submit"><div><p class="eyebrow">{{ mode === 'create' ? 'New record' : 'Master record' }}</p><strong>{{ activePhases.length }} active phases · {{ itemsEnabled ? 'parts ledger on' : 'simple buildlog' }}</strong></div><div><NuxtLink class="button button--ghost" :to="backTo">Cancel</NuxtLink><button class="button" type="submit" :disabled="busy">{{ busy ? (mode === 'create' ? 'Putting it on the stand…' : 'Updating project…') : (mode === 'create' ? 'Put this build on the stand →' : 'Save project record →') }}</button></div></footer>
  </form>
</template>
