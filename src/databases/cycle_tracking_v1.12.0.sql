-- ============================================================================
-- FactorPrep v1.12.0 — CYCLE TRACKING TOGGLE MIGRATION
-- Paste into Supabase SQL Editor. Run ONCE, top to bottom. Idempotent.
--
-- Adds one entry kind to cycle_logs: cycle_tracking_off, a pause bookmark
-- written by the integrated tracking toggle in the Cycle tracking card.
-- OFF covers both the athlete choosing not to track and being on a hormonal
-- contraceptive (the pill changes the hormone patterns the population-
-- average curves are built on). The bookmark is soft-deleted to resume, and
-- a later period start also resumes tracking by itself (newest event wins).
-- While paused, every cycle-derived surface is hidden client-side: the
-- athlete chart & phase bar (My Progress), the wellness pod cycle card, the
-- coach LOW-H chip, the CHECK IN welfare chip and the Cycle Insights modal.
-- ============================================================================

-- Widen the entry_kind check constraint (default name from the inline CHECK
-- in schema.sql: cycle_logs_entry_kind_check).
alter table public.cycle_logs
  drop constraint if exists cycle_logs_entry_kind_check;

alter table public.cycle_logs
  add constraint cycle_logs_entry_kind_check
  check (entry_kind in ('period_start', 'missed_cycle', 'cycle_tracking_off'));

-- RLS is unchanged: pause bookmarks ride the exact same policies as
-- period_start / missed_cycle rows (athlete writes own rows only).
