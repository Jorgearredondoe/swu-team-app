# Deploy checklist

Local development is fully local (Docker + Supabase CLI). Production uses Google OAuth only.
Tick every item before sharing the production URL.

## Supabase (hosted project)

- [ ] Disable the Email provider (Authentication > Providers > Email) so only Google sign-in exists. The local config enables email/password for a dev-only test user; it must never reach production.
- [ ] Enable the Google provider with your OAuth client id and secret.
- [ ] Set the Site URL to the deployed app URL and add it (plus `http://localhost:5173/**` if desired) to the redirect URLs.
- [ ] Run `npx supabase link` and `npx supabase db push --include-seed` (applies the migration and the card catalog seed only).
- [ ] Run `supabase/seed/members.local.sql` manually in the SQL editor with the real member emails. This file is gitignored and must never be committed.
- [ ] Enable the before-user-created hook (Authentication > Hooks) pointing to `public.hook_before_user_created`. Without it RLS still protects the data, but non-members could create accounts.

## Keys and secrets

- [ ] Only the anon/publishable key is used by the client (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). The service_role key is never used in the client, the repository or CI.

## Verification

- [ ] Sign in with an allowlisted Google account: the app shows team data.
- [ ] Sign in with a non-allowlisted Google account: the app shows the rejection message and no user is created.
