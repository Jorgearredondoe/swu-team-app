# Deploy checklist

Local development is fully local (Docker + Supabase CLI). Production uses Google OAuth only.
Tick every item, in order, before sharing the production URL.

## Never push the local config

`supabase/config.toml` is LOCAL ONLY: it enables email signups, disables email confirmations
and points `site_url` at `http://localhost:5173`. **Never run `supabase config push`** against
the hosted project; configure production auth in the dashboard as described below.

## Supabase (hosted project)

Order matters: the allowlist hook must be active before any sign-in method is.

- [ ] Run `npx supabase link` and `npx supabase db push --include-seed` (applies the migration and the card catalog seed only).
- [ ] Run `supabase/seed/members.local.sql` manually in the SQL editor with the real member emails. This file is gitignored and must never be committed.
- [ ] Enable the before-user-created hook (Authentication > Hooks) pointing to `public.hook_before_user_created`. It rejects every sign-up that is not Google with an allowlisted email. Without it RLS still protects the data, but non-members could create accounts.
- [ ] Disable the Email provider (Authentication > Providers > Email) so only Google sign-in exists. The local config enables email/password for a dev-only test user; it must never reach production.
- [ ] Enable the Google provider with your OAuth client id and secret (only after the hook is enabled).
- [ ] Set the Site URL to the deployed app URL and add it (plus `http://localhost:5173/**` if desired) to the redirect URLs.

## Keys and secrets

- [ ] Only the anon/publishable key is used by the client (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). The service_role key is never used in the client, the repository or CI.

## Keep-alive workflow

- [ ] Add the `SUPABASE_URL` and `SUPABASE_ANON_KEY` repository secrets and run the `keepalive` workflow once manually (Actions > keepalive > Run workflow).
- [ ] In a public repository, GitHub disables scheduled workflows after 60 days without repository activity. Check the Actions tab: a disabled workflow is marked as such and its weekly runs stop appearing. To re-enable: Actions > keepalive > "Enable workflow", then run it once manually. Any push to the repository also resets the 60-day window.

## Verification

- [ ] Sign in with an allowlisted Google account: the app shows team data.
- [ ] Sign in with a non-allowlisted Google account: the app shows the rejection message and no user is created.
