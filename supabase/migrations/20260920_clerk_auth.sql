-- Clerk authentication migration.
-- Supabase remains the application database; Clerk becomes the identity provider.

-- The legacy Supabase Auth schema used profiles.id -> auth.users.id.
-- Clerk owns identities now, so profiles.id must be an independent internal UUID.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists clerk_user_id text,
  add column if not exists pending_email text;

create unique index if not exists profiles_clerk_user_id_uidx
  on public.profiles(clerk_user_id)
  where clerk_user_id is not null;

create index if not exists profiles_pending_email_idx
  on public.profiles(lower(pending_email))
  where pending_email is not null;

drop policy if exists profiles_select_own on public.profiles;
-- Server routes use service_role. Keep this policy compatible with Clerk/Supabase
-- third-party auth only after the Clerk provider is enabled in Supabase.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (clerk_user_id = auth.jwt()->>'sub');
