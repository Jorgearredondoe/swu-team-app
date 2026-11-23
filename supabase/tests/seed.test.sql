-- card-catalog seed: idempotent upsert keyed by (set_code, card_number).
-- `supabase test db` mounts only supabase/tests, so the real supabase/seed.sql cannot be
-- included here. Instead: (1) the catalog that `db reset` loaded from the real seed is
-- checked as-is, and (2) the upsert below uses the generator's exact conflict clause
-- (scripts/transform.ts SEED_CONFLICT_CLAUSE); a Vitest guard fails if they drift.
begin;
select plan(11);

-- (1) Real seed, as applied by `supabase db reset`
select ok((select count(*) from public.cards) > 0, 'real seed loaded a non-empty catalog');
select is((select count(*)::int from public.cards where id <> set_code || '-' || card_number), 0, 'every seeded id is <set>-<number>');
select is((select count(*)::int from (select 1 from public.cards group by set_code, card_number having count(*) > 1) d), 0, 'no duplicate (set_code, card_number) in real seed');
select is((select count(distinct set_code)::int from public.cards), 4, 'real seed covers all 4 sets');

-- (2) Upsert semantics on an isolated catalog (rolled back with the transaction)
delete from public.stock;
delete from public.cards;

prepare seed_sample(text, text) as
  insert into public.cards (id, set_code, card_number, name, subtitle, rarity, card_type, image_url) values
    ($2, 'LAW', 1, $1, 'Bring Down the Empire', 'Rare', 'Leader', 'https://example.test/1.png'),
    ('IC27-5', 'IC27', 5, 'Second Card', null, 'Legendary', 'Unit', 'https://example.test/5.png')
on conflict (set_code, card_number) do update set
  name = excluded.name,
  subtitle = excluded.subtitle,
  rarity = excluded.rarity,
  card_type = excluded.card_type,
  image_url = excluded.image_url;

execute seed_sample('Saw Gerrera', 'LAW-1');
select is((select count(*)::int from public.cards), 2, 'first run inserts 2 cards');

execute seed_sample('Saw Gerrera', 'LAW-1');
select is((select count(*)::int from public.cards), 2, 'second identical run creates no duplicates');

execute seed_sample('Saw Gerrera Renamed', 'LAW-1');
select is((select name from public.cards where id = 'LAW-1'), 'Saw Gerrera Renamed', 'changed field is updated');
select is((select count(*)::int from public.cards where set_code = 'LAW' and card_number = 1), 1, 'one row per (set_code, card_number)');

-- A changed id in the source must not break stock that references the existing id
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@team.test', 'authenticated', 'authenticated');
insert into public.stock (user_id, card_id, qty) values ('00000000-0000-0000-0000-00000000000a', 'LAW-1', 3);
select lives_ok($$execute seed_sample('Saw Gerrera', 'LAW-001')$$, 're-seed with a changed id does not violate the stock FK');
select is((select id from public.cards where set_code = 'LAW' and card_number = 1), 'LAW-1', 'existing id is kept, so stock stays attached');

select throws_ok(
  $$insert into public.cards (id, set_code, card_number, name, rarity, card_type, image_url)
    values ('LAW-1b', 'LAW', 1, 'Dup', 'Rare', 'Unit', 'https://example.test/x.png')$$,
  '23505', null, 'plain insert of an existing (set_code, card_number) is rejected');

select * from finish();
rollback;
