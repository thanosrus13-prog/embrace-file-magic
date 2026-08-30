-- Add raw storage path column so cleanup can target the exact object
ALTER TABLE public.transcriptions ADD COLUMN IF NOT EXISTS storage_path text;

-- Function: delete the audio file from storage when its transcription row is removed
CREATE OR REPLACE FUNCTION public.delete_audio_file_on_transcription_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.storage_path IS NOT NULL THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'audio_files'
      AND name = OLD.storage_path;
  END IF;
  RETURN OLD;
END;
$$;

-- Trigger: run cleanup after every transcription delete
DROP TRIGGER IF EXISTS cleanup_audio_on_transcription_delete ON public.transcriptions;
CREATE TRIGGER cleanup_audio_on_transcription_delete
AFTER DELETE ON public.transcriptions
FOR EACH ROW
EXECUTE FUNCTION public.delete_audio_file_on_transcription_delete();