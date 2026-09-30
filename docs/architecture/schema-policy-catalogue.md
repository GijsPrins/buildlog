# Buildlog schema and policy catalogue

Status: implementation baseline

This catalogue translates the approved v0.4 architecture into concrete
database objects. The accompanying initial migration is the authoritative
implementation; this document explains its intent and access boundaries.

## Conventions

- Identifiers use lowercase `snake_case`.
- Externally visible entities use UUID primary keys.
- Timestamps are `timestamptz`; work-log calendar dates are `date`.
- Money uses `numeric(14,2)` plus an ISO-style three-letter currency code.
- Roles and finite states are text with check constraints, avoiding database
  enum migration friction.
- Every Project-scoped child has `project_id` and composite referential
  constraints where necessary to prevent cross-Project references.
- All exposed tables have RLS enabled and explicit grants.
- Policy helpers live in the unexposed `private` schema, use an empty
  `search_path`, and are executable only by the roles that need them.
- Authorization is based on `auth.uid()` and database membership, never on
  user-editable JWT metadata.

## Tables

### `profiles`

Application-facing identity for a Supabase Auth user.

| Column | Required | Notes |
| --- | --- | --- |
| `id` | yes | PK and FK to `auth.users`; same identity |
| `display_name` | yes | Public-facing name, not an authorization input |
| `avatar_path` | no | Future profile image reference |
| `created_at` | yes | Creation audit |
| `updated_at` | yes | Maintained by trigger |

An Auth trigger creates the profile. Account deletion removes the profile but
does not remove authored Project content; author foreign keys become null.

### `projects`

One physical build, restoration, repair, or renovation.

Notable fields:

- globally unique lowercase `slug`;
- optional origin, motivation, and object-history story fields;
- public/private visibility;
- reporting currency;
- `items_enabled` and `cost_tracking_enabled` capability flags;
- optional current phase and hero image;
- complete, versioned Theme JSON;
- timestamps.

Constraint: cost tracking implies Items are enabled.

### `project_members`

Unique `(project_id, user_id)` membership with role `owner`, `contributor`, or
`reader`.

- A partial unique index permits at most one Owner.
- Deferred constraint triggers on Projects and memberships require exactly one
  Owner at transaction commit.
- Ordinary Data API grants are read-only. Membership changes use controlled
  server operations.

### `project_invitations`

Pending Contributor/Reader access for an exact normalized email.

The raw invitation token is never stored; only `token_digest` is persisted.
Accepted and revoked are mutually exclusive. One unresolved invitation per
Project/email is allowed; a server operation revokes an expired invitation
before replacing it.

The browser receives safe invitation metadata but never token digests or direct
write access.

### `project_phases`

Project-owned, ordered phase definitions. Archived phases remain available to
historical Logs. `(project_id, id)` is unique for composite references.

### `logs`

Chronological work session or meaningful Project event.

- Optional phase constrained to the same Project.
- Author defaults to the authenticated User and is not client-editable.
- Duration is optional and non-negative.
- `finding_decisions` is an ordered JSON array for the MVP.
- Slug uniqueness is Project-scoped.

### `items`

Reusable or Project-related object owned by one User. Actual and estimated
acquisition values have independent currency codes and cannot be negative.

An Item owner can edit its global fields. Other Users may read it only when it
is linked to a Project they can read.

### `project_items`

Unique Project/Item relationship containing role, optional status, notes, and
optional cost attributed to the Project.

At most one active relation per Project may have role `subject`. The attributed
amount is in the Project reporting currency.

### `log_item_usage`

One aggregate usage record per Log and ProjectItem. Composite foreign keys
guarantee that the Log and ProjectItem belong to the same Project.

### `project_specs`

Flexible ordered section/label/value dossier. No bicycle-specific columns.

### `project_images`

Metadata and upload reservation for an immutable original photograph.

- Optional Log must belong to the same Project.
- Storage path is generated from Project ID and image ID.
- Upload state is `reserved`, `ready`, or `failed`.
- Soft deletion uses `deleted_at`.
- Hero selection lives only on `projects.hero_image_id`.

## Private authorization helpers

| Helper | Roles | Purpose |
| --- | --- | --- |
| `can_read_project` | anon, authenticated | Public or member Project access |
| `project_role` | authenticated | Caller role lookup |
| `can_edit_project` | authenticated | Owner/Contributor content access |
| `is_project_owner` | authenticated | Administrative access |
| `can_read_profile` | anon, authenticated | Self, shared Project, or public author |
| `can_read_item` | anon, authenticated | Item owner or readable linked Project |
| `can_upload_project_image` | authenticated | Matching image reservation and editor |
| `can_read_project_image_object` | anon, authenticated | Storage object linked to readable image |

Every helper is `security definer`, has `search_path = ''`, uses fully qualified
relations, and internally derives the caller with `auth.uid()`.

## RLS summary

| Table | Anonymous | Reader | Contributor | Owner |
| --- | --- | --- | --- | --- |
| `profiles` | Relevant public authors | Relevant members | Relevant members | Relevant members |
| `projects` | Read public | Read | Read | Read/update |
| `project_members` | Public Project members | Read same Project | Read same Project | Read same Project |
| `project_invitations` | None | None | None | Read safe fields |
| `project_phases` | Read public | Read | Read | CRUD |
| `logs` | Read public | Read | CRUD | CRUD |
| `items` | Read via public Project | Read via Project | Own CRUD; linked read | Own CRUD; linked read |
| `project_items` | Read public | Read | CRUD when enabled | CRUD when enabled |
| `log_item_usage` | Read public | Read | CRUD when Items enabled | CRUD when Items enabled |
| `project_specs` | Read public | Read | CRUD | CRUD |
| `project_images` | Read public | Read | Create/update | Create/update |

Projects, memberships, invitations, phases, and original object deletion have
no broad client delete path. Destructive or invariant-sensitive operations are
implemented as controlled server actions.

## Storage policies

Bucket: `project-originals` (private).

- `SELECT`: permitted only when the object name matches a non-deleted
  `project_images` row whose Project is readable.
- `INSERT`: permitted only for an authenticated Owner/Contributor when a
  matching reserved image row exists and `uploaded_by_user_id` is the caller.
- `UPDATE`: not granted, so originals cannot be overwritten/upserted.
- `DELETE`: not granted to clients; delayed purge is a trusted server action
  using the Storage API, never direct SQL against `storage.objects`.

## Financial derivation rules

- Application-wide actual expenditure counts every Item purchase once.
- Project intrinsic cost sums attributed ProjectItem amounts for Subject, Part,
  Material, and External Service.
- Consumable Project cost sums `log_item_usage.usage_amount`.
- Tool purchases are reported separately and never folded into intrinsic cost.
- Estimated values are planning information only.
- Project totals are hidden when cost tracking is disabled.
- Values in different currencies are never silently combined.

Financial views/functions follow after the base schema and authorization tests;
they are not stored columns on Project.

## Required tests

The first database test suite covers:

1. RLS enabled on every public table.
2. Anonymous public/private visibility.
3. Non-member isolation.
4. Reader read-only behavior.
5. Contributor content CRUD and administration denial.
6. Owner administration behavior.
7. Exactly-one-Owner creation and transfer invariants.
8. Wrong-Project phase, image, and Item usage references.
9. Immutable author/uploader identity through column grants.
10. Optional Items/cost capability behavior.
11. Storage reservation-based upload and read access.
12. Denial of original overwrite and client deletion.

Local execution requires Docker because the Supabase CLI test environment runs
the local stack in containers.
