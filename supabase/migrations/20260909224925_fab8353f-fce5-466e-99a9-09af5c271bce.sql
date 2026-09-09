-- Indexes for common query paths
CREATE INDEX IF NOT EXISTS idx_transcriptions_user_id ON public.transcriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at ON public.transcriptions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcriptions_user_created ON public.transcriptions (user_id, created_at DESC);

-- Soft deletes
ALTER TABLE public.transcriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_transcriptions_active
  ON public.transcriptions (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Audit log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','SOFT_DELETE')),
  actor_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audit entries"
  ON public.audit_log FOR SELECT TO authenticated
  USING (auth.uid() = actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON public.audit_log (table_name, record_id);

-- Audit trigger
CREATE OR REPLACE FUNCTION public.record_transcription_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_action := 'SOFT_DELETE';
  ELSE
    v_action := 'UPDATE';
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
  VALUES (
    'transcriptions',
    COALESCE(NEW.id, OLD.id),
    v_action,
    COALESCE(auth.uid(), COALESCE(NEW.user_id, OLD.user_id)),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_transcription_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transcriptions_audit ON public.transcriptions;
CREATE TRIGGER transcriptions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.transcriptions
FOR EACH ROW EXECUTE FUNCTION public.record_transcription_audit();