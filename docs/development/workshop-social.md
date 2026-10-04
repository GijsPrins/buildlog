# Workshop notes and approval stamps

Delivered after the v0.4 MVP, 4 October 2026.

Projects and individual workshop sessions have independent conversations and approval stamps. The visual is a small stamped seal and counter labelled **Stamp of approval**; an active stamp reads **Your stamp is on it**. It follows project ink/surface tokens and uses an accessible toggle with `aria-pressed`. Session cards show the stamp and a note-count link; the complete conversation lives on the session detail page. The project conversation follows its timeline, with a **Join the bench** shortcut in the project header. Conversation anchors account for the sticky mobile header.

Anonymous visitors can read public notes and counts and receive a sign-in link when they want to participate. Verified signed-in visitors can comment and stamp public projects without joining them. Private projects require membership, including Readers. Responding never grants permission to edit project content or manage members.

Authors can edit/remove their own notes. Project Owners can remove notes by other writers, with a confirmation step, but cannot rewrite them or remove their stamps. Notes are plain text, limited to 2,000 characters, newest first. Twenty notes load initially; compound `(created_at, id)` cursor pagination loads more without timestamp ties skipping records. Errors preserve unsaved text and offer retry. Auth/target changes discard previous thread state and ignore stale results.

`workshop_comments` and `workshop_approvals` use RLS and explicit column grants. A nullable `log_id` explicitly identifies project-level discussion. Composite log foreign keys prevent attaching a private log to a different public project. Partial unique indexes enforce one project/log stamp per user. Clients cannot assign another author, set display-name snapshots, move notes to another target, change timestamps or update approval rows. An internal trigger copies only the author's display name; profile/email visibility is unchanged.

Removing a log removes its discussion and stamps while preserving project-level discussion. Project deletion cascades both tables. Account deletion removes the user's stamps and retains contributed notes as **Former builder**, without user attribution/display-name retention. Demo mode mirrors these rules, persists locally and upgrades existing demo stores with empty social arrays. Account deletion copy now includes notes and stamps.

## Validation

- 55 application tests and Nuxt typecheck passed; static GitHub Pages generation succeeded.
- 31 rollback-only live database checks passed: public/private isolation, Reader participation without content editing, author/target/display-name spoof protection, blank/oversized rejection, duplicate prevention, withdrawing own stamps, moderation, anonymous/unverified denial, visibility changes, account anonymization and log deletion.
- Isolated demo browser: project/session separation, stamps and withdrawal, create/edit/remove confirmation, escaped markup, reload persistence, anonymous sign-in prompts and width checks at 320/390/768 pixels.
- Real Supabase browser/API: creation/edit/reload, public visitor participation, owner moderation, 25-note pagination with timestamp ties, private Reader participation without log editing, revoked public access, and mobile width.
- Temporary live accounts/projects and all fixture comments/stamps were removed with the deployed account-deletion Edge Function. Cleanup queries returned zero fixtures.

Security/performance advisors found no notices on the new tables. Existing leaked-password protection remains disabled ([Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)); existing unrelated index/policy/connection notices were unchanged.

The first delivery used flat conversations; the Reply delivery below adds grouped answers. Notifications, reports and automated abuse handling remain follow-up work. The current controls are verified accounts, text limits, immutable attribution, author editing/removal, and owner removal. No notification messages or emails are sent by commenting or stamping.


## Demo conversations

Both built-in demo projects and all four demo sessions include fictional workshop notes and stamps of approval. Project and session conversations include answers; the Peugeot project also demonstrates replying to an answer. Fictional visitor identities are local sample data, not registered accounts. The current demo builder starts without a stamp so visitors can try adding and withdrawing their own.

Saved demos receive the examples once, identified by socialSeedVersion. The upgrade preserves personal notes and edits, skips deleted projects/sessions, avoids duplicate IDs and stamps, and persists its marker. Removed examples do not return on reload. Resetting the demo restores the complete sample. No production database data is seeded.

Validation: 59 application tests, Nuxt typecheck and Pages generation passed. Browser checks covered seeded project/session conversations, reply context, adding/withdrawing a stamp, widths of 320/390/768 pixels, and upgrading an existing saved demo while retaining a personal note without duplication on reload.

## Reply delivery

Every available note has a Reply action, including replies themselves. The editor names and quotes the selected recipient. Answers remain grouped under the original root with one visual indentation, and show their immediate parent for context. Roots and replies display newest first. Existing answers open through View replies; expanded threads stay open after changes and new answers are immediately visible. Roots and answers have independent 20-row cursor pagination.

New parent_id/thread_id references are set and checked on the server. Replies must refer to an available note within exactly the same project and log conversation. Clients can supply parent_id when posting, but cannot assign thread_id, move replies, or restore removed notes. Existing flat notes become roots; their content and edit dates are preserved. The demo store upgrades existing notes in the same way.

Removal now uses the authenticated remove_workshop_comment RPC. Its internal function checks the verified active actor, project visibility, and writer/Owner permission, including notes whose former author is now null. It erases content and records deleted_at; it cannot delete other writers' answers. Removed roots remain as a Removed note marker while live replies exist; empty removed conversations disappear. The security-invoker workshop_threads view exposes visible roots and live reply counts under the existing RLS. Note counters exclude removed rows. Deleted reply text also disappears from quoted answer context. Physical project/log deletion still cascades the whole conversation; account deletion still anonymizes attribution.

Validation: 57 application tests, Nuxt typecheck and Pages static generation passed. The 31 original database checks plus 19 reply checks passed in rollback-only transactions. New checks cover immediate-parent/original-root identity, target isolation, immutable thread assignment, unavailable parents, text erasure, preserved answers, root-marker visibility, removed-note immutability, view/count isolation, denied anonymous removal and denied moderation of former-author replies.

Isolated demo and real Supabase browser/API checks passed: reply to a root and to another reply, context labels, reopening after reload, answer editing/removal, preserved conversations after removal, 26-answer cursor pagination with tied timestamps, private Reader replies, revoked public access, and widths of 320/390/768 pixels. The live check found a self-reference embedding lookup failure; explicit batched parent reads now preserve RLS and load context reliably. All temporary live accounts/projects/notes were cleaned up through the deployed account-deletion function. Cleanup queries returned zero fixture rows.

Advisors reported no new security issue. The two new FK/thread indexes are marked unused on the newly introduced workload; they cover relationship checks and pagination and are intentionally retained. Existing unrelated notices remain unchanged.
