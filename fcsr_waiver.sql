-- CDS attendant FCSR finding and Good Cause Waiver (2026-10-23, Samantha: "Build it" after the
-- mockup F236LB4JtWEuYU39F2EQfs). When the FCSR comes back with something, the office picks what it
-- means on the attendant's profile, and the hub tells the attendant and keeps the to-dos:
--
-- cds_screening.finding_review:
--   gcw_needed        : on the "cannot hire" list; they apply to the state for a Good Cause Waiver.
--                       No working, no Step 2, until the office records the approval letter.
--   edl               : on the Employee Disqualification List; no waiver is possible.
--   cleared_no_waiver : not on the list; clear after review, nothing sent.
--   cleared_waiver    : waiver approved and the office picked "Clear to continue".
--   not_moving        : the office decided not to move forward (reason in findings_note).
--
-- Setting fcsr_notices (live false = the texts and emails wait in Messages, nothing sent).
-- Safe to run twice.

alter table public.cds_screening add column if not exists finding_review text;
alter table public.cds_screening add column if not exists finding_reviewed_at timestamptz;
alter table public.cds_screening add column if not exists finding_reviewed_by text;
alter table public.cds_screening add column if not exists finding_notice text;
alter table public.cds_screening add column if not exists gcw_letter uuid references public.cds_media(id);
alter table public.cds_screening add column if not exists gcw_decided_at timestamptz;
alter table public.cds_screening add column if not exists gcw_decided_by text;

do $$ begin
  alter table public.cds_screening add constraint cds_screening_finding_review_check
    check (finding_review in ('gcw_needed','edl','cleared_no_waiver','cleared_waiver','not_moving'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.cds_screening add constraint cds_screening_finding_notice_check
    check (finding_notice in ('sent','phone'));
exception when duplicate_object then null; end $$;

insert into public.cds_match_settings (key, value, updated_by)
values ('fcsr_notices', '{"live": false}'::jsonb, 'fcsr_waiver.sql')
on conflict (key) do nothing;

notify pgrst, 'reload schema';

-- ---------- rollback (by hand, only if asked) ----------
-- alter table public.cds_screening drop constraint if exists cds_screening_finding_review_check,
--   drop constraint if exists cds_screening_finding_notice_check,
--   drop column if exists finding_review, drop column if exists finding_reviewed_at, drop column if exists finding_reviewed_by,
--   drop column if exists finding_notice, drop column if exists gcw_letter, drop column if exists gcw_decided_at, drop column if exists gcw_decided_by;
-- delete from public.cds_match_settings where key = 'fcsr_notices';
