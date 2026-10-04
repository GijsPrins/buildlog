<script setup lang="ts">
import type { WorkshopComment, WorkshopThread, WorkshopReply, WorkshopSummary } from '~/utils/workshopSocial'
import { commentLimit, normalizeComment } from '~/utils/workshopSocial'

const props = defineProps<{ projectId: string; logId?: string; compact?: boolean; discussionTo?: string; summary?: WorkshopSummary }>()
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
const comments = ref<WorkshopThread[]>([])
const replies = ref<Record<string, { rows: WorkshopReply[]; hasMore: boolean }>>({})
const replyTarget = ref<WorkshopComment | null>(null)
const replyDraft = ref('')
const hasMore = ref(false)
const draft = ref('')
const editingId = ref('')
const editText = ref('')
const removingId = ref('')
const signInTo = computed(() => ({ path: '/login', query: { redirect: route.fullPath } }))
const subject = computed(() => props.logId ? 'session' : 'project')
let generation = 0
// A parent-provided summary is used until this card changes something; then it reads its own counts.
let refreshed = false
const pageSize = 20

function target(table: 'workshop_comments' | 'workshop_approvals' | 'workshop_threads', head = false) {
  const query = useSupabase()!.from(table).select('*', { count: 'exact', head }).eq('project_id', props.projectId)
  return props.logId ? query.eq('log_id', props.logId) : query.is('log_id', null)
}

async function readComments(more: boolean, current: number) {
  let rows: WorkshopThread[]
  const amount = more ? pageSize : Math.max(pageSize, comments.value.length)
  if (demoMode.value) {
    const all = demo.socialEntries(props.projectId, props.logId || null).comments
    const roots = all.filter(note => !note.parent_id).map(note => ({ ...note, reply_count: all.filter(reply => reply.thread_id === note.id && reply.parent_id && !reply.deleted_at).length })).filter(note => !note.deleted_at || note.reply_count > 0)
    rows = roots.slice(more ? comments.value.length : 0, (more ? comments.value.length : 0) + amount + 1)
  } else {
    let query = target('workshop_threads').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(amount + 1)
    const cursor = more ? comments.value.at(-1) : null
    if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
    const result = await query
    if (result.error) throw result.error
    rows = (result.data || []) as WorkshopThread[]
  }
  if (current !== generation) return
  hasMore.value = rows.length > amount
  comments.value = more ? [...comments.value, ...rows.slice(0, amount)] : rows.slice(0, amount)
}

async function readReplies(threadId: string, more: boolean, current: number) {
  const existing = replies.value[threadId]
  const amount = more ? pageSize : Math.max(pageSize, existing?.rows.length || 0)
  let rows: WorkshopReply[]
  if (demoMode.value) {
    const all = demo.socialEntries(props.projectId, props.logId || null).comments
    const matching = all.filter(note => note.thread_id === threadId && note.parent_id && !note.deleted_at).map(note => ({ ...note, parent: all.find(parent => parent.id === note.parent_id) }))
    rows = matching.slice(more ? existing?.rows.length || 0 : 0, (more ? existing?.rows.length || 0 : 0) + amount + 1)
  } else {
    let query = useSupabase()!.from('workshop_comments').select('*').eq('project_id', props.projectId).eq('thread_id', threadId).not('parent_id', 'is', null).is('deleted_at', null).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(amount + 1)
    const cursor = more ? existing?.rows.at(-1) : null
    if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
    const result = await query
    if (result.error) throw result.error
    rows = (result.data || []) as WorkshopReply[]
    if (current !== generation) return
    const parentIds = [...new Set(rows.flatMap(note => note.parent_id ? [note.parent_id] : []))]
    if (parentIds.length) {
      // Fetch only the referenced parents, preserving RLS on both reads.
      const parents = await useSupabase()!.from('workshop_comments').select('id,author_display_name,content,deleted_at').eq('project_id', props.projectId).in('id', parentIds)
      if (parents.error) throw parents.error
      const byId = new Map((parents.data || []).map(parent => [parent.id, parent]))
      rows = rows.map(note => ({ ...note, parent: byId.get(note.parent_id!) || null }))
    }
  }
  if (current === generation) replies.value[threadId] = { rows: more ? [...existing!.rows, ...rows.slice(0, amount)] : rows.slice(0, amount), hasMore: rows.length > amount }
}

