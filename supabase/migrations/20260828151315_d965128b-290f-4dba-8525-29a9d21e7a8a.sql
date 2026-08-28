ALTER TABLE public.transcriptions ADD COLUMN IF NOT EXISTS audio_url TEXT;

CREATE POLICY "Users can upload their own audio files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'audio_files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read their own audio files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audio_files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own audio files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'audio_files' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'audio_files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own audio files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'audio_files' AND auth.uid()::text = (storage.foldername(name))[1]);