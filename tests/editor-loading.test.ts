import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'
import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { checkedData } from '../app/utils/workshopSaves'
import { collectPages } from '../app/utils/workshopFinancials'

// Execute the actual editor scripts with controlled API failures, rather than
// reimplementing the load/save behavior in a test-only helper.
function editor(file: string, failTable: string) {
  let failing = true
  const save = vi.fn().mockResolvedValue({ id: 'saved-log' })
  const create = vi.fn().mockResolvedValue('saved-project')
  const takeDraft = vi.fn().mockReturnValue(null)
  const project = { id: 'project', slug: 'bike', items_enabled: true, cost_tracking_enabled: true }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
    from(table: string) {
      const query: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'is', 'order', 'range', 'maybeSingle', 'single']) query[method] = () => query
      query.then = (resolve: (result: unknown) => void) => resolve(failing && table === failTable
        ? { data: null, error: { message: 'Required read failed' } }
        : { data: table === 'projects' ? project : table === 'logs' ? { id: 'log', title: 'Title', slug: 'session', work_date: '2026-10-04', content: '', summary: '' } : table === 'project_members' ? { role: 'owner' } : [], count: 0, error: null })
      return query
    }
  }
  const source = readFileSync(`app/pages/projects/[slug]/${file}`, 'utf8')
    .match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!.replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
  const context = vm.createContext({
    Error, crypto: webcrypto, ref, computed, collectPages, checkedData, saveWorkshopLog: save, saveProjectCreation: create, logDrafts: () => ({ take: takeDraft }),
    createProjectTemplateSnapshot: () => ({ theme: {}, phases: ['Start'], itemsEnabled: false, costsEnabled: false }), projectTemplates: [], validateTheme: () => null,
    definePageMeta() {}, onMounted() {}, onBeforeRouteLeave() {}, onBeforeUnmount() {}, watch() {},
    useRoute: () => ({ params: { slug: 'bike', logSlug: 'session' }, query: {} }), useNuxtApp: () => ({}),
    useAuth: () => ({ user: ref({ id: 'owner' }) }), useDemoMode: () => ref(false), useDemoStore: () => ({}), useSupabase: () => client,
    useLogAuthors: () => ({ loadAuthors: async () => {}, authorName: () => '' }),
    useLogPhotos: () => ({ photos: ref([]), files: ref([]), removedPhotoIds: ref([]), clearPhotos() {} }),
    todayIso: () => '2026-10-04', projectThemeStyle: () => ({}), formatDuration: () => '',
    normalizeFindings: (v: unknown) => v, optionalAmount: (v: unknown) => v ?? null, slugify: (v: string) => v.toLowerCase(), navigateTo: async () => {}
  })
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { get: (expression: string) => vm.runInContext(expression, context), recover() { failing = false }, save, create, takeDraft }
}

describe('editor failure isolation', () => {
  it('resumes a partially created project and guards concurrent submits', async () => {
    const page = editor('../new.vue', '')
    page.get("name.value='New build';slug.value='new-build';startedStory.value='Kept story'")
    page.create.mockRejectedValueOnce(new Error('The project is saved, but its cover is not complete.'))
    await page.get('submit()')
    expect(page.get('busy.value')).toBe(false)
    await page.get('submit()')
    expect(page.create.mock.calls[1]![1]).toEqual(page.create.mock.calls[0]![1])
    expect(page.create.mock.calls[1]![2]).toEqual(page.create.mock.calls[0]![2])
    expect(page.create.mock.calls[0]![1].started_story).toBe('Kept story')
    page.get('busy.value=true'); await page.get('submit()')
    expect(page.create).toHaveBeenCalledTimes(2)
  })
  it('blocks log correction after a failed usage read and allows retry after a complete read', async () => {
    const page = editor('logs/[logSlug].vue', 'log_item_usage')
    await page.get('loadDetail()')
    expect(page.get('canEdit.value')).toBe(false)
    expect(page.get('log.value')).toBeNull()
    expect(page.get('errorMessage.value')).toBe('Required read failed')
    await page.get('save()')
    expect(page.save).not.toHaveBeenCalled()
    page.recover(); await page.get('loadDetail()')
    expect(page.get('canEdit.value')).toBe(true)
    expect(page.get('errorMessage.value')).toBe('')
  })
  it('blocks new logs after a failed item read and retries with the same ID after a save failure', async () => {
    const page = editor('logs/new.vue', 'project_items')
    await page.get('loadProject()'); await page.get('submit()')
    expect(page.get('canEdit.value')).toBe(false)
    expect(page.save).not.toHaveBeenCalled()
    page.recover(); await page.get('loadProject()')
    page.get("title.value='Session'")
    page.save.mockRejectedValueOnce(new Error('Photo failed'))
    await page.get('submit()'); await page.get('submit()')
    const first = page.save.mock.calls[0]![1].log
    expect(page.save.mock.calls[1]![1].log).toEqual(first)
    expect(first.id).toBeTruthy()
  })
  it('keeps the draft pending until a failed project read recovers', async () => {
    const page = editor('logs/new.vue', 'project_items')
    page.get("draftOwner.value='owner'")
    page.takeDraft.mockReturnValue({ title: 'Kept draft', phaseId: 'chosen-phase', workDate: '2026-10-04', photos: [] })
    await page.get('loadProject()')
    expect(page.takeDraft).not.toHaveBeenCalled()
    page.recover(); await page.get('loadProject()')
    expect(page.takeDraft).toHaveBeenCalledOnce()
    expect(page.get('title.value')).toBe('Kept draft')
    expect(page.get('phaseId.value')).toBe('chosen-phase')
    expect(page.get('errorMessage.value')).toBe('')
  })
})
