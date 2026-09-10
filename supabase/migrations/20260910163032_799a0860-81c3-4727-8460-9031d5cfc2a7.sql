ALTER TABLE public.transcriptions ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 'supabase';
COMMENT ON COLUMN public.transcriptions.storage_provider IS 'Where the audio file is stored: supabase or s3';

ALTER TABLE public.transcription_jobs ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 'supabase';
COMMENT ON COLUMN public.transcription_jobs.storage_provider IS 'Where the audio file is stored: supabase or s3';