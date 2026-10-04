# Code review, round 2 — 4 October 2026

Reviewed revision: `70d879f` on `main`. Application code and deployed functions were not changed by this review. Findings below are distinct from the six resolved findings in the first review.

## 1. [P2] Removing a new photo after a partial save does not remove the persisted photo

Locations: `app/pages/projects/[slug]/logs/new.vue:146`; `app/composables/useLogPhotos.ts:14`; `supabase/migrations/20261004190454_atomic_workshop_saves.sql:56`.

Reproduction: select photos A and B for a new session; save A successfully and fail B's upload. The form stays open. Remove A with its photo removal button and retry. The retry sends only B as a new photo and sends an empty `imageEdits` array. A already belongs to the saved log and remains ready, undeleted and visible in the finished record. The same problem affects newly added photos in the correction form: they are absent from its original `imageEdits` snapshot.

The retry RPC only updates explicitly supplied existing images and inserts/reuses supplied new reservations. It does not reconcile reservations removed from the form. Thus removal succeeds visually but not in persisted data, potentially leaving an unwanted photograph visible on a public build.

Verified against the deployed RPC in a rollback-only fixture: mark the first reservation ready, retry the same log with no new photos and no image edits, and confirm the omitted photo remains attached, ready and undeleted. This tests metadata behavior; no original object was uploaded for this fixture.

Recommendation: track reservations created during the current save operation, including IDs removed from the form, and explicitly soft-delete omitted reservations in the authorized transaction. Do not delete every image absent from a request, because other contributors' images must remain intact.

## 2. [P2] A partially created project cannot resume creation

Locations: `app/pages/projects/new.vue:127`, `:156`, `:216`.

`create_project` commits the project, owner and phases before subsequent story, current-phase and cover operations. If one of those operations fails, the page re-enables the original creation button but retains no created-project ID or operation state. Retrying calls `create_project` again with the same slug, receives a uniqueness error and never retries the failed step. Changing the slug instead creates another project. A lost creation response has the same ambiguity.

Reproduced by executing the actual Vue SFC submit function with controlled API results: first creation succeeds; story update fails; a second submit calls `create_project` again and fails on the existing slug. The entered story and selected cover cannot be completed through this form's retry path. Users can manually recover by opening the existing project editor, but the creation form supplies no resume/open action.

Recommendation: save relational creation fields together and retain stable project/photo operation IDs. Resume the same project after partial upload failure, or explicitly direct the user to its editor with the pending input preserved. Disable repeated concurrent submits in the handler as well as the UI.

## 3. [P2] Adding photos can change their intended order after deletions or retries

Locations: `app/pages/projects/[slug]/logs/[logSlug].vue:163`; `app/utils/workshopSaves.ts:19`; `supabase/migrations/20261004190454_atomic_workshop_saves.sql:72`.

The correction form assigns new photo order from `images.length`. Existing `sort_order` values are not renumbered when photos are removed, so their count is not the next free position. For example, keep an existing photo at order 7 after deleting earlier photos; the next upload receives order 1 and appears before the retained photograph. Duplicate positions also fall back to UUID ordering rather than selection order.

On a resumed upload, the helper sends the current photo index as `sort_order`, but the RPC updates only role/caption/status of an existing reservation. If the selected set changes after a partial save, the new requested order is ignored for already-reserved photos.

Verified in rollback fixtures against the deployed RPC: retry an existing reservation with order 7 and observe order 0 retained; then retain a photo at order 7, append a reservation at the count-based offset 1, and observe the appended photo sorting first.

Recommendation: append after the maximum retained order, or transactionally normalize the complete ordered image set. Apply requested order when reusing a reservation and cover gaps, removed pending photos and partial retries in regression tests.

## Verification and limits

- All 70 application tests and Nuxt typecheck pass. No frontend production build was rerun because this turn changes only this review document.
- All 21 atomic-save database checks pass again. Three additional rollback checks confirmed the photo removal/order defects above.
- All 19 workshop reply/visibility/moderation database checks pass again.
- The older `buildlog_rls_test.sql` and `live_accounts_test.sql` suites could not execute on the linked database because pgTAP (`plan(integer)`) is not installed. Their assertions were not reported as passing. No extension was installed during this review.
- Read the live membership and ownership function definitions. Both check ownership before acquiring their project lock, without the post-lock recheck used by the new project-save RPC. A two-request fixture attempt denied the former owner; it did not establish that both requests overlapped at the required point. Treat simultaneous ownership/member changes as an unverified area and add a deterministic concurrency test, rather than treating this attempt as proof of correctness or a confirmed exploit.
- The temporary concurrency project and its three fixture accounts were removed. Photo/RPC fixtures were rolled back; no production user records or original files were changed.
- Supabase's security advisor still reports only the existing [disabled leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No new advisor finding was introduced.
- This is a targeted review of retry/reservation handling plus creation, membership, auth/recovery, ledger edits, theme editing and social query paths. It is not a guarantee that no other bugs exist. Email delivery and simultaneous multi-client edits remain outside verified coverage.

The previous fixes for duplicate log retries, atomic usage replacement, failed editor reads, atomic project/phase editing, currency history and complete pagination passed their checks again. These three findings are additional edge cases.

## Resolution

All three findings are resolved by `20261004193055_resumable_project_and_photo_saves`, applied to the linked Supabase project, and its client changes.

- Photo selection retains removed pending IDs through retries and new-log draft detours. The save transaction soft-deletes matching reservations uploaded by the caller; removing a photo that was never reserved is harmless. It preserves unrelated images.
- The database appends new selections after the maximum retained image order and updates order when reusing reservations. Removed images do not reserve positions. The demo also appends after the retained maximum.
- Project creation uses stable project/phase/cover IDs. A privileged private bootstrap creates membership and phases, then the existing owner-checked save transaction commits all metadata and stories together. Only active permanent accounts can bootstrap, and resuming an existing project requires ownership. Upload/confirmation retries reuse the same cover reservation and never overwrite originals.

The additional UX work keeps original images intact. Demo persistence now rolls back in-memory changes when browser storage rejects a write, preserves the previous complete disk record, and reports an actionable message. Local account writes also roll back; failed demo project creation restores its membership snapshot. Automatic demo seed upgrades do not block opening a full existing demo. A shared textarea directive grows/shrinks story and finding/decision fields, including after model changes and viewport resizing. Mobile workshop and project controls have a 44px minimum height.

Verification: 75 application tests, Nuxt typecheck and Pages generation pass. All 30 rollback-only checks in `supabase/tests/resumable_saves_test.sql` passed before and after migration deployment, including previous save guarantees, pending removals, append/retry order, creation rollback, ownership restrictions, story/current-phase persistence and stable retry identities.

The live browser forced a project cover upload failure and resumed the same project, then forced the second log photo upload to fail, removed the already uploaded first photo, and confirmed it remained removed after retry. It also verified unchanged original bytes, ledger draft detours, editor read/validation failures, corrections, specifications, permissions and anonymous public views. Demo browser checks injected actual `QuotaExceededError`, verified prior disk and memory contents and preserved form/draft input, then saved one log on retry with unchanged original bytes. Textarea growth/shrink and viewport widths 320/390/768 passed; measured mobile date/phase/time/caption/role fields were at least 44px. Existing seeded social/demo-upgrade checks passed.

All temporary live accounts/projects/photos were cleaned up; verification found zero fixture accounts/projects and zero orphan originals. The earlier pgTAP and simultaneous multi-client verification limitations remain; they are not claimed as resolved by this delivery.
