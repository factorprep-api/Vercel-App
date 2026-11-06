-- ============================================================
-- help_videos_seed_v1.10.2.sql
-- v1.10.2: Help videos for the Athlete Hub + Coach Hub pods.
--
-- Run ONCE in the Supabase SQL Editor (test + prod). Idempotent —
-- safe to re-run at any time.
--
-- Three blocks:
--   (1) Dedupe + unique index on page_name — makes the seed safely
--       re-runnable and stops future duplicate rows.
--   (2) HUB CARD rows — page_name matches the hub card titles exactly,
--       powering the new per-card help buttons on AthleteHub/CoachHub.
--       These are upserts (latest URL wins).
--   (3) GAP-FILL for the pod pages themselves — the pod pages' Help
--       buttons use their own page names ("Coach Schedule", "Wellness
--       Input", ...). These rows are only inserted when the page has NO
--       row yet ("coming soon" today); existing working videos are
--       never overwritten. Delete block (3) if not wanted.
-- ============================================================

-- ---------- (1) DEDUPE + UNIQUE INDEX ----------
delete from public.help_videos a
using public.help_videos b
where a.page_name = b.page_name
  and a.ctid < b.ctid;

create unique index if not exists help_videos_page_name_key
  on public.help_videos (page_name);

-- ---------- (2) HUB CARD VIDEOS (upsert) ----------
insert into public.help_videos (page_name, video_url) values
  ('Team Schedule',     'https://factorprep-videos.b-cdn.net/Team%20Schedule%20Help%20Video.mp4'),
  ('Drill Designer',    'https://factorprep-videos.b-cdn.net/Drill%20Designer%20Help%20Video.mp4'),
  ('Wellness Center',   'https://factorprep-videos.b-cdn.net/Wellness%20Help%20Video.mp4'),
  ('Medical Vault',     'https://factorprep-videos.b-cdn.net/Medical%20Help%20Video.mp4'),
  ('Training Schedule', 'https://factorprep-videos.b-cdn.net/Traing%20Schedule%20Help%20Video.mp4'),
  ('Nutrition',         'https://factorprep-videos.b-cdn.net/Nutrition%20Help%20Video.mp4')
on conflict (page_name) do update
  set video_url = excluded.video_url;

-- ---------- (3) GAP-FILL: POD PAGES (insert only if missing) ----------
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

-- ---------- VERIFY ----------
select page_name, video_url from public.help_videos order by page_name;
