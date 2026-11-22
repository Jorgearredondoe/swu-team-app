-- before-user-created allowlist hook: deny by default.
begin;
select plan(26);

-- Isolate from seeded catalog and local dev data (rolled back with the transaction).
delete from public.stock;
delete from public.team_members;
delete from public.cards;

insert into public.team_members (email, display_name) values
  ('alice@team.test', 'Alice'),
  ('bea@team.test', 'Bea');

select is((public.hook_before_user_created('{"user":{"email":"stranger@other.test"}}'::jsonb) #>> '{error,http_code}'), '403', 'unknown email denied with 403');
select is((public.hook_before_user_created('{"user":{"email":"stranger@other.test"}}'::jsonb) #>> '{error,message}'), 'Not a team member', 'denial message');
select is((public.hook_before_user_created('{"user":{}}'::jsonb) #>> '{error,http_code}'), '403', 'missing email denied');
select is((public.hook_before_user_created('{"user":{"email":null}}'::jsonb) #>> '{error,http_code}'), '403', 'null email denied');
select is((public.hook_before_user_created('{}'::jsonb) #>> '{error,http_code}'), '403', 'empty event denied');
select is(public.hook_before_user_created('{"user":{"email":"ALICE@Team.Test","app_metadata":{"provider":"google"}}}'::jsonb), '{}'::jsonb, 'mixed-case allowlisted google email allowed');
select is(public.hook_before_user_created('{"user":{"email":"bea@team.test","app_metadata":{"provider":"google"}}}'::jsonb), '{}'::jsonb, 'second allowlisted google email allowed');
select is((public.hook_before_user_created('{"user":{"email":"stranger@other.test","app_metadata":{"provider":"google"}}}'::jsonb) #>> '{error,http_code}'), '403', 'unknown google email denied');

-- Provider gate (payload path verified against GoTrue v2.197: user.app_metadata.provider)
select is((public.hook_before_user_created('{"user":{"email":"alice@team.test","app_metadata":{"provider":"email"}}}'::jsonb) #>> '{error,http_code}'), '403', 'allowlisted email via email provider denied');
select is((public.hook_before_user_created('{"user":{"email":"alice@team.test","app_metadata":{"provider":"github"}}}'::jsonb) #>> '{error,http_code}'), '403', 'allowlisted email via other OAuth provider denied');
select is((public.hook_before_user_created('{"user":{"email":"alice@team.test"}}'::jsonb) #>> '{error,http_code}'), '403', 'missing provider denied (fail closed)');
select is((public.hook_before_user_created('{"user":{"email":"alice@team.test","app_metadata":{"provider":"Google"}}}'::jsonb) #>> '{error,http_code}'), '403', 'provider match is exact');

-- GoTrue runs the hook as supabase_auth_admin: it needs an RLS policy on the allowlist
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_members' and 'supabase_auth_admin' = any(roles)), 'RLS policy lets supabase_auth_admin read team_members');

-- Grants: only supabase_auth_admin may execute
select is(has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'), true, 'supabase_auth_admin can execute hook');
select is(
  (select count(*)::int from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.hook_before_user_created(jsonb)'::regprocedure
     and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))),
  0, 'public, anon and authenticated cannot execute hook');

-- Link trigger: only a CONFIRMED email links the auth user to its allowlist row
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'Alice@Team.Test', 'authenticated', 'authenticated', now());
select is((select user_id::text from public.team_members where email = 'alice@team.test'), '00000000-0000-0000-0000-00000000000a', 'confirmed auth user linked to team_members by lowercased email');

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000b', 'bea@team.test', 'authenticated', 'authenticated');
select is((select user_id from public.team_members where email = 'bea@team.test'), null, 'unconfirmed email is not linked');

update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000000b';
select is((select user_id::text from public.team_members where email = 'bea@team.test'), '00000000-0000-0000-0000-00000000000b', 'confirming the email later links it');
select is(has_table_privilege('supabase_auth_admin', 'public.team_members', 'select'), true, 'supabase_auth_admin can read team_members');

-- Reverse link: an auth user that already exists is linked when the allowlist row
-- is added (or its email is changed) later, but only if that email is confirmed.
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000c', 'Carol@Team.Test', 'authenticated', 'authenticated', now());
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000d', 'dan@team.test', 'authenticated', 'authenticated');
insert into public.team_members (email, display_name) values ('carol@team.test', 'Carol');
select is((select user_id::text from public.team_members where email = 'carol@team.test'), '00000000-0000-0000-0000-00000000000c', 'existing confirmed auth user linked when allowlist row is inserted later');
insert into public.team_members (email, display_name) values ('dan@team.test', 'Dan');
select is((select user_id from public.team_members where email = 'dan@team.test'), null, 'existing unconfirmed auth user is not linked on allowlist insert');

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000e', 'eve@team.test', 'authenticated', 'authenticated', now());
insert into public.team_members (email, display_name) values ('eve-typo@team.test', 'Eve');
select is((select user_id from public.team_members where email = 'eve-typo@team.test'), null, 'allowlist row with no matching auth user stays unlinked');
update public.team_members set email = 'eve@team.test' where email = 'eve-typo@team.test';
select is((select user_id::text from public.team_members where email = 'eve@team.test'), '00000000-0000-0000-0000-00000000000e', 'correcting the allowlist email links the existing confirmed user');
update public.team_members set display_name = 'Eve B' where email = 'eve@team.test';
select is((select user_id::text from public.team_members where email = 'eve@team.test'), '00000000-0000-0000-0000-00000000000e', 'unrelated updates keep the link');

select ok((select prosecdef and 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.link_team_member_from_allowlist()'::regprocedure), 'allowlist link function is SECURITY DEFINER with empty search_path');
select is(
  (select count(*)::int from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.oid = 'public.link_team_member_from_allowlist()'::regprocedure
     and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))),
  0, 'public, anon and authenticated cannot execute the allowlist link function');

select * from finish();
rollback;
