# Buildlog database, RLS, and Storage design

Status: accepted architecture baseline

This document defines the concrete technical direction following the v0.4
architecture review. It intentionally contains no SQL DDL or migration code.

## 1. Design goals

The persistence layer must guarantee:

- strict isolation between Projects;
- exactly one Owner per Project;
- safe, atomic ownership transfer;
- public reading without public mutation;
- Contributor editing without administrative authority;
- Reader access to private Projects;
- referential integrity across all Project-scoped records;
- optional Items/BOM and optional cost tracking;
- no double-counting of shared purchases;
- immutable original photographs;
- RLS and Storage authorization derived from the same Project membership.

All tables exposed through the Supabase Data API use RLS. Grants and policies
are designed together and tested together.

## 2. Conceptual relations

### Identity and Projects

`profiles`

- One application profile per Supabase Auth user.
- Contains display information only; authorization does not rely on editable
  user metadata.

`projects`

- Project identity, global slug, content metadata, three optional story anchors
  (origin, motivation, and object history), visibility, current phase, hero
  image, reporting currency, capability settings, and Theme JSON.
- `items_enabled` and `cost_tracking_enabled` are explicit settings.
- Cost tracking cannot be enabled while Items are disabled.
- Disabling either setting never deletes existing records.

`project_members`

- One row per Project and User.
- Role is Owner, Contributor, or Reader.
- A partial uniqueness rule permits at most one Owner per Project.
- A deferred commit-time invariant requires exactly one Owner.
- Client-side policies do not permit inserting, deleting, promoting, or
  demoting the Owner row.

`project_invitations`

- Pending Project invitation for a normalized email and Contributor/Reader
  role.
- Stores a digest of the invitation token, never the raw token.
- Has expiry, accepted, and revoked state plus inviter identity.
- Only an Owner can create or revoke it.
- Acceptance verifies the authenticated account email and atomically creates
  membership and consumes the invitation.

### Templates and phases

Templates initially live in application code and are versioned with the
application. Project creation copies template phases, suggested specs, feature
defaults, and Theme configuration into Project-owned records.

`project_phases`

- Ordered, Project-owned phase definitions.
- Logs and `projects.current_phase_id` reference a phase in the same Project.
- A phase referenced by history cannot be hard-deleted; it can be archived.
- The application does not assign semantic behavior to phase names.

### Logs and documentation

`logs`

- Belongs to exactly one Project.
- Optional phase must belong to that same Project.
- Author is set to the authenticated User at insert and cannot be reassigned by
  ordinary content updates.
- Duration is optional and non-negative.
- Slug uniqueness is scoped to the Project.
- Chronological ordering uses work date followed by creation time and ID as
  stable tie-breakers.

Finding/decision entries remain validated structured JSON on the Log for the
MVP. They are an ordered array, not a single pair. They become relational only
if independent querying, permissions, or lifecycle becomes necessary.

`project_specs`

- Flexible section/label/value dossier.
- Ordering is scoped to Project and section.
- No template-specific columns exist.

### Items and financial attribution

`items`

- Exists independently from Projects.
- Has an owning User distinct from its creation audit field.
- Global identity fields and actual acquisition data can only be edited by its
  owner.
- An unlinked Item is visible only to its owner.
- A linked Item can be read by Users who may read the relevant Project, but
  Project membership alone does not grant global Item edit rights.

`project_items`

- Unique relation between a Project and Item.
- Contains role, Project-specific status and notes, and optional attributed
  Project cost.
- At most one ProjectItem in a Project may have role Subject.
- Contributors may edit this relation when Items are enabled.
- An attributed cost is denominated in the Project reporting currency.

`log_item_usage`

- References a Log and a ProjectItem from the same Project.
- One aggregate usage row per Log and ProjectItem in the MVP.
- Usage cost is optional, non-negative, and denominated in the Project currency.
- Consumable Project cost is derived from usage cost, not the full Item
  acquisition price.

Actual Item acquisition and Project attribution are deliberately separate:

- application/workshop cash expenditure counts each actual acquisition once;
- intrinsic Project cost uses ProjectItem attribution for Subject, Part,
  Material, and External Service;
- intrinsic Project cost uses LogItemUsage for Consumables;
- Tool acquisition is reported separately;
- estimated amounts never contribute to actual expenditure.

