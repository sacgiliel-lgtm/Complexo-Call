-- Final Clerk auth cleanup.
-- Active authentication is handled exclusively by Clerk.
-- The old password lifecycle flag is no longer read by application code.

drop index if exists public.profiles_must_change_password_idx;
alter table public.profiles
  drop column if exists must_change_password;
