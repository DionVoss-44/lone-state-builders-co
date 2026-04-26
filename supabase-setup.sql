-- ============================================================================
--  Lone State Builders Co — Supabase setup
--  Run this ONCE in Supabase → SQL Editor.
--  Project: https://rkjrspovoueajamzpfzc.supabase.co
-- ============================================================================

-- 1. LEADS TABLE ─────────────────────────────────────────────────────────────
create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  name             text not null,
  company          text,
  email            text not null,
  phone            text,
  project_location text,
  project_type     text,
  opening_count    text,
  timeline         text,
  notes            text,
  file_paths       text[] default '{}',
  file_count       int default 0,
  total_bytes      bigint default 0,
  source           text default 'landing',
  user_agent       text,
  status           text default 'new'  -- new | reviewing | quoted | won | lost
);

-- Enable Row Level Security
alter table public.leads enable row level security;

-- Allow the anon key to INSERT new leads (from the landing page form),
-- but NOT read, update, or delete. Admin access is via the service role
-- (Supabase Studio or server side).
drop policy if exists "anon can insert leads" on public.leads;
create policy "anon can insert leads"
  on public.leads
  for insert
  to anon
  with check (true);


-- 2. STORAGE BUCKET FOR BLUEPRINTS ───────────────────────────────────────────
-- Create a PRIVATE bucket. If you want a file-size cap at the storage layer,
-- set it here (Supabase accepts this up to your project plan's limit).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blueprints',
  'blueprints',
  false,                             -- private; generate signed URLs to share
  786432000,                         -- 750 MB per file
  array[
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/acad',
    'image/vnd.dwg',
    'application/octet-stream'       -- DWG sometimes comes in as octet-stream
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- 3. STORAGE POLICIES ────────────────────────────────────────────────────────
-- Allow visitors to UPLOAD into the blueprints bucket, but not list, read, or
-- delete. Submitted drawings stay confidential.
--
-- Scope is `to public` (not `to anon`) on purpose. `public` matches every role
-- Postgres can assign to the request (anon, authenticated, service_role), so
-- the policy holds up even if the storage API's role resolution drifts or the
-- same form is later hit while a session cookie is present. This avoids the
-- 403 "new row violates row-level security policy" class of failures on the
-- /storage/v1/upload/resumable endpoint.
drop policy if exists "anon can upload to blueprints"       on storage.objects;
drop policy if exists "anon can resume own uploads"         on storage.objects;
drop policy if exists "public can upload to blueprints"     on storage.objects;
drop policy if exists "public can resume blueprints uploads" on storage.objects;

create policy "public can upload to blueprints"
  on storage.objects
  for insert
  to public
  with check ( bucket_id = 'blueprints' );

-- Needed so tus-js-client can HEAD/PATCH the in-progress upload while resuming.
create policy "public can resume blueprints uploads"
  on storage.objects
  for update
  to public
  using     ( bucket_id = 'blueprints' )
  with check( bucket_id = 'blueprints' );


-- 4. OPTIONAL — helpful index
create index if not exists leads_created_at_idx on public.leads (created_at desc);