async function expand(threadId: string, more = false) {
  if (busy.value) return
  const current = generation
  busy.value = true; error.value = ''
  try { await readReplies(threadId, more, current) }
  catch { if (current === generation) error.value = 'Could not load the replies. Try again.' }
  finally { if (current === generation) busy.value = false }
}

async function startReply(note: WorkshopComment) {
  replyTarget.value = note; editingId.value = ''; removingId.value = ''
  if (!replies.value[note.thread_id]) await expand(note.thread_id)
  await nextTick()
  document.getElementById(`${fieldId}-reply`)?.focus()
}

async function load() {
  const current = generation
  loading.value = true; error.value = ''
  try {
    if (demoMode.value) {
      const entries = demo.socialEntries(props.projectId, props.logId || null)
      approvalCount.value = entries.approvals.length
      commentCount.value = entries.comments.filter(note => !note.deleted_at).length
      approved.value = entries.approvals.some(entry => entry.user_id === auth.user.value?.id)
      owner.value = local.role(props.projectId) === 'owner'
    } else if (props.compact && props.summary && !refreshed) {
      approvalCount.value = props.summary.approvals
      commentCount.value = props.summary.notes
      approved.value = props.summary.approved
    } else {
      const userId = auth.user.value?.id
      const [approvals, notes, mine, membership] = await Promise.all([
        target('workshop_approvals', true), target('workshop_comments', true).is('deleted_at', null),
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
    if (!props.compact) {
      await readComments(false, current)
      await Promise.all(comments.value.filter(note => replies.value[note.id]).map(note => readReplies(note.id, false, current)))
    }
  } catch (cause) {
    if (current === generation) { approvalCount.value = null; commentCount.value = null; comments.value = []; error.value = cause instanceof Error ? cause.message : 'Could not open the workshop conversation.' }
  } finally { if (current === generation) loading.value = false }
}

async function run(action: () => Promise<void>) {
  if (busy.value) return
  const current = generation
  busy.value = true; error.value = ''; message.value = ''
  try { await action(); refreshed = true; if (current === generation) await load() }
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

async function save(id?: string, asReply = false) {
  if (!auth.user.value) return
  const projectId = props.projectId, logId = props.logId || null, userId = auth.user.value.id, current = generation
  await run(async () => {
    const parentId = asReply ? replyTarget.value?.id || null : null
    if (asReply && !parentId) throw new Error('Choose a note to reply to.')
    const content = normalizeComment(id ? editText.value : asReply ? replyDraft.value : draft.value)
    if (demoMode.value) demo.saveComment(projectId, logId, content, id, parentId)
    else {
      const result = id
        ? await useSupabase()!.from('workshop_comments').update({ content }).eq('id', id).eq('project_id', projectId).select('id').single()
        : await useSupabase()!.from('workshop_comments').insert({ project_id: projectId, log_id: logId, author_user_id: userId, content, parent_id: parentId }).select('id').single()
      if (result.error) throw result.error
    }
    if (current !== generation) return
    if (id) { editingId.value = ''; editText.value = '' } else if (asReply) { replyDraft.value = ''; replyTarget.value = null } else draft.value = ''
    message.value = id ? 'Workshop note updated.' : asReply ? 'Your reply is on the bench.' : 'Your note is on the bench.'
  })
}

async function remove(id: string) {
  const projectId = props.projectId, logId = props.logId || null, current = generation
  await run(async () => {
    if (demoMode.value) demo.removeComment(projectId, logId, id)
    else {
      const result = await useSupabase()!.rpc('remove_workshop_comment', { p_comment_id: id })
      if (result.error) throw result.error
    }
    if (current === generation) {
      removingId.value = ''; message.value = 'Workshop note removed.'
      if (replyTarget.value?.id === id) { replyTarget.value = null; replyDraft.value = '' }
      if (editingId.value === id) { editingId.value = ''; editText.value = '' }
    }
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
  generation++; comments.value = []; replies.value = {}; replyTarget.value = null; replyDraft.value = ''; draft.value = ''; editText.value = ''; editingId.value = ''; removingId.value = ''
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
      <NuxtLink v-if="compact && discussionTo" class="workshop-social__discussion" :to="discussionTo">{{ commentCount ?? '—' }} {{ commentCount === 1 ? 'note' : 'notes' }} →</NuxtLink>
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
        <button class="button" type="submit" :disabled="busy || !draft.trim()">Leave note</button>
      </form>
      <p v-else><NuxtLink :to="signInTo">Sign in to join the bench →</NuxtLink></p>
      <p v-if="!loading && !error && !comments.length" class="muted">The bench is quiet. Leave the first note.</p>
      <div class="workshop-social__notes">
        <WorkshopNote v-for="note in comments" :key="note.id" :note="note" :user-id="auth.user.value?.id" :owner="owner" :busy="busy" :editing="editingId === note.id" :removing="removingId === note.id" v-model:edit-text="editText" @reply="startReply" @edit="editingId = $event.id; editText = $event.content; replyTarget = null" @cancel-edit="editingId = ''" @save="save" @request-removal="removingId = $event" @remove="remove" @cancel-removal="removingId = ''">
          <form v-if="replyTarget?.thread_id === note.id" class="workshop-social__form workshop-social__reply-form" @submit.prevent="save(undefined, true)">
            <label :for="`${fieldId}-reply`">Reply to {{ replyTarget.author_display_name }}</label>
            <p class="workshop-social__reply-context">“{{ replyTarget.content.slice(0, 120) }}{{ replyTarget.content.length > 120 ? '…' : '' }}”</p>
            <textarea :id="`${fieldId}-reply`" v-model="replyDraft" :maxlength="commentLimit" :disabled="busy" required placeholder="Keep the conversation going…" />
            <div><button type="submit" class="button" :disabled="busy || !replyDraft.trim()">Leave reply</button><button type="button" class="button button--ghost" :disabled="busy" @click="replyTarget = null; replyDraft = ''">Cancel reply</button></div>
          </form>
          <div v-if="note.reply_count || replies[note.id]?.rows.length" class="workshop-social__replies">
            <button v-if="!replies[note.id]" type="button" class="button button--ghost" :disabled="busy" @click="expand(note.id)">View {{ note.reply_count }} {{ note.reply_count === 1 ? 'reply' : 'replies' }}</button>
            <template v-else>
              <p class="eyebrow">Replies · newest first</p>
              <WorkshopNote v-for="reply in replies[note.id]!.rows" :key="reply.id" :note="reply" :user-id="auth.user.value?.id" :owner="owner" :busy="busy" :editing="editingId === reply.id" :removing="removingId === reply.id" v-model:edit-text="editText" @reply="startReply" @edit="editingId = $event.id; editText = $event.content; replyTarget = null" @cancel-edit="editingId = ''" @save="save" @request-removal="removingId = $event" @remove="remove" @cancel-removal="removingId = ''" />
              <button v-if="replies[note.id]!.hasMore" type="button" class="button button--ghost" :disabled="busy" @click="expand(note.id, true)">More replies</button>
            </template>
          </div>
        </WorkshopNote>
      </div>
      <button v-if="hasMore" type="button" class="button button--ghost" :disabled="busy" @click="more">More notes</button>
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
@media (max-width: 600px) { .workshop-social { scroll-margin-top: 10rem; } }
.workshop-social__replies { padding-left: clamp(.6rem, 2vw, 1.25rem); margin-top: 1rem; border-left: 2px solid var(--project-border, var(--line)); }
.workshop-social__reply-context { margin: 0; overflow-wrap: anywhere; font-size: .85rem; }
</style>