The MVP supports one acquisition amount per Item. A purchase-event ledger is a
future extension and is not required to establish correct attribution now.

Money uses a fixed-decimal database representation or integer minor units plus
an ISO currency code. JavaScript floating-point values are not authoritative.
No total combines different currencies and no automatic exchange conversion is
performed.

### Images

`project_images`

- Belongs to one Project and optionally one Log in that Project.
- Records the immutable original object path, semantic role, caption, ordering,
  upload state, uploader, and soft-deletion state.
- `uploaded_by_user_id` is set from the authenticated User and immutable.
- `Project.hero_image_id` is the only hero selection and must reference an
  image from the same Project.
- Image roles describe documentation semantics; they do not control access.

## 3. Critical database invariants

The schema design must enforce, rather than merely document:

- exactly one Owner per Project at transaction commit;
- unique membership per Project/User;
- unique active invitation per Project/normalized email;
- no Owner invitations;
- current phase belongs to the same Project;
- Log phase belongs to the same Project;
- Project hero image belongs to the same Project;
- Log image association belongs to the same Project;
- LogItemUsage connects a Log and ProjectItem from the same Project;
- unique ProjectItem per Project/Item;
- at most one Subject per Project;
- non-negative duration and monetary values;
- cost tracking implies Items enabled;
- supported Theme schema version;
- no hard deletion of referenced phases.

Composite unique keys and composite foreign keys are preferred for same-Project
integrity. Triggers are reserved for invariants that declarative constraints
cannot express, principally the presence of exactly one Owner.

## 4. Controlled operations

The following actions are database operations rather than arbitrary table
updates from the client:

### Create Project

- Creates the Project, Owner membership, copied template phases, current phase,
  feature settings, suggested specs, and Theme in one transaction.
- A partially created Project never becomes visible.

### Transfer ownership

- Callable only by the current Owner.
- Locks the Project and relevant membership rows.
- Requires the target to be an existing Project member.
- Promotes the target and demotes the previous Owner in one transaction.
- Leaves exactly one Owner at commit.

### Add existing account

- Owner submits an exact email and role.
- A trusted server path resolves the normalized email without exposing a public
  directory.
- If a verified account exists, membership is created directly.
- The operation is idempotent and does not alter an existing Owner.

### Invite new account

- Creates a time-limited token invitation when no account exists.
- Response behavior must not turn the endpoint into a public account-enumeration
  service; only authenticated Project Owners can use it.
- Acceptance requires login with the invited verified email.

### Delete original image

- Normal clients can mark image metadata deleted but cannot remove or overwrite
  the Storage object.
- Physical purge is a separate Owner-only server operation after the configured
  retention period.

Privileged functions live outside exposed schemas, use a fixed empty or
explicit `search_path`, verify `auth.uid()` internally, and expose only the
minimum required execute permission. They are individually covered by allow
and deny tests.

## 5. Authorization matrix

| Resource/action | Anonymous | Reader | Contributor | Owner |
| --- | --- | --- | --- | --- |
| Read public Project content | Yes | Yes | Yes | Yes |
| Read private Project content | No | Yes | Yes | Yes |
| Create/edit Logs, specs, images | No | No | Yes | Yes |
| Edit ProjectItems and usage | No | No | Yes, when enabled | Yes, when enabled |
| Edit global Item | No | No, unless Item owner | Only Item owner | Only Item owner |
| Edit Project metadata/theme | No | No | No | Yes |
| Configure phases/features | No | No | No | Yes |
| Manage members/invitations | No | No | No | Yes |
| Transfer ownership | No | No | No | Yes |
| Soft-delete image metadata | No | No | Yes | Yes |
| Physically purge original | No | No | No | Controlled Owner operation |

Public visibility grants read access only. It never creates membership or
write access.

## 6. RLS structure

Policies are operation-specific rather than broad `FOR ALL` policies.

### Project reads

A Project is readable when it is public or the current User has a membership.
Child-resource read policies derive access by joining to that Project. Private
Project existence is not exposed to non-members.

### Project writes

Content writes require Owner or Contributor membership. Administrative writes
require Owner membership. Insert policies also verify authorship/uploader
identity. Update policies check both the existing row and resulting row so a
User cannot move content to another Project or change its author.

