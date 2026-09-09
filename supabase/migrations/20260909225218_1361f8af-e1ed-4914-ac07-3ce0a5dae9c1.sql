CREATE TABLE public.transcription_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  audio_url text NOT NULL,
  storage_path text,
  provider text NOT NULL DEFAULT 'assemblyai',
  provider_job_id text,
  webhook_token uuid NOT NULL DEFAULT gen_random_uuid(),
  transcription_id uuid REFERENCES public.transcriptions(id) ON DELETE SET NULL,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT ON public.transcription_jobs TO authenticated;
GRANT ALL ON public.transcription_jobs TO service_role;

ALTER TABLE public.transcription_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transcription jobs"
  ON public.transcription_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transcription jobs"
  ON public.transcription_jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_transcription_jobs_user_created ON public.transcription_jobs (user_id, created_at DESC);
CREATE INDEX idx_transcription_jobs_pending ON public.transcription_jobs (status) WHERE status IN ('queued','processing');
CREATE INDEX idx_transcription_jobs_provider_job ON public.transcription_jobs (provider_job_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_transcription_jobs_updated_at
  BEFORE UPDATE ON public.transcription_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();