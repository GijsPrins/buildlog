<script setup lang="ts">
import type { WorkshopComment } from '~/utils/workshopSocial'
import { commentLimit, normalizeComment } from '~/utils/workshopSocial'

const props = defineProps<{ projectId: string; logId?: string; compact?: boolean; discussionTo?: string }>()
const auth = useAuth()
const demo = useDemoStore()
const local = useLocalAccounts()
const demoMode = useDemoMode()
const route = useRoute()
const fieldId = useId()
const section = ref<HTMLElement | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const message = ref('')
const approvalCount = ref<number | null>(null)
const commentCount = ref<number | null>(null)
const approved = ref(false)
const owner = ref(false)
const comments = ref<WorkshopComment[]>([])
const hasMore = ref(false)
const draft = ref('')
const editingId = ref('')
const editText = ref('')
const removingId = ref('')
const signInTo = computed(() => ({ path: '/login', query: { redirect: route.fullPath } }))
const subject = computed(() => props.logId ? 'session' : 'project')
let generation = 0
const pageSize = 20

function target(table: 'workshop_comments' | 'workshop_approvals', head = false) {
  const query = useSupabase()!.from(table).select('*', { count: 'exact', head }).eq('project_id', props.projectId)
  return props.logId ? query.eq('log_id', props.logId) : query.is('log_id', null)
}

async function readComments(more: boolean, current: number) {
  let rows: WorkshopComment[]
  if (demoMode.value) {
    const all = demo.socialEntries(props.projectId, props.logId || null).comments
    rows = all.slice(more ? comments.value.length : 0, (more ? comments.value.length : 0) + pageSize + 1)
  } else {
    let query = target('workshop_comments').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize + 1)
    const cursor = more ? comments.value.at(-1) : null
    if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
    const result = await query
    if (result.error) throw result.error
    rows = (result.data || []) as WorkshopComment[]
  }
  if (current !== generation) return
  hasMore.value = rows.length > pageSize
  comments.value = more ? [...comments.value, ...rows.slice(0, pageSize)] : rows.slice(0, pageSize)
}

async function load() {
  const current = generation
  loading.value = true; error.value = ''
  try {
    if (demoMode.value) {
      const entries = demo.socialEntries(props.projectId, props.logId || null)
      approvalCount.value = entries.approvals.length
      commentCount.value = entries.comments.length
      approved.value = entries.approvals.some(entry => entry.user_id === auth.user.value?.id)
      owner.value = local.role(props.projectId) === 'owner'
    } else {
      const userId = auth.user.value?.id
      const [approvals, notes, mine, membership] = await Promise.all([
        target('workshop_approvals', true), target('workshop_comments', true),
        userId ? target('workshop_approvals').eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
        userId && !props.compact ? useSupabase()!.from('project_members').select('role').eq('project_id', props.projectId).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null, error: null })
      ])
      for (const result of [approvals, notes, mine, membership]) if (result.error) throw result.error
      if (current !== generation) return
      approvalCount.value = approvals.count ?? 0
      commentCount.value = notes.count ?? 0
      approved.value = Boolean(mine.data)
      owner.value = membership.data?.role === 'owner'
    }
    if (!props.compact) await readComments(false, current)
  } catch (cause) {
    if (current === generation) { approvalCount.value = null; commentCount.value = null; comments.value = []; error.value = cause instanceof Error ? cause.message : 'Could not open the workshop conversation.' }
  } finally { if (current === generation) loading.value = false }
}

async function run(action: () => Promise<void>) {
  if (busy.value) return
  const current = generation
  busy.value = true; error.value = ''; message.value = ''
  try { await action(); if (current === generation) await load() }
  catch (cause) { if (current === generation) error.value = cause instanceof Error ? cause.message : 'The workshop could not save that change. Try again.' }
  finally { if (current === generation) busy.value = false }
}

async function toggleApproval() {
  if (!auth.user.value || approvalCount.value === null) return
  const projectId = props.projectId, logId = props.logId || null, userId = auth.user.value.id, next = !approved.value
  await run(async () => {
    if (demoMode.value) demo.setApproval(projectId, logId, next)
    else if (next) {
      const { error: failure } = await useSupabase()!.from('workshop_approvals').insert({ project_id: projectId, log_id: logId, user_id: userId })
      // Another tab may have already placed the same stamp.
      if (failure && failure.code !== '23505') throw failure
    } else {
      const query = useSupabase()!.from('workshop_approvals').delete().eq('project_id', projectId).eq('user_id', userId)
      const { error: failure } = await (logId ? query.eq('log_id', logId) : query.is('log_id', null))
      if (failure) throw failure
    }
  })
}

