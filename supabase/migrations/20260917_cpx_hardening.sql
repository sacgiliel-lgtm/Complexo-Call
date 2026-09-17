-- CPX production hardening migration. Run once in Supabase SQL Editor before deploying.
create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists status text not null default 'ativo';

alter table public.invites
  add column if not exists code_hash text,
  add column if not exists code_preview text,
  add column if not exists guest_name text,
  add column if not exists type text not null default 'convidado',
  add column if not exists expires_at timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

do $migrate$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invites' and column_name='code'
  ) then
    execute $sql$update public.invites set code_hash=encode(digest(code,'sha256'),'hex'),code_preview=right(code,4) where code_hash is null and code is not null$sql$;
    execute $sql$alter table public.invites alter column code drop not null$sql$;
    execute $sql$update public.invites set code=null where code is not null$sql$;
  end if;
end
$migrate$;

update public.invites
set expires_at=coalesce(expires_at,now()+interval '365 days')
where expires_at is null;

do $used$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='invites' and column_name='used'
  ) then
    execute $sql$update public.invites set used_at=coalesce(used_at,case when used=true then now() else null end)$sql$;
  end if;
end
$used$;

create unique index if not exists invites_code_hash_uidx on public.invites(code_hash) where code_hash is not null;
create index if not exists invites_active_lookup_idx on public.invites(code_hash,expires_at) where used_at is null and revoked_at is null;

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  is_waiting_room boolean not null default false,
  guest_access boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- The project may already have a channels table from an earlier version.
-- Add the fields required by the current API instead of assuming the table is new.
alter table public.channels
  add column if not exists is_active boolean not null default true,
  add column if not exists is_waiting_room boolean not null default false,
  add column if not exists guest_access boolean not null default false,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now();

do $channels$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='channels' and column_name='active'
  ) then
    execute $sql$update public.channels set is_active=active where is_active=true and active is not null$sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='channels' and column_name='waiting_room'
  ) then
    execute $sql$update public.channels set is_waiting_room=waiting_room where is_waiting_room=false and waiting_room is not null$sql$;
  end if;
end
$channels$;

insert into public.channels(name,is_active,is_waiting_room,guest_access,sort_order)
values
  ('Geral',true,true,true,10),
  ('Jogos',true,false,false,20),
  ('Reunião Dev',true,false,false,30)
on conflict(name) do update set
  is_active=excluded.is_active,
  is_waiting_room=excluded.is_waiting_room,
  guest_access=excluded.guest_access,
  sort_order=excluded.sort_order;

create table if not exists public.server_settings (
  id integer primary key check(id=1),
  maintenance_mode boolean not null default false,
  discord_logs boolean not null default true,
  max_users integer,
  updated_at timestamptz not null default now()
);

alter table public.server_settings
  add column if not exists maintenance_mode boolean not null default false,
  add column if not exists discord_logs boolean not null default true,
  add column if not exists max_users integer,
  add column if not exists updated_at timestamptz not null default now();

insert into public.server_settings(id) values(1) on conflict(id) do nothing;

create table if not exists public.guest_sessions (
  jti uuid primary key,
  invite_id text,
  username text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists guest_sessions_active_idx on public.guest_sessions(expires_at) where revoked_at is null;

create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.channels enable row level security;
alter table public.server_settings enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.rate_limits enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using(id=auth.uid());

create or replace function public.consume_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns table(allowed boolean,remaining integer,retry_after integer)
language plpgsql
security definer
set search_path=public
as $rate$
declare
  v_now timestamptz:=now();
  v_count integer;
  v_reset timestamptz;
begin
  insert into public.rate_limits(key,count,reset_at)
  values(p_key,1,v_now+make_interval(secs=>p_window_seconds))
  on conflict(key) do update set
    count=case
      when rate_limits.reset_at<=v_now then 1
      when rate_limits.count<p_max then rate_limits.count+1
      else rate_limits.count
    end,
    reset_at=case
      when rate_limits.reset_at<=v_now then v_now+make_interval(secs=>p_window_seconds)
      else rate_limits.reset_at
    end;

  select count,reset_at into v_count,v_reset
  from public.rate_limits
  where key=p_key;

  return query
  select
    v_count<=p_max,
    greatest(p_max-v_count,0),
    greatest(ceil(extract(epoch from(v_reset-v_now)))::integer,0);
end;
$rate$;

revoke all on function public.consume_rate_limit(text,integer,integer) from public;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;
