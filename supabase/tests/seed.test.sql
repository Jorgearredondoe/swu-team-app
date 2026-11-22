-- card-catalog seed: idempotent upsert keyed by (set_code, card_number).
begin;
select plan(6);


-- Start from an empty catalog so counts are exact (rolled back with the transaction).
delete from public.stock;
delete from public.cards;

prepare seed_sample(text) as
  insert into public.cards (id, set_code, card_number, name, subtitle, rarity, card_type, image_url) values
    ('LAW-1', 'LAW', 1, $1, 'Bring Down the Empire', 'Rare', 'Leader', 'https://example.test/1.png'),
    ('IC27-5', 'IC27', 5, 'Second Card', null, 'Legendary', 'Unit', 'https://example.test/5.png')
  on conflict (set_code, card_number) do update set
    id = excluded.id, name = excluded.name, subtitle = excluded.subtitle, rarity = excluded.rarity,
    card_type = excluded.card_type, image_url = excluded.image_url;

execute seed_sample('Saw Gerrera');
select is((select count(*)::int from public.cards), 2, 'first run inserts 2 cards');

execute seed_sample('Saw Gerrera');
select is((select count(*)::int from public.cards), 2, 'second identical run creates no duplicates');

execute seed_sample('Saw Gerrera Renamed');
select is((select count(*)::int from public.cards), 2, 'third run with changed data still has 2 rows');
select is((select name from public.cards where id = 'LAW-1'), 'Saw Gerrera Renamed', 'changed field is updated');
select is((select count(*)::int from public.cards where set_code = 'LAW' and card_number = 1), 1, 'one row per (set_code, card_number)');

select throws_ok(
  $$insert into public.cards (id, set_code, card_number, name, rarity, card_type, image_url)
    values ('LAW-1b', 'LAW', 1, 'Dup', 'Rare', 'Unit', 'https://example.test/x.png')$$,
  '23505', null, 'plain insert of an existing (set_code, card_number) is rejected');

select * from finish();
rollback;
