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

This first social delivery uses flat conversations. Threaded replies, notifications, reports and automated abuse handling remain follow-up work. The current controls are verified accounts, text limits, immutable attribution, author editing/removal, and owner removal. No notification messages or emails are sent by commenting or stamping.
