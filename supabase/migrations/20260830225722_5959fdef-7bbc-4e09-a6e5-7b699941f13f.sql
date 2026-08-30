-- The cleanup function is only meant to run via the trigger, not be called directly
REVOKE EXECUTE ON FUNCTION public.delete_audio_file_on_transcription_delete() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_audio_file_on_transcription_delete() FROM authenticated;