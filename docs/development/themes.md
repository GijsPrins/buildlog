# Personal theme library

Open `/themes` or **Themes** in the header while signed in. Start with a workshop palette, change its eight colours, heading font, corners, shadow, texture and photo frame, and save it under your own name. The preview updates immediately and warns about low body-text contrast.

On a build you can read but do not own, **Copy theme** saves a named, independent copy to your library. Signed-out visitors are prompted to sign in and returned to the build. Only the theme configuration is copied, not photos, logs or project content. The creator's private library stays private; this uses only the theme already visible on the accessible project.

Saved themes can be edited, copied or removed. They are private to the account, stored in Supabase `public.user_themes`, with owner-only RLS and a cascading Auth-user foreign key. Removing an account also removes its library. In local demo mode the library is kept in browser storage, separately per local account.

Both create and edit project pages use the shared editor and load the library. You can also save the current project's palette to the library without leaving the editor. Applying a theme copies its configuration into the project. Later library edits or deletion never silently restyle existing projects. Apply the edited library theme again and save the project if you want the new version there.

Verification: 21 application tests, Nuxt typecheck and 11 rollback-only database checks passed. Checks cover CRUD, independent copies of other builders' palettes, cross-account isolation, ownership reassignment, anonymous denial and malformed/missing colours. The Supabase Auth advisor still reports leaked-password protection disabled; this unrelated account-security setting was not changed.
