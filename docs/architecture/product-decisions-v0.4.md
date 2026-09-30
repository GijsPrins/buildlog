# Buildlog product decisions — v0.4 addendum

Status: accepted

This document records decisions made during the final technical review of the
v0.4 product specification. It clarifies the specification without changing
the central product vision: Buildlog is a generic platform for documenting
physical builds; Bicycle Restoration is its first template.

## Project membership and invitations

Invitations only grant access to a Project. They do not constitute general
account invitations or public registration.

An Owner adds somebody by entering their exact email address and choosing
either Contributor or Reader:

- When the email belongs to an existing verified account, the application
  recognizes that account and can add it directly to the Project.
- When no account exists, the application creates a time-limited invitation.
  After registering or signing in with the invited email, the recipient can
  accept it.
- The application must not provide a general user-directory or partial-email
  search. Recognition only occurs for an exact normalized email address.
- Invitations cannot grant Owner. Ownership transfer is a separate operation.
- Repeated active invitations for the same Project and email are not allowed.
- A pending invitation is not a Project membership and grants no access.

## Optional Items, BOM, and costs

A Project does not have to maintain Items, a bill of materials, or costs.
Documenting Logs, photographs, progress, findings, and decisions is a complete
and valid Buildlog Project by itself.

Items/BOM and cost tracking are separate optional Project capabilities:

- Items/BOM can be enabled without recording prices.
- Cost tracking depends on Items/BOM being enabled.
- When disabled, related navigation, empty statistics, and form fields are
  hidden instead of displaying zero-value dashboards.
- Either capability can be enabled later without recreating the Project.
- Templates may suggest defaults, but the User chooses during Project creation
  and the Project owns the resulting setting.
- Core Log and photography workflows never depend on these capabilities.

Disabling a capability after data exists hides normal UI entry points but does
not delete data. Destructive data removal is a separate explicit operation.

## Accepted technical review decisions

- Exactly one Project Owner is enforced as a database invariant.
- Ownership transfer is atomic and cannot be expressed as ordinary membership
  edits from the client.
- Contributors edit Project content, not Project administration.
- Global Item data has its own owner; Project membership does not imply the
  right to edit an Item shared with another Project.
- Project phases remain relational entities.
- Cross-Project references are prevented with relational constraints.
- Actual cash expenditure and Project cost allocation are distinct concepts.
- Each Project has one reporting currency. Automatic currency conversion is
  outside the MVP.
- Original images are immutable Storage objects and require an external backup
  strategy because database backups do not include Storage files.
- `Project.heroImageId` is the single source of truth for the Project hero;
  `hero` is not also an image role.
- Finding/decision entries remain embedded and application-validated for the
  MVP.
- Theme configuration remains versioned JSON owned by the Project.

## Delivery order adjustment

The first end-to-end milestone is:

1. Authentication and Project access.
2. Project creation from the Bicycle Restoration template or generic defaults.
3. Mobile Log creation and editing.
4. Original photo upload and display.
5. Findings and decisions.

Items, BOM, cost tracking, collaboration invitations, and the Theme Workshop
build on that vertical slice. The Theme data model and token architecture are
established early, but the full interactive Theme Workshop does not block the
first workshop-ready release.
