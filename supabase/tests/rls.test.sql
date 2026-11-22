-- RLS backstop: anon and non-members see nothing; members see team data.
begin;
select plan(32);

-- Isolate from seeded catalog and local dev data (rolled back with the transaction).
delete from public.stock;
delete from public.team_members;
delete from public.cards;

-- Fixtures (run as postgres). Placeholder emails only.
insert into public.cards (id, set_code, card_number, name, subtitle, rarity, card_type, image_url) values
  ('LAW-1', 'LAW', 1, 'Test Card One', null, 'Rare', 'Unit', 'https://example.test/1.png'),
  ('LAW-2', 'LAW', 2, 'Test Card Two', 'Sub', 'Legendary', 'Leader', 'https://example.test/2.png');
insert into public.team_members (email, display_name) values
  ('alice@team.test', 'Alice'),
  ('bea@team.test', 'Bea');
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@team.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000000b', 'bea@team.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@other.test', 'authenticated', 'authenticated', now());
insert into public.stock (user_id, card_id, qty) values
  ('00000000-0000-0000-0000-00000000000a', 'LAW-1', 2),
  ('00000000-0000-0000-0000-00000000000b', 'LAW-1', 1);

-- RLS enabled on every table
select ok((select relrowsecurity from pg_class where oid = 'public.cards'::regclass), 'RLS enabled on cards');
select ok((select relrowsecurity from pg_class where oid = 'public.team_members'::regclass), 'RLS enabled on team_members');
select ok((select relrowsecurity from pg_class where oid = 'public.stock'::regclass), 'RLS enabled on stock');

-- Anonymous: no table access at all (privileges revoked, deny by default)
set local role anon;
select throws_ok($$select count(*) from public.cards$$, '42501', null, 'anon cannot read cards');
select throws_ok($$select count(*) from public.stock$$, '42501', null, 'anon cannot read stock');
select throws_ok($$select count(*) from public.team_stock$$, '42501', null, 'anon cannot read team_stock');
select throws_ok($$insert into public.stock (user_id, card_id, qty) values ('00000000-0000-0000-0000-00000000000a', 'LAW-2', 1)$$, '42501', null, 'anon cannot write stock');
select throws_ok($$select count(*) from public.team_members$$, '42501', null, 'anon cannot read team_members');
select is((select public.keepalive()), 1, 'anon can call keepalive()');
reset role;

-- Non-member with a valid authenticated JWT: zero rows everywhere
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","email":"outsider@other.test","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.cards), 0, 'non-member reads 0 cards (2 exist)');
select is((select count(*)::int from public.stock), 0, 'non-member reads 0 stock rows (2 exist)');
select is((select count(*)::int from public.team_stock), 0, 'non-member reads 0 team_stock rows');
select is((select count(*)::int from public.team_members), 0, 'non-member reads 0 team_members rows');
select is((select public.is_team_member()), false, 'is_team_member() is false for outsider');
reset role;

-- Member: sees the shared data
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"Alice@Team.Test","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.cards), 2, 'member reads all cards');
select is((select count(*)::int from public.stock), 2, 'member reads all team stock rows');
select is((select count(*)::int from public.team_stock), 2, 'member reads team_stock view');
select is((select count(*)::int from public.team_members), 2, 'member reads team_members');
select is((select public.is_team_member()), true, 'is_team_member() true for the linked member');
reset role;

-- Identity comes from the confirmed-email link, not the JWT email claim
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","email":"alice@team.test","role":"authenticated"}', true);
set local role authenticated;
select is((select public.is_team_member()), false, 'allowlisted email claim without the user_id link is not a member');
select is((select count(*)::int from public.cards), 0, 'unlinked user with spoofed email claim reads 0 cards');
reset role;

-- Privileges: anon holds no privilege on any public table or view, now or in the future
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')),
  0, 'anon has no privileges on any public table or view');
create table public._future_table_probe (id int);
select is(has_table_privilege('anon', 'public._future_table_probe', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), false, 'anon gets no default privileges on new public tables');
select is(has_table_privilege('authenticated', 'public._future_table_probe', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), false, 'authenticated gets no default privileges on new public tables');

-- Functions: PUBLIC's global default EXECUTE is revoked, so new public functions are
-- not callable by anon/authenticated unless explicitly granted.
create function public._future_function_probe() returns int language sql as $$ select 1; $$;
select is(has_function_privilege('anon', 'public._future_function_probe()', 'execute'), false, 'anon cannot execute new public functions by default');
select is(has_function_privilege('authenticated', 'public._future_function_probe()', 'execute'), false, 'authenticated cannot execute new public functions by default');
select is(
  (select count(*)::int from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.oid = 'public._future_function_probe()'::regprocedure and a.grantee = 0),
  0, 'PUBLIC holds no EXECUTE on new public functions');
select is(has_function_privilege('anon', 'public.keepalive()', 'execute'), true, 'anon keeps its explicit EXECUTE on keepalive()');
select is(has_function_privilege('authenticated', 'public.is_team_member()', 'execute'), true, 'authenticated keeps its explicit EXECUTE on is_team_member()');

-- is_team_member() hardening
select ok((select prosecdef from pg_proc where oid = 'public.is_team_member()'::regprocedure), 'is_team_member() is SECURITY DEFINER');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.is_team_member()'::regprocedure), 'is_team_member() pins empty search_path');
select is(has_function_privilege('anon', 'public.is_team_member()', 'execute'), false, 'anon cannot execute is_team_member()');

select * from finish();
rollback;
