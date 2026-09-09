DROP TRIGGER IF EXISTS cleanup_audio_on_transcription_delete ON public.transcriptions;
DROP FUNCTION IF EXISTS public.delete_audio_file_on_transcription_delete();