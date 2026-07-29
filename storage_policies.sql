-- ============================================================================
-- CDS Hub — let signed-in staff use the 'ein-proof' storage bucket
--
-- Run as ONE query in:
--   https://supabase.com/dashboard/project/siivpekcaryeyttszwav/sql/new
--
-- The bucket itself already exists and is PRIVATE (no public URLs; the hub hands
-- out short-lived signed links instead). Storage has its own row level security
-- on storage.objects, so without these four policies the hub gets "new row
-- violates row-level security policy" the moment anyone tries to upload.
--
-- Scoped to bucket_id = 'ein-proof' on purpose: these policies grant nothing in
-- any other bucket added later.
--
-- The last statement returns a result, so whatever the editor shows IS the
-- verification. Expect four rows.
-- ============================================================================

drop policy if exists "ein_proof_select" on storage.objects;
drop policy if exists "ein_proof_insert" on storage.objects;
drop policy if exists "ein_proof_update" on storage.objects;
drop policy if exists "ein_proof_delete" on storage.objects;

create policy "ein_proof_select" on storage.objects
  for select to authenticated using (bucket_id = 'ein-proof');

create policy "ein_proof_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'ein-proof');

create policy "ein_proof_update" on storage.objects
  for update to authenticated using (bucket_id = 'ein-proof');

create policy "ein_proof_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'ein-proof');

-- Verification. Four rows expected.
select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'ein_proof%'
order by policyname;
