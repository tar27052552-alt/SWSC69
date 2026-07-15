-- Drop unique constraint on user_face_descriptors table to allow multiple descriptors per user.
-- Run this in the Supabase SQL Editor.
ALTER TABLE user_face_descriptors DROP CONSTRAINT IF EXISTS unique_user_descriptor;
