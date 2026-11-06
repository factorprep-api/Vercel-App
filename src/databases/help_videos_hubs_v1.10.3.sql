-- ============================================================
-- help_videos_hubs_v1.10.3.sql
-- v1.10.3: Hub help videos — Coach Hub + Athlete Hub get the same
-- fixed bottom-right "watch help video" button as every other page.
--
-- Run ONCE in the Supabase SQL Editor (test + prod). Idempotent —
-- safe to re-run at any time.
--
-- These are UPSERTS (latest URL wins), unlike the gap-fill in
-- help_videos_seed_v1.10.2.sql, because these two rows are brand new
-- and there is no pre-existing video to protect.
--
-- The unique index is (re)created here so this file also works
-- standalone on fresh installs that never ran the v1.10.2 seed.
-- ============================================================

delete from public.help_videos a
using public.help_videos b
where a.page_name = b.page_name
  and a.ctid < b.ctid;

create unique index if not exists help_videos_page_name_key
  on public.help_videos (page_name);

insert into public.help_videos (page_name, video_url) values
  ('Coach Hub',   'https://factorprep-videos.b-cdn.net/Coach%20Hub%20Help%20Video.mp4'),
  ('Athlete Hub', 'https://factorprep-videos.b-cdn.net/Athlete%20Hub%20Help%20Video.mp4')
on conflict (page_name) do update
  set video_url = excluded.video_url;

-- ---------- VERIFY ----------
select page_name, video_url from public.help_videos order by page_name;
