-- ============================================================
-- help_videos_seed_v1.10.2.sql
-- v1.10.2: Help videos for the pod pages, served by the EXISTING
-- fixed bottom-right "watch help video" button on each page.
--
-- Run ONCE in the Supabase SQL Editor (test + prod). Idempotent —
-- safe to re-run at any time.
--
-- Blocks:
--   (1) Dedupe + unique index on page_name — makes the seed safely
--       re-runnable and stops future duplicate rows.
--   (2) GAP-FILL for the pod pages — each page's Help button matches
--       on its own page_name ("Coach Schedule", "Wellness Input", ...).
--       Rows are only inserted when the page has NO row yet ("coming
--       soon" today); existing working videos are never overwritten.
--   (3) OPTIONAL CLEANUP (commented out) — the first cut of this seed
--       also inserted hub-card-title rows (Team Schedule, Drill
--       Designer, ...) for an experiment that was reverted. If that
--       version already ran against this database, uncomment and run
--       the delete below to remove those now-unused rows.
-- ============================================================

-- ---------- (1) DEDUPE + UNIQUE INDEX ----------
delete from public.help_videos a
using public.help_videos b
where a.page_name = b.page_name
  and a.ctid < b.ctid;

create unique index if not exists help_videos_page_name_key
  on public.help_videos (page_name);

-- ---------- (2) GAP-FILL: POD PAGES (insert only if missing) ----------
insert into public.help_videos (page_name, video_url)
select v.page_name, v.video_url
from (values
  ('Coach Schedule',    'https://factorprep-videos.b-cdn.net/Team%20Schedule%20Help%20Video.mp4'),
  ('Whiteboard',        'https://factorprep-videos.b-cdn.net/Drill%20Designer%20Help%20Video.mp4'),
  ('Wellness Input',    'https://factorprep-videos.b-cdn.net/Wellness%20Help%20Video.mp4'),
  ('Medical Input',     'https://factorprep-videos.b-cdn.net/Medical%20Help%20Video.mp4'),
  ('Schedule Input',    'https://factorprep-videos.b-cdn.net/Traing%20Schedule%20Help%20Video.mp4'),
  ('Athlete Nutrition', 'https://factorprep-videos.b-cdn.net/Nutrition%20Help%20Video.mp4')
) as v(page_name, video_url)
where not exists (
  select 1 from public.help_videos h where h.page_name = v.page_name
);

-- ---------- (3) OPTIONAL CLEANUP (uncomment only if needed) ----------
-- delete from public.help_videos
-- where page_name in (
--   'Team Schedule', 'Drill Designer', 'Wellness Center',
--   'Medical Vault', 'Training Schedule', 'Nutrition'
-- );

-- ---------- VERIFY ----------
select page_name, video_url from public.help_videos order by page_name;

