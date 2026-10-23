-- Run by the developer in the Supabase SQL editor on 2026-10-21, so it is NOT in
-- the project's migration history (there is no version number). Verified
-- afterwards with `select feature from public.api_limits`: only `advisor` and
-- `camera` remain.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
-- Data only, no schema change. The registration-card scan was removed (the photo can
-- show the owner's name and address, and it went to Gemini's free tier), so its
-- daily-limit row goes too. With no row, the usage triggers would refuse any
-- 'registration_scan' attempt (see 2026-10-20_ai_camera_usage_limits.sql). Existing
-- api_usage / api_usage_global rows are deliberately left alone (there were none).

delete from public.api_limits where feature = 'registration_scan';
