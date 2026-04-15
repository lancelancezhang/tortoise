-- Waitlist signups: captured from landing page email form.
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now(),
  source text,
  ip text,
  user_agent text
);

create index if not exists idx_waitlist_signups_created_at on public.waitlist_signups (created_at desc);

alter table public.waitlist_signups enable row level security;

-- Backend uses service_role (bypasses RLS). Block anon/authenticated by default.
create policy "Block anon and auth" on public.waitlist_signups for all using (false);

