-- member-stock, card-catalog and team-stock-view write rules.
begin;
select plan(27);

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
  ('00000000-0000-0000-0000-00000000000b', 'LAW-1', 1);

-- Act as member Alice
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"alice@team.test","role":"authenticated"}', true);
set local role authenticated;

select lives_ok($$insert into public.stock (user_id, card_id, qty) values ('00000000-0000-0000-0000-00000000000a', 'LAW-1', 2)$$, 'member inserts own stock');
select is((select qty from public.stock where user_id = '00000000-0000-0000-0000-00000000000a' and card_id = 'LAW-1'), 2, 'own stock saved with qty 2');
select lives_ok($$insert into public.stock (user_id, card_id, qty) values ('00000000-0000-0000-0000-00000000000a', 'LAW-1', 3) on conflict (user_id, card_id) do update set qty = excluded.qty$$, 'member upserts own stock');
select is((select count(*)::int from public.stock where user_id = '00000000-0000-0000-0000-00000000000a' and card_id = 'LAW-1'), 1, 'still exactly one row per (user, card)');
select is((select qty from public.stock where user_id = '00000000-0000-0000-0000-00000000000a' and card_id = 'LAW-1'), 3, 'upsert updated qty to 3');
select lives_ok($$insert into public.stock (card_id, qty) values ('LAW-2', 1)$$, 'user_id defaults to auth.uid()');
select is((select user_id::text from public.stock where card_id = 'LAW-2'), '00000000-0000-0000-0000-00000000000a', 'defaulted user_id is the caller');
select lives_ok($$update public.stock set qty = 0 where card_id = 'LAW-2'$$, 'qty 0 is allowed (not owned)');
select is((select qty from public.stock where card_id = 'LAW-2'), 0, 'qty 0 is stored');

-- Denials
select throws_ok($$insert into public.stock (user_id, card_id, qty) values ('00000000-0000-0000-0000-00000000000b', 'LAW-2', 1)$$, '42501', null, 'spoofed user_id insert rejected');
select lives_ok($$update public.stock set qty = 99 where user_id = '00000000-0000-0000-0000-00000000000b'$$, 'update of another member row is a silent no-op under RLS');
select lives_ok($$delete from public.stock where user_id = '00000000-0000-0000-0000-00000000000b'$$, 'delete of another member row is a silent no-op under RLS');
select throws_ok($$update public.stock set user_id = '00000000-0000-0000-0000-00000000000b' where card_id = 'LAW-1' and user_id = '00000000-0000-0000-0000-00000000000a'$$, '42501', null, 'cannot hand own row to another user');
select throws_ok($$insert into public.stock (card_id, qty) values ('LAW-2', -1)$$, '23514', null, 'negative qty rejected (check constraint)');
select throws_ok($$insert into public.stock (card_id, qty) values ('LAW-2', '1.5')$$, '22P02', null, 'non-integer qty rejected');
select throws_ok($$insert into public.stock (card_id, qty) values ('NOPE-1', 1)$$, '23503', null, 'unknown card rejected (foreign key)');

-- Catalog and view are read-only for members
select throws_ok($$insert into public.cards (id, set_code, card_number, name, rarity, card_type, image_url) values ('LAW-9', 'LAW', 9, 'X', 'Rare', 'Unit', 'https://example.test/9.png')$$, '42501', null, 'member cannot insert cards');
select throws_ok($$update public.cards set name = 'Hacked'$$, '42501', null, 'member cannot update cards');
select throws_ok($$delete from public.cards$$, '42501', null, 'member cannot delete cards');
select throws_ok($$insert into public.team_stock (card_id, user_id, display_name, qty) values ('LAW-1', '00000000-0000-0000-0000-00000000000a', 'Alice', 5)$$, '55000', null, 'member cannot insert through team_stock view (not updatable)');
select throws_ok($$update public.team_stock set qty = 5$$, '55000', null, 'member cannot update through team_stock view (not updatable)');
select throws_ok($$delete from public.team_stock$$, '55000', null, 'member cannot delete through team_stock view (not updatable)');

select is((select count(*)::int from unnest(array['insert','update','delete']) p where has_table_privilege('authenticated', 'public.team_stock', p)), 0, 'authenticated holds no write privilege on team_stock');

-- Team view shows per-member rows with names
select is((select count(*)::int from public.team_stock), 3, 'team_stock shows both members rows');
select is((select display_name from public.team_stock where user_id = '00000000-0000-0000-0000-00000000000b' and card_id = 'LAW-1'), 'Bea', 'team_stock exposes display_name');
reset role;

-- Non-member cannot write even with their own user_id
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","email":"outsider@other.test","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into public.stock (card_id, qty) values ('LAW-1', 1)$$, '42501', null, 'non-member cannot insert stock for self');
reset role;

-- Another member data unchanged by the attacks above
select is((select qty from public.stock where user_id = '00000000-0000-0000-0000-00000000000b' and card_id = 'LAW-1'), 1, 'Bea stock row survives the update and delete attempts unchanged');

select * from finish();
rollback;
