CREATE TABLE public.transcriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  transcription_type TEXT NOT NULL CHECK (transcription_type IN ('live', 'uploaded_file')),
  text_content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcriptions TO authenticated;
GRANT ALL ON public.transcriptions TO service_role;

ALTER TABLE public.transcriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transcriptions"
  ON public.transcriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transcriptions"
  ON public.transcriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transcriptions"
  ON public.transcriptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transcriptions"
  ON public.transcriptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX transcriptions_user_id_created_at_idx ON public.transcriptions (user_id, created_at DESC);