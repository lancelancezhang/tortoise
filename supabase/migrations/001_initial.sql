-- Families: one row per family. Slug is used in the shareable URL (e.g. /f/abc123).
-- Only the backend (with service_role) accesses these tables; family isolation is enforced by always filtering on family_id.
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_families_slug on public.families (slug);

-- Family members (story authors) belong to one family.
create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null default 'Unnamed',
  relationship text not null default '',
  age int,
  birthday text,
  created_at timestamptz not null default now()
);

create index if not exists idx_family_members_family_id on public.family_members (family_id);

-- Recordings belong to one family; optional link to a family member (story author).
create table if not exists public.recordings (
  id text not null primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  family_member_id uuid references public.family_members(id) on delete set null,
  name text,
  created_at timestamptz not null default now(),
  transcript text,
  translation text,
  title text,
  description text,
  story_date text,
  audio_path text,
  photo_path text
);

create index if not exists idx_recordings_family_id on public.recordings (family_id);
create index if not exists idx_recordings_created_at on public.recordings (family_id, created_at desc);

-- Optional: Row Level Security so that even if anon key is used, rows are isolated by family_id.
-- The app uses the backend with service_role, so RLS is defense-in-depth. Policies require a custom claim.
-- For "link-based" access we don't set JWT claims; the backend passes family_id in every query. So we disable RLS
-- and rely on the backend to never query across families. Alternatively enable RLS and allow service_role to bypass.
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.recordings enable row level security;

-- Policies: block anon/authenticated; backend uses service_role which bypasses RLS and has full access.
create policy "Block anon and auth" on public.families for all using (false);
create policy "Block anon and auth" on public.family_members for all using (false);
create policy "Block anon and auth" on public.recordings for all using (false);

-- Isolation: your Express backend must always resolve the URL slug to family_id and filter all queries by family_id.
