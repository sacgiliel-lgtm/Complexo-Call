-- CPX password lifecycle migration. Run after 20260917_cpx_ui.sql.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

create index if not exists profiles_must_change_password_idx
  on public.profiles(must_change_password)
  where must_change_password = true;
