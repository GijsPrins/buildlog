# Local user management — 30 September 2026

Local demo mode supports registration, sign-in/sign-out, remembered sessions, project memberships and account deletion. No Supabase setup or email service is needed.

The first visit seeds and signs into the existing demo owner so previous projects remain editable. Demo credentials: `builder@buildlog.local` / `Workshop2026!`. New accounts start with no project administration rights. Account state is stored separately from project data under `buildlog-local-accounts-v1`; passwords use PBKDF2-SHA256 with a random salt per account. This is a browser-local prototype, not production authentication or server-enforced access control. Use test credentials.

## Flows

- `/login`: sign in or create another account. Email addresses are trimmed and normalized. Duplicate emails are rejected.
- Project → Edit project → Workshop members: owners add contributors or readers by exact email. Existing accounts are added immediately. Unknown addresses become local invitations valid for seven days, accepted when that address registers/signs in in the same browser. No emails are sent. Owners can revoke access and cancel invitations.
- `/account`: delete the current account after typing its email. Preserve owned projects by assigning each to another existing account using its exact email, or explicitly delete all owned projects and their logs/photos/material links. Contributions to other owners' projects remain with account attribution removed.

Owner controls project administration and membership. Owner and Contributor write logs and materials. Reader views private projects but cannot write. Signed-out visitors see public projects. New projects belong to the current account. Quick Workshop Log lists writable projects only.

Accounts, invitations and projects live in this browser. To simulate collaboration, sign out and register/sign in with another demo account in the same browser profile. This does not synchronize between devices, verify email ownership or send real invitations. Live Supabase account deletion and invitations remain a separate integration task.

Tests cover sign-in failures, exact-email recognition, role restrictions, expired/duplicate invitations, revoked access, private-project visibility, ownership transfer and cascading project cleanup.
