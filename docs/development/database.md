# Local database workflow

The Supabase project was initialized with CLI version `2.118.0`. Use that
version until the project deliberately upgrades it.

## Requirements

- A Docker-compatible runtime running locally.
- The Supabase CLI, or the pinned temporary invocation shown below.
- Ports from `supabase/config.toml` available on localhost.

This repository does not require a globally installed Supabase CLI. With pnpm:

```powershell
pnpm dlx supabase@2.118.0 --version
```

## Start and verify

From the repository root:

```powershell
pnpm dlx supabase@2.118.0 start
pnpm dlx supabase@2.118.0 db reset
pnpm dlx supabase@2.118.0 test db
pnpm dlx supabase@2.118.0 db lint
pnpm dlx supabase@2.118.0 migration list --local
```

Expected test coverage includes tenant isolation, role boundaries, optional
Items, cross-Project referential integrity, immutable authorship, and the
single-Owner uniqueness rule.

## Migration discipline

Create every new migration through the CLI:

```powershell
pnpm dlx supabase@2.118.0 migration new descriptive_name
```

Do not edit Supabase-managed Auth or Storage table structures. Application
objects belong in `public` or `private`; only supported policies and triggers
are added to managed schemas.

Keep grants, RLS policies, and their tests in the same change as the table or
function they protect. A migration is not complete until `test db` and
`db lint` pass against a fresh `db reset`.

## Current verification status

The initial migration and pgTAP file pass a PostgreSQL 17 parser check. Runtime
execution is pending because the current workstation does not expose a Docker
runtime or local PostgreSQL on port `54322`.
