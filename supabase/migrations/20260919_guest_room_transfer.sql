-- Keep the room a guest is currently in separate from the original invite room.
-- This lets LiveKit Cloud move the guest between calls while preserving
-- server-side authorization for the new current room.
alter table public.guest_sessions
  add column if not exists current_room_name text;

create index if not exists guest_sessions_current_room_idx
  on public.guest_sessions(current_room_name)
  where revoked_at is null;

-- Existing sessions start in the room encoded by their invite.
update public.guest_sessions gs
set current_room_name = i.room_name
from public.invites i
where gs.invite_id = i.id::text
  and gs.current_room_name is null
  and i.room_name is not null;
