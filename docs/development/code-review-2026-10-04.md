# Code review — 4 October 2026

Reviewed revision: `a02c7ca` on `main`. This is a review of the current application, not only the latest demo commit. Application code and live user data were not changed.

## Findings

### 1. [P1] Retrying a partially saved new log creates another log

Location: `app/pages/projects/[slug]/logs/new.vue:219`, `:258`, `:262`.

Each submit generates a fresh slug and inserts a new log before saving usage, statuses and photographs. If any subsequent step fails, the form remains open and its submit button is enabled again. The inserted log ID is not retained for retry. Submitting again inserts another session, duplicating time and potentially usage costs. Successfully uploaded photos from the first attempt remain on the first copy. The failure message always describes a photo failure, even when usage or item status failed.

Reproduced by executing the actual SFC submit function with a stubbed API: successful log insert, simulated upload failure, then another submit. Two distinct logs were inserted.

Recommendation: retain a stable operation/log ID and resume the same log and image reservations. Save relational log data transactionally. Clearly distinguish complete, partially saved and failed states; provide a resume action rather than repeating creation.

### 2. [P1] Replacing log usage can permanently erase the previous record

Location: `app/pages/projects/[slug]/logs/[logSlug].vue:174`.

The log correction first updates the log, then deletes every `log_item_usage` row for it, then inserts replacements in another request. If validation, connectivity or permissions make the insertion fail, the deletion is already committed. Previously recorded quantities, notes and usage costs disappear even though the UI reports a failed save. Later status/photo changes can also leave the overall correction only partially applied.

Reproduced with the actual save function: an existing usage record, successful delete, simulated replacement insert failure. The original record was gone after save failed.

Recommendation: use an authorized transaction/RPC for the relational correction, rolling back all changes together. Keep file uploads resumable separately; do not delete the previous data until the replacement can commit.

### 3. [P1] Failed reads are treated as empty data in the log editor

Location: `app/pages/projects/[slug]/logs/[logSlug].vue:107`, `:121`.

After loading the project/log, the editor reads phases, images, project items, usage and membership together. It does not inspect the errors on those results. A failed usage or item read therefore produces an apparently valid, editable form with no selected items. Saving this form runs the replacement logic above and can delete real usage records that were never displayed. This also happens with a successful delete/insert path, so fixing transactionality alone does not fix it.

Reproduced by failing only the usage read while allowing project/log/membership reads. The form had editing permission, zero usages and no error message.

Recommendation: check every required read and block editing/saving until the complete snapshot is available. Distinguish an empty result from a failed or incomplete result, and provide retry.

### 4. [P2] Project changes can commit before a failed save, and retries duplicate phases

Location: `app/pages/projects/[slug]/edit.vue:124`, `:130`, `:133`.

Project editing reorders/archives existing phases and inserts new ones before updating the project record. A final project update rejected for an already-used slug leaves those phase changes committed. The generated IDs of new phases are only stored in the local `phaseIds` map, not in the form's `phase.id`. A retry inserts those phases again, then can fail on the unique `(project_id, sort_order)` constraint. Interruptions during the two-step ordering can also leave temporary sort positions stored.

Reproduced with the actual save function and a stub that enforces unique phase sort positions: add one phase, reject the project update for a duplicate slug, retry. A second copy was inserted and the retry collided with the first copy's final position.

Recommendation: update project metadata and phase configuration in one owner-authorized transaction. Validate slug/phase inputs before committing changes, and make retries idempotent.

### 5. [P2] Editing project currency silently reinterprets historic costs

Location: `app/pages/projects/[slug]/edit.vue:136`; `app/utils/financials.ts:23`, `:42`.

The project currency is freely editable. Allocations and consumable usage costs have no individual currency and are summed as amounts in the current project currency. Changing EUR to USD consequently displays an existing EUR 100 allocation as USD 100 without conversion or migration. Its actual EUR purchase is meanwhile excluded as foreign currency, making the cost figures inconsistent. The usage-cost migration explicitly documents those amounts as being in the project reporting currency.

Reproduced using `projectFinancials`: the same allocation yields project cost 100 in both EUR and USD; its EUR purchase ceases to contribute to the USD purchase total.

Recommendation: prevent currency changes once allocations/usage costs exist, or provide an explicit, transactional migration with a specified rate and preserved original currency. Renaming the reporting currency alone is insufficient.

### 6. [P2] Unpaginated reads truncate timelines and financial totals

Location: `app/pages/index.vue:87`; `app/pages/projects/[slug]/index.vue:114`, `:144`; `app/pages/projects/[slug]/logs/[logSlug].vue:111`.

