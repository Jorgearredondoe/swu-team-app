-- before-user-created allowlist hook: deny by default.
begin;
select plan(13);

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
select is(public.hook_before_user_created('{"user":{"email":"ALICE@Team.Test"}}'::jsonb), '{}'::jsonb, 'mixed-case allowlisted email allowed');
select is(public.hook_before_user_created('{"user":{"email":"bea@team.test"}}'::jsonb), '{}'::jsonb, 'second allowlisted email allowed');

-- GoTrue runs the hook as supabase_auth_admin: it needs an RLS policy on the allowlist
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_members' and 'supabase_auth_admin' = any(roles)), 'RLS policy lets supabase_auth_admin read team_members');

-- Grants: only supabase_auth_admin may execute
select is(has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'), true, 'supabase_auth_admin can execute hook');
select is(
  (select count(*)::int from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.hook_before_user_created(jsonb)'::regprocedure
     and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))),
  0, 'public, anon and authenticated cannot execute hook');

-- Link trigger: signing up links the auth user to the allowlist row by email
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Alice@Team.Test', 'authenticated', 'authenticated');
select is((select user_id::text from public.team_members where email = 'alice@team.test'), '00000000-0000-0000-0000-00000000000a', 'auth user linked to team_members by lowercased email');
select is((select user_id from public.team_members where email = 'bea@team.test'), null, 'other member stays unlinked');
select is(has_table_privilege('supabase_auth_admin', 'public.team_members', 'select'), true, 'supabase_auth_admin can read team_members');

select * from finish();
rollback;
