-- Remove default execute access so only the trigger (and postgres roles) can run this function
REVOKE ALL ON FUNCTION public.delete_audio_file_on_transcription_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_audio_file_on_transcription_delete() FROM anon;
REVOKE ALL ON FUNCTION public.delete_audio_file_on_transcription_delete() FROM authenticated;