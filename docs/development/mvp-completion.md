# MVP completion — v0.4

Updated 4 October 2026. Social features remain outside this work.

## First delivery: quantities and financial foundations

- Preserve existing `log_item_usage.usage_amount` as quantity: that is how the shipped forms described it.
- Add nullable `usage_cost` in the project's reporting currency. Existing quantities are never converted into costs.
- Create/edit log forms and in-tab drafts carry quantity and cost independently.
- Project cost sums explicit allocations for subject/part/material/service plus consumable usage costs. Missing allocations do not silently fall back to full purchase prices.
- Tool purchases, linked actual purchases, and unpurchased estimates are shown separately. A zero-price purchase is actual, not planned.
- Linked purchases deduplicate item IDs within the project. They are explicitly not workshop-wide expenditure; adding totals from multiple projects would double-count shared purchases.
- Foreign-currency purchases/estimates are excluded with a notice. Missing values are reported rather than presented as a complete budget.
- New ledger items can record estimates; existing entries can have their project allocation set.

The live migration is additive. Database verification uses temporary fixture accounts and a rollback-only transaction, testing contributor updates, quantity preservation, negative-value rejection, reader denial and outsider isolation.

## Remaining deliveries

- [x] Shared-item editing by the item owner; project role/status/note/allocation editing by contributors and owners.
- [x] Existing owned-item selection and reuse across projects without duplicating purchases.
- [x] Removal via an explicit `removed` status, preserving ledger links and log history. Permanent unlink/delete is not exposed.
- [ ] Workshop-wide deduplicated expenditure, currency-grouped totals and full estimate editing.
- [x] Project specifications dossier: generic sections, facts, notes, sources, ordering, editor permissions and optional Bicycle Restoration suggestions.
- [ ] Ordinary ownership-transfer UI and log deletion.
- [ ] Multiple editable finding/decision pairs and visible log authorship.
- [ ] Generic completion state instead of interpreting phase names.
- [ ] Complete template definition, body-font control and representative theme preview.
- [ ] Mobile/accessibility and end-to-end live workflow verification.

Other follow-up work: persistent drafts beyond tab navigation, storage backup/export, monitoring and privacy/retention documentation.

## Existing advisor notice

Supabase still reports leaked-password protection disabled; no new database security advisory was reported for this migration. See [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
