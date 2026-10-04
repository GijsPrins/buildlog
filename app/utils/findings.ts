export interface FindingDecision { finding: string; decision: string }

export function normalizeFindings(entries: FindingDecision[]) {
  return entries.map(entry => ({ finding: entry.finding.trim(), decision: entry.decision.trim() }))
    .filter(entry => entry.finding || entry.decision)
}
