import type { ProjectLog } from '~/types/domain'

export function useLogAuthors() {
  const names = ref<Record<string, string>>({})
  async function loadAuthors(logs: ProjectLog[]) {
    names.value = {}
    const ids = [...new Set(logs.flatMap(log => log.created_by_user_id ? [log.created_by_user_id] : []))]
    if (!ids.length) return
    if (useDemoMode().value) {
      const accounts = useLocalAccounts().state.value.accounts
      names.value = Object.fromEntries(accounts.filter(account => ids.includes(account.id)).map(account => [account.id, account.name]))
    } else {
      const { data, error } = await useSupabase()!.from('profiles').select('id,display_name').in('id', ids)
      if (!error) names.value = Object.fromEntries((data ?? []).map(profile => [profile.id, profile.display_name]))
    }
  }
  function authorName(log: ProjectLog) {
    if (!log.created_by_user_id) return 'Former member'
    return names.value[log.created_by_user_id] || 'Workshop member'
  }
  return { loadAuthors, authorName }
}