async function save(id?: string) {
  if (!auth.user.value) return
  const projectId = props.projectId, logId = props.logId || null, userId = auth.user.value.id, current = generation
  await run(async () => {
    const content = normalizeComment(id ? editText.value : draft.value)
    if (demoMode.value) demo.saveComment(projectId, logId, content, id)
    else {
      const result = id
        ? await useSupabase()!.from('workshop_comments').update({ content }).eq('id', id).eq('project_id', projectId).select('id').single()
        : await useSupabase()!.from('workshop_comments').insert({ project_id: projectId, log_id: logId, author_user_id: userId, content }).select('id').single()
      if (result.error) throw result.error
    }
    if (current !== generation) return
    if (id) { editingId.value = ''; editText.value = '' } else draft.value = ''
    message.value = id ? 'Workshop note updated.' : 'Your note is on the bench.'
  })
}

async function remove(id: string) {
  const projectId = props.projectId, logId = props.logId || null, current = generation
  await run(async () => {
    if (demoMode.value) demo.removeComment(projectId, logId, id)
    else {
      const result = await useSupabase()!.from('workshop_comments').delete().eq('id', id).eq('project_id', projectId).select('id').single()
      if (result.error) throw result.error
    }
    if (current === generation) { removingId.value = ''; message.value = 'Workshop note removed.' }
  })
}

async function more() {
  const current = generation
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await readComments(true, current) }
  catch { if (current === generation) error.value = 'Could not load more notes. Try again.' }
  finally { if (current === generation) busy.value = false }
}

function reset() {
  generation++; comments.value = []; draft.value = ''; editText.value = ''; editingId.value = ''; removingId.value = ''
  approvalCount.value = null; commentCount.value = null; approved.value = false; owner.value = false; busy.value = false; error.value = ''; message.value = ''; hasMore.value = false
  void load()
}
watch(() => [props.projectId, props.logId, props.compact, auth.user.value?.id], reset)
onMounted(async () => {
  await auth.initialize(); reset(); await nextTick()
  if (!props.compact && section.value?.id && route.hash === `#${section.value.id}`) section.value.scrollIntoView({ block: 'start' })
})
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section ref="section" class="workshop-social" :class="{ 'workshop-social--compact': compact }" :aria-label="`${subject} conversation and approval`">
    <header v-if="!compact"><p class="eyebrow">Around the bench</p><h2>Notes from the workshop</h2><p>Questions, encouragement and a second pair of eyes.</p></header>
    <div class="workshop-social__actions">
      <button v-if="auth.user.value" type="button" class="approval-stamp" :class="{ 'is-stamped': approved }" :aria-pressed="approved" :aria-label="`${approved ? 'Remove your' : 'Give this ' + subject + ' a'} stamp of approval`" :disabled="loading || busy || approvalCount === null" @click="toggleApproval">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 2 4 3 5-1 1 5 4 3-2 4 2 4-4 3-1 5-5-1-4 3-4-3-5 1-1-5-4-3 2-4-2-4 4-3 1-5 5 1z" /><path d="m10 16 4 4 8-9" /></svg>
        <span>{{ approved ? 'Your stamp is on it' : 'Stamp of approval' }}</span><strong>{{ approvalCount ?? '—' }}</strong>
      </button>
      <NuxtLink v-else class="approval-stamp" :to="signInTo" :aria-label="`Sign in to give this ${subject} a stamp of approval`">
        <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" /><path d="m10 16 4 4 8-9" /></svg><span>Stamp of approval</span><strong>{{ approvalCount ?? '—' }}</strong>
      </NuxtLink>
      <NuxtLink v-if="compact && discussionTo" class="workshop-social__discussion" :to="discussionTo">{{ commentCount ?? '—' }} {{ commentCount === 1 ? 'workshop note' : 'workshop notes' }} →</NuxtLink>
      <span v-else class="muted">{{ commentCount ?? '—' }} {{ commentCount === 1 ? 'note' : 'notes' }}</span>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <button v-if="error" type="button" class="button button--ghost" :disabled="loading || busy" @click="load">Try again</button>
    <p v-if="message" role="status">{{ message }}</p>
    <template v-if="!compact">
      <form v-if="auth.user.value" class="workshop-social__form" @submit.prevent="save()">
        <label :for="`${fieldId}-note`">Leave a note at the bench</label>
        <textarea :id="`${fieldId}-note`" v-model="draft" :maxlength="commentLimit" :disabled="busy" required placeholder="A thought, a question, a little encouragement…" />
        <small>{{ draft.length }} / {{ commentLimit }} · Visible to everyone who can view this {{ subject }}.</small>
        <button class="button" type="submit" :disabled="busy || !draft.trim()">Leave workshop note</button>
      </form>
      <p v-else><NuxtLink :to="signInTo">Sign in to join the bench →</NuxtLink></p>
      <p v-if="!loading && !error && !comments.length" class="muted">The bench is quiet. Leave the first note.</p>
      <div class="workshop-social__notes">
        <article v-for="note in comments" :key="note.id">
          <header><strong>{{ note.author_display_name }}</strong><time :datetime="note.created_at">{{ formatProjectDate(note.created_at.slice(0, 10)) }}</time><small v-if="note.updated_at !== note.created_at">Edited</small></header>
          <form v-if="editingId === note.id" class="workshop-social__form" @submit.prevent="save(note.id)">
            <label :for="`${fieldId}-edit`">Edit your workshop note</label><textarea :id="`${fieldId}-edit`" v-model="editText" :maxlength="commentLimit" :disabled="busy" required />
            <div><button type="submit" class="button" :disabled="busy || !editText.trim()">Save note</button><button type="button" class="button button--ghost" :disabled="busy" @click="editingId = ''">Cancel edit</button></div>
          </form>
          <p v-else class="workshop-social__content">{{ note.content }}</p>
          <div v-if="auth.user.value && (note.author_user_id === auth.user.value.id || owner)" class="workshop-social__note-actions">
            <button v-if="note.author_user_id === auth.user.value.id && editingId !== note.id" type="button" :disabled="busy" @click="editingId = note.id; editText = note.content">Edit note</button>
            <template v-if="removingId === note.id"><span>Remove this note?</span><button type="button" :disabled="busy" @click="remove(note.id)">Confirm removal</button><button type="button" :disabled="busy" @click="removingId = ''">Keep note</button></template>
            <button v-else type="button" :disabled="busy" @click="removingId = note.id">{{ note.author_user_id === auth.user.value.id ? 'Remove note' : 'Remove note as owner' }}</button>
          </div>
        </article>
      </div>
      <button v-if="hasMore" type="button" class="button button--ghost" :disabled="busy" @click="more">More workshop notes</button>
    </template>
  </section>
