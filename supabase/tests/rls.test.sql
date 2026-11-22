-- RLS backstop: anon and non-members see nothing; members see team data.
begin;
select plan(22);

-- Fixtures (run as postgres). Placeholder emails only.
insert into public.cards (id, set_code, card_number, name, subtitle, rarity, card_type, image_url) values
  ('LAW-1', 'LAW', 1, 'Test Card One', null, 'Rare', 'Unit', 'https://example.test/1.png'),
  ('LAW-2', 'LAW', 2, 'Test Card Two', 'Sub', 'Legendary', 'Leader', 'https://example.test/2.png');
insert into public.team_members (email, display_name) values
  ('alice@team.test', 'Alice'),
  ('bea@team.test', 'Bea');
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@team.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bea@team.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'outsider@other.test', 'authenticated', 'authenticated');
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
select is((select public.is_team_member()), true, 'is_team_member() matches mixed-case email');
reset role;

-- is_team_member() hardening
select ok((select prosecdef from pg_proc where oid = 'public.is_team_member()'::regprocedure), 'is_team_member() is SECURITY DEFINER');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.is_team_member()'::regprocedure), 'is_team_member() pins empty search_path');
select is(has_function_privilege('anon', 'public.is_team_member()', 'execute'), false, 'anon cannot execute is_team_member()');

select * from finish();
rollback;
