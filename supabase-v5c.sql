-- Run in Supabase SQL Editor → Run without RLS
-- Adds profile picture storage to settings

alter table settings add column if not exists profile_picture text;
alter table settings add column if not exists business_logo text;