### Membership reads and writes

Members may read the membership list for Projects they can access. Only the
Owner can manage non-owner memberships. Owner-row mutations remain unavailable
through ordinary table policies.

Policies on `project_members` must avoid self-referential policy recursion.
Shared membership checks may be implemented through carefully scoped helper
functions outside the exposed schema. Membership and Project IDs used in RLS
predicates receive supporting indexes.

### Item reads and writes

An Item is readable by its owner or when linked to a readable Project. Only its
Item owner may update or delete global Item data. ProjectItem data follows the
Project authorization rules.

### Test matrix

Every exposed table receives tests covering at least:

- anonymous visitor against public and private Projects;
- authenticated non-member;
- Reader;
- Contributor;
- Owner;
- wrong-Project foreign identifiers;
- attempts to change author/uploader/Project identity;
- attempts to grant membership or transfer ownership outside controlled paths;
- disabled Item/cost capability behavior.

Tests assert both allowed operations and expected denials for select, insert,
update, and delete. Database grants are tested in addition to RLS policies.

## 7. Storage design

### Bucket and object naming

Originals live in one private bucket. Before upload, the application creates an
authorized `project_images` reservation with a generated image ID. The object
path is deterministic from immutable database identifiers, for example:

`<project-id>/<image-id>/original.<validated-extension>`

The filename supplied by the User is retained as display metadata when useful,
but never controls authorization or canonical object identity.

### Upload

- Contributor or Owner creates the image reservation.
- Storage INSERT policy requires a matching reservation, Project access, and
  matching uploader.
- Upload uses `upsert: false`.
- Storage UPDATE is not granted for originals.
- Metadata is marked ready only after successful upload verification.
- Failed reservations can be cleaned up without treating them as photographs.

### Read

- Anonymous read is allowed only when the linked Project is public.
- Members can read private Project images.
- Access is validated against the database image record and Project, not merely
  a client-chosen folder name or object owner field.

### Delete and preservation

- Direct client deletion of original objects is denied.
- Soft-deleted metadata disappears from normal queries.
- A controlled purge may delete after a retention period.
- Display derivatives are disposable and can always be regenerated.
- Originals are included in a periodic off-platform Storage backup. Database
  backup or point-in-time recovery alone is not an image backup.

## 8. Theme configuration

Theme JSON lives on Project with an integer schema version. The application
validates complete Theme data before saving. Database checks reject unsupported
or missing schema versions but do not attempt to validate every visual token.

Theme migrations are explicit application/database deployment steps. Reading a
Project never silently rewrites its Theme. Templates copy a resolved initial
Theme into the Project, after which the Template is not a runtime dependency.

## 9. Derived values

Time and financial totals are derived and are not manually stored on Project.
Canonical calculations live close to the data in RLS-safe database queries,
views, or narrowly scoped functions. UI formatting and presentation remain in
the Nuxt application.

Any exposed view must execute with caller permissions and preserve underlying
RLS behavior. Materialized totals are unnecessary for the expected MVP scale.

## 10. Initial index plan

Indexes are justified by foreign keys, access paths, and RLS predicates:

- Project slug uniqueness;
- memberships by Project/User and separately by User/Project;
- active invitations by Project/normalized email and token digest;
- phases by Project/order;
- Logs by Project/work date descending;
- ProjectItems by Project/role/status and Item;
- usage by Log and ProjectItem;
- specs by Project/section/order;
- images by Project, Log, role, and order;
- partial uniqueness for Owner and Subject.

Final index definitions follow the actual query shapes. Unused speculative
indexes are not added.

## 11. Implementation sequence

1. Turn this design into an entity/constraint catalogue.
2. Define the full authorization test matrix.
3. Produce PostgreSQL DDL and migrations together with RLS policies.
4. Add database tests before application CRUD.
5. Configure the private Storage bucket and policy tests.
6. Build the first authentication → Project → mobile Log → original photo
   vertical slice.
7. Add optional Items/BOM and then optional costs.
8. Add invitations and ownership-transfer UI.
9. Add Theme Workshop after the workshop logging flow is complete.

The next design artifact should be the concrete schema and policy catalogue.
SQL generation starts only after this draft is reviewed.
