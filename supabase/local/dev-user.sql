-- LOCAL DEVELOPMENT ONLY. Never run against a hosted project.
-- Creates a placeholder allowlisted member with email/password so the UI can be
-- tested without Google OAuth. Applied with: npm run db:dev-user
-- Not listed in config.toml sql_paths on purpose, so `db push --include-seed` never runs it.
do $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.team_members (email, display_name)
  values ('dev@team.test', 'Dev Tester')
  on conflict (email) do nothing;

  -- Re-runnable: if the auth user already exists (e.g. the member row was deleted and
  -- re-added), make sure the member row is linked to it and stop.
  if exists (select 1 from auth.users where email = 'dev@team.test') then
    update public.team_members m
       set user_id = u.id
      from auth.users u
     where u.email = 'dev@team.test'
       and m.email = 'dev@team.test'
       and m.user_id is distinct from u.id;
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    'dev@team.test', extensions.crypt('dev-password-local', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', 'dev@team.test'),
    'email', v_id::text, now(), now(), now()
  );
end
$$;
