-- Run this once in Supabase → SQL Editor
-- Enables realtime change events on the profiles table so the admin agents
-- page updates immediately on approve/edit/delete without a page reload.

-- REPLICA IDENTITY FULL ensures DELETE events carry the full old row
-- (not just the primary key) so client-side state can be updated precisely.
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Add profiles to the Supabase realtime publication.
-- phones is already in this publication; this adds profiles.
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