Home aggregates logs from all visible projects in one unpaginated request. Project timelines, images, ledger items and usage also use unpaginated reads. When a result reaches the API row cap, missing rows are interpreted as the complete dataset: session/time statistics and costs become too low, and old records disappear from the timeline. An oversized individual log's usage is especially dangerous because the editor replaces all usage from its truncated selection.

The repository's API configuration sets `max_rows = 1000`. Supabase also documents the default 1,000-row limit and the need for pagination: [select documentation](https://supabase.com/docs/reference/javascript/select). The purchase overview already has `collectPages`, but these other screens do not use it. This finding is based on query inspection and configuration; no 1,001-row production fixture was created.

Recommendation: paginate presentation lists, read all rows needed for financial calculations or aggregate on the server, and never allow replacement from an incomplete editor snapshot. Use deterministic ordering for pagination.

## Verification and scope

- All 59 existing application tests passed; Nuxt typecheck passed.
- Five targeted local reproductions executed the real SFC functions/financial helper with simulated API results. These verify client control flow; they do not substitute for an end-to-end database transaction test.
- Read-only live metadata check: all 14 public tables have RLS enabled, the workshop thread view uses `security_invoker=true`, and the latest migration is `20261004161223`.
- Live Supabase security advisor returned only the existing warning about disabled leaked-password protection. It is a configuration follow-up, not a newly introduced code defect: [password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Reviewed auth/recovery, project creation/editing/membership, log creation/correction/deletion/draft handling, photo reservations, item ownership/reuse, financial calculations, theme handling, social comments/replies/stamps, demo persistence and Pages workflow.
- No production mutations, account deletion, email sending, migration changes, or deployment were performed. Browser/mobile checks and rollback RLS tests from previous deliveries were not rerun as part of this review. Concurrent ownership operations and real recovery email delivery are not certified by this pass.

## Stabilization order

First block edits on failed/incomplete reads. Then make log creation/correction and project configuration transactional and safely retryable, with failure-injection regression tests. Next protect currency history and paginate the remaining data reads. Broader refactoring can follow once those behaviors are covered; the duplicated save/upload code should converge on shared, tested operations.

## Resolution — 4 October 2026

All six findings are addressed. The original sections above describe the reviewed revision; their line numbers and reproduction results are historical.

1. New logs keep stable IDs/slugs across retries and ledger draft detours. Original photo reservations also keep stable IDs; a retry resumes uploads and skips confirmed originals. The upload helper only accepts the specific duplicate-object response when resuming an immutable reservation. Partial-upload errors explain that the session is saved and retry completes the same session.
2. `save_workshop_log` saves log fields, usage replacement, item statuses, existing photo edits and new reservations in one invoker-authorized transaction. Failed validation rolls everything back. Storage uploads remain separate and resumable. Disabled ledgers preserve existing usage rather than replacing it with an empty selection.
3. Required editor reads check errors and read the complete snapshot before enabling saves. Failed reads offer retry. New-log drafts remain pending until a successful read; no failed response becomes an authoritative empty ledger.
4. `save_project_record` saves phase configuration and project settings together, checks owner access before and after its project lock, and rejects incomplete/duplicate phase snapshots. New phase IDs persist in the form for retries. Cover reservations likewise keep their IDs across retries.
5. A database trigger rejects currency changes after any allocation or usage cost exists, including zero and hidden ledgers. The demo enforces the same rule. Currency may change before monetary history exists; no automatic exchange-rate conversion is implied.
6. Project lists, timelines, photos, usage, ledgers, phase configuration, account ownership and theme libraries use deterministic pagination. Exact counts detect incomplete/changing responses; batched ID filters avoid oversized requests. Required aggregation failures suppress incomplete results.

Migration `20261004190454_atomic_workshop_saves` is applied to the linked Supabase project. RPCs run as the caller and retain RLS; only authenticated callers can execute them.

Validation: 70 application tests, Nuxt typecheck and static Pages generation pass. `supabase/tests/atomic_saves_test.sql` passed all 21 rollback-only live checks before and after deployment, covering rollback, retry identity, membership restrictions, cross-project usage, phase consistency and currency protection. Regression tests execute the actual editor scripts with controlled read/save failures and exercise the shared upload/pagination operations.

An isolated mobile browser verified actual login, private project/cover creation, draft preservation through the parts ledger, additive photos/captions/roles, unchanged original bytes, time/usage, a deliberately failed upload followed by a retry with one log, a failed usage read that blocks editing, a rejected correction that preserves old usage, successful corrections/specifications, contributor/reader permissions, project settings and anonymous public project/log reads. Demo browser checks covered replies, stamp toggles, stored-demo upgrades and widths 320/390/768. The delete-account function removed all temporary accounts/projects/originals; verification found zero fixtures and zero orphan originals.

The existing leaked-password protection configuration warning remains separate from these six code findings. Email delivery and simultaneous multi-client editing were not certified by this stabilization pass.
