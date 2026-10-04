# MVP completion — v0.4

Updated 4 October 2026. Social features remain outside this work.

## Compact working context

Repository: `GijsPrins/buildlog`, branch `main`, Nuxt 4 + Supabase, deployed by Pages on push. Live project: `wymnzbcnbvixnspykvlu`. Public configuration is in GitHub Actions Variables. Originals stay in private Storage; the browser uses signed URLs and RLS.

Completed through the Purchases delivery (following `8858f3a`): auth/recovery, additive photos with captions/roles, in-tab log drafts, independent quantities/usage costs, project finances, item ownership/edit/reuse, specifications, ownership transfer, log deletion preserving originals, multiple findings and log authorship, explicit completion/reopening, template snapshots, project Theme Workshop and a deduplicated workshop purchase overview.

Next delivery: mobile/accessibility and the end-to-end live workflow audit. Purchases now supports independent owned items, shared items from enabled member ledgers, one purchase per item, per-currency actual/planned totals, tool subsets and full purchase/estimate editing. Existing RLS stays unchanged. Social features remain outside MVP.

Validation: 52 tests, typecheck, static Pages generation, isolated browser against the static build, rollback-only live DB permission checks. Purchases delivery passed 9 live checks. Dev HMR can become stale when generated imports change; use the static build for browser verification. Push verified changes to main as already authorized. Never use real user data in destructive tests.

Environment: PowerShell, repo E:\Code\buildlog; Node uses node_modules/nuxt/bin/nuxt.mjs and node_modules/vitest/vitest.mjs. Playwright bundled at C:/Users/gijsp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright, launch channel msedge. Demo isolation replaces Supabase URL/publishable key only in the intercepted navigation document. Static Pages base /buildlog/. Temporary preview serves .output/public with SPA fallback. Local account demo-user is Demo builder. No active test preview should remain after verification.

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
- [x] Workshop-wide deduplicated expenditure, currency-grouped totals, independent item creation and full purchase/estimate editing.
- [x] Project specifications dossier: generic sections, facts, notes, sources, ordering, editor permissions and optional Bicycle Restoration suggestions.
- [x] Ownership transfer to an existing member with email confirmation; previous owner becomes Contributor.
- [x] Log deletion with title confirmation; usage/time removed, originals retained in the project photo archive and cover preserved.
- [x] Multiple editable finding/decision pairs and visible log authorship, including former project members.
- [x] Explicit project completion/reopening by the owner, independent of phase names.
- [x] Bicycle Restoration template snapshot, optional template-free start, body-font control, project Theme Workshop and representative live preview.
- [ ] Mobile/accessibility and end-to-end live workflow verification.

Other follow-up work: persistent drafts beyond tab navigation, storage backup/export, monitoring and privacy/retention documentation.

## Existing advisor notice

Supabase still reports leaked-password protection disabled; no new database security advisory was reported for this migration. See [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Findings and authorship validation

40 application tests, Nuxt typecheck and Pages static generation passed. An isolated demo browser verified multiple observations, ledger detour/draft restoration, editing/removal, reload persistence, author display and mobile width. Six rollback-only live database checks verified former-author visibility for private readers, outsider/anonymous isolation, public author visibility and unchanged authorship after editing. Existing public-member profile visibility is preserved; unrelated profiles remain hidden.

## Project completion validation

The additive is_completed flag defaults to false. A one-time migration preserves existing Done/Complete/Completed dashboard classification; phase names no longer control completion afterwards. Older local demos receive the same one-time upgrade. Owners change completion in Edit project; completed projects remain readable and editable.

40 application tests, Nuxt typecheck and Pages generation passed. The isolated browser flow verified completion with a custom phase, Vault grouping, reopening while the phase is named Done, reload persistence and retained logs. Seven rollback-only live checks verified defaults, owner updates, contributor/reader/outsider denial and public read access.

## Template and theme delivery

Project creation copies Bicycle Restoration phases, theme, ledger defaults and optional dossier suggestions from one template definition. Starting without a template keeps the core generic. Users can customize phases before creation; later template changes do not update projects.

Owners have a project-specific /projects/:slug/theme workshop with live preview, preset reset, saved-theme restore and personal-library selection. The preview contains a cover, phases, statistics, log, badge, findings/decisions, cost row and typography. Shared token resolution applies body fonts to actual project content and avoids preset-specific component styling. Theme validation now accepts serif or sans body typefaces in application code and the database library validator.

44 application tests, Nuxt typecheck and static Pages generation passed. An isolated browser running the static build verified template defaults/blank start/customization and independence, project theme persistence/reset, library application, actual body typography and mobile width. Eight rollback-only live database checks verified serif saves, invalid-theme rejection, owner-only project editing, personal-library isolation and public project theme access.

## Workshop purchases delivery

Authenticated /purchases includes owned items (including unlinked purchases) and items shared through enabled ledgers of projects the user belongs to. Public builds without membership are excluded. Existing RLS hides shared disabled ledgers; the page states this limitation while retaining owned purchases. Item owners can create/edit purchases independently and reuse the same editor from project ledgers. Only one purchase editor can be open at a time.

Totals deduplicate item IDs, separate currencies without conversions, suppress estimates once an actual price exists (including zero) and identify tool expenditure as a subset of actual purchases. Missing money is reported. Project allocations and usage costs are separate. Exact-count pagination reads all records, handles lower server caps, and fails without showing partial totals; account changes clear previous results.

52 application tests, Nuxt typecheck, static Pages generation, and an isolated browser passed. Browser coverage: per-currency totals, free purchases, estimates, a shared tool on two projects, independent creation, search, linked projects, existing ledger-editor regression, persistence, mobile width and account isolation. Nine rollback-only live checks covered deduplication, unlinked ownership/create/edit, private inventory isolation, membership scope and shared-item editing permissions. No schema migration was needed.
