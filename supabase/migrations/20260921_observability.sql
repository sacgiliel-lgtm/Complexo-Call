-- Observability metadata for audit records.
-- Safe to run after the existing CPX migrations.

alter table public.activity_logs
  add column if not exists ip_address text,
  add column if not exists user_agent text,
  add column if not exists request_id text,
  add column if not exists source text;

create index if not exists activity_logs_request_idx
  on public.activity_logs(request_id)
  where request_id is not null;

create index if not exists activity_logs_ip_idx
  on public.activity_logs(ip_address, created_at desc)
  where ip_address is not null;
