-- Team Stock + Google Auth: schema, RLS, allowlist hook, keep-alive.
-- Security model: RLS on every table gated by is_team_member(); the
-- before-user-created hook is the first line (deny by default), RLS the backstop.
-- Identity: a member is the auth user linked to an allowlist row. The link is made
-- only from a CONFIRMED email by a trusted trigger; the JWT email claim is never trusted.

-- Future objects in public get no implicit grants (Supabase defaults grant anon and
-- authenticated everything); each object below grants exactly what it needs.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
-- PUBLIC's EXECUTE on new functions is a GLOBAL default (built into Postgres), which a
-- per-schema revoke cannot remove: only a global (no `in schema`) revoke does. Without
-- it every future postgres-owned function would be callable by anon/authenticated.
-- Functions that must be callable are granted explicitly below (e.g. keepalive to anon).
alter default privileges for role postgres
  revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.cards (
  id          text primary key,
  set_code    text not null check (set_code in ('LAW', 'ASH', 'HMW', 'IC27')),
  card_number int  not null,
  name        text not null,
  subtitle    text,
  rarity      text not null check (rarity in ('Rare', 'Legendary')),
  card_type   text not null,
  image_url   text not null,
  unique (set_code, card_number)
);

create table public.team_members (
  email        text primary key check (email = lower(email)),
  display_name text not null,
  user_id      uuid unique references auth.users (id) on delete set null
);

create table public.stock (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id    text not null references public.cards (id),
  qty        int  not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- ---------------------------------------------------------------------------
-- Allowlist helpers
-- ---------------------------------------------------------------------------
create function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members
    where user_id = (select auth.uid())
  );
$$;

-- Links an auth user to its allowlist row by (lowercased) email, but only once the
-- email is confirmed. GoTrue may confirm in the INSERT or in a later UPDATE.
create function public.link_team_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  update public.team_members
     set user_id = new.id
   where email = lower(new.email)
     and user_id is null;
  return new;
end;
$$;

create trigger link_team_member_on_signup
  after insert on auth.users
  for each row execute function public.link_team_member();

create trigger link_team_member_on_confirm
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.link_team_member();

-- before-user-created hook: deny by default. Only Google sign-ups of allowlisted emails
-- pass; a missing provider or email fails closed (403). Payload path verified against
-- GoTrue v2.197: event.user.app_metadata.provider.
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_email    text := lower(event #>> '{user,email}');
  v_provider text := event #>> '{user,app_metadata,provider}';
begin
  if v_provider is distinct from 'google'
     or v_email is null
     or not exists (select 1 from public.team_members where email = v_email) then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'Not a team member')
    );
  end if;
  return '{}'::jsonb;
end;
$$;

-- Keep-alive probe: the ONLY thing anon may touch (returns 1).
create function public.keepalive()
returns int
language sql
stable
set search_path = ''
as $$ select 1; $$;

-- ---------------------------------------------------------------------------
-- Team view (RLS applies as the caller)
-- ---------------------------------------------------------------------------
create view public.team_stock
with (security_invoker = true) as
  select s.card_id, s.user_id, m.display_name, s.qty
  from public.stock s
  join public.team_members m on m.user_id = s.user_id;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.cards        enable row level security;
alter table public.team_members enable row level security;
alter table public.stock        enable row level security;

create policy cards_select on public.cards
  for select to authenticated
  using ((select public.is_team_member()));

create policy team_members_select on public.team_members
  for select to authenticated
  using ((select public.is_team_member()));

-- GoTrue runs the hook as supabase_auth_admin and must read the allowlist.
create policy team_members_auth_admin_select on public.team_members
  for select to supabase_auth_admin
  using (true);

create policy stock_select on public.stock
  for select to authenticated
  using ((select public.is_team_member()));

create policy stock_insert on public.stock
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_team_member()));

create policy stock_update on public.stock
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_team_member()))
  with check (user_id = (select auth.uid()) and (select public.is_team_member()));

create policy stock_delete on public.stock
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_team_member()));

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, then grant the minimum
-- ---------------------------------------------------------------------------
revoke all on public.cards, public.team_members, public.stock, public.team_stock
  from anon, authenticated;

grant select on public.cards, public.team_members, public.team_stock to authenticated;
grant select, insert, update, delete on public.stock to authenticated;
grant select on public.team_members to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

revoke execute on function public.is_team_member() from public, anon, authenticated;
grant  execute on function public.is_team_member() to authenticated;

revoke execute on function public.link_team_member() from public, anon, authenticated;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant  execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

revoke execute on function public.keepalive() from public, anon, authenticated;
grant  execute on function public.keepalive() to anon, authenticated;