</template>

<style scoped>
.workshop-social { margin-top: 2rem; padding: clamp(1rem, 3vw, 2rem); border: 1px solid var(--project-border, var(--line)); background: var(--project-surface, var(--surface)); color: var(--project-text, var(--ink)); scroll-margin-top: 6rem; }
.workshop-social--compact { margin-top: 1rem; padding: 1rem 0 0; border-width: 1px 0 0; background: transparent; }
.workshop-social h2 { margin: .4rem 0; font-family: var(--project-heading, Georgia, serif); font-size: 1.8rem; }
.workshop-social__actions { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
.approval-stamp { display: inline-flex; max-width: 100%; align-items: center; gap: .6rem; min-height: 44px; padding: .65rem .8rem; border: 2px solid currentColor; border-radius: 3px; background: transparent; color: var(--project-text, var(--ink)); font: 700 .8rem ui-monospace, monospace; cursor: pointer; }
.approval-stamp.is-stamped { border-style: double; border-width: 4px; padding: calc(.65rem - 2px) calc(.8rem - 2px); background: color-mix(in srgb, var(--project-primary, var(--primary)), transparent 90%); }
.approval-stamp svg { flex: 0 0 28px; width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 1.7; }
.approval-stamp strong { min-width: 1.4rem; padding-left: .5rem; border-left: 1px solid currentColor; text-align: center; }
.approval-stamp:disabled { opacity: .65; cursor: wait; }
.workshop-social__discussion { text-decoration: underline; color: inherit; }
.workshop-social__form { display: grid; gap: .6rem; margin: 1.5rem 0; }
.workshop-social__form textarea { min-height: 6rem; width: 100%; padding: .8rem; border: 1px solid var(--project-border, var(--line)); background: var(--project-background, var(--surface)); color: inherit; font: inherit; resize: vertical; }
.workshop-social__form .button { justify-self: start; }
.workshop-social__form .button--ghost { background: transparent; color: inherit; }
.workshop-social__notes article { padding: 1.25rem 0; border-top: 1px dashed var(--project-border, var(--line)); }
.workshop-social__notes header { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; }
.workshop-social__notes header strong { min-width: 0; overflow-wrap: anywhere; }
.workshop-social__notes time, .workshop-social__notes small { font-size: .8rem; }
.workshop-social__content { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.workshop-social__note-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.workshop-social__note-actions button { min-height: 44px; padding: .5rem .7rem; border: 1px solid var(--project-border, var(--line)); background: transparent; color: inherit; cursor: pointer; }
@media (max-width: 600px) { .workshop-social { scroll-margin-top: 10rem; } }
</style>
