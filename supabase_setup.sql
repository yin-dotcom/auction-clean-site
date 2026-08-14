-- Run once in Supabase SQL Editor before using automatic upsert.
-- Remove existing duplicates first if this statement reports a conflict.
CREATE UNIQUE INDEX IF NOT EXISTS jaa_items_event_box_unique
ON public.jaa_items (大会開催日, 箱番);
