-- Regras padrão para convites criados dentro das calls.
alter table public.server_settings
  add column if not exists call_invite_enabled boolean not null default true,
  add column if not exists call_invite_expires_minutes integer not null default 60,
  add column if not exists call_invite_guest_name text not null default 'Convidado';

update public.server_settings
set
  call_invite_enabled = coalesce(call_invite_enabled, true),
  call_invite_expires_minutes = greatest(5, least(coalesce(call_invite_expires_minutes, 60), 10080)),
  call_invite_guest_name = coalesce(nullif(trim(call_invite_guest_name), ''), 'Convidado')
where id = 1;

alter table public.invites
  add column if not exists room_name text;

create index if not exists invites_room_name_idx on public.invites(room_name);
