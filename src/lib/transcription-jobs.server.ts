// Server-only logic for the asynchronous transcription job pipeline.
//
// Flow:
//   1. Client uploads audio to storage and creates a job (status `queued`).
//   2. Server submits the audio to AssemblyAI, storing the provider job id and
//      registering a webhook (status `processing`), then returns the job id.
//   3. AssemblyAI calls /api/public/transcription-webhook when finished, which
//      finalises the job and saves the transcript.
//   4. Clients poll GET the job status; polling also reconciles the job with the
//      provider so the flow still completes if the webhook never arrives.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'

const ASSEMBLY = 'https://api.assemblyai.com/v2'

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type JobView = {
  id: string
  status: JobStatus
  transcription_id: string | null
  text: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

type JobRow = {
  id: string
  user_id: string
  status: JobStatus
  audio_url: string
  storage_path: string | null
  provider_job_id: string | null
  webhook_token: string
  transcription_id: string | null
  error: string | null
  attempts: number
  created_at: string
  completed_at: string | null
}

async function admin(): Promise<SupabaseClient<Database>> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  return supabaseAdmin as unknown as SupabaseClient<Database>
}

function webhookUrl(origin: string, jobId: string, token: string) {
  return `${origin.replace(/\/$/, '')}/api/public/transcription-webhook?job=${jobId}&token=${token}`
}

/** Creates a job row and submits the audio to the provider. Returns the job id. */
export async function createJob(opts: {
  supabase: SupabaseClient<Database>
  userId: string
  audioUrl: string
  storagePath?: string | null
  origin: string
}): Promise<{ id: string | null; status: JobStatus; error: string | null }> {
  const { fetchWithRetry, enforceRateLimit, requireEnv, ProxyError } = await import('./ai-proxy.server')

  try {
    enforceRateLimit(`job-create:${opts.userId}`, 10, 60_000)
    const apiKey = requireEnv('ASSEMBLYAI_API_KEY')

    const { data: created, error: insertError } = await opts.supabase
      .from('transcription_jobs')
      .insert({
        user_id: opts.userId,
        audio_url: opts.audioUrl,
        storage_path: opts.storagePath ?? null,
        status: 'queued',
      })
      .select('id, webhook_token')
      .single()

    if (insertError || !created) {
      console.error('Failed to create transcription job:', insertError?.message)
      return { id: null, status: 'failed', error: 'Could not queue the transcription job.' }
    }

    const db = await admin()
    const res = await fetchWithRetry(
      `${ASSEMBLY}/transcript`,
      {
        method: 'POST',
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: opts.audioUrl,
          speech_models: ['universal-2'],
          language_code: 'en',
          webhook_url: webhookUrl(opts.origin, created.id, created.webhook_token),
        }),
      },
      { retries: 2 },
    )

    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string }

    if (!res.ok || !body.id) {
      const message =
        res.status === 429
          ? 'Transcription service is busy, please retry in a moment.'
          : body.error || 'Could not start transcription.'
      await db
        .from('transcription_jobs')
        .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
        .eq('id', created.id)
      return { id: created.id, status: 'failed', error: message }
    }

    await db
      .from('transcription_jobs')
      .update({ status: 'processing', provider_job_id: body.id })
      .eq('id', created.id)

    return { id: created.id, status: 'processing', error: null }
  } catch (err) {
    console.error('createJob failed:', err)
    return {
      id: null,
      status: 'failed',
      error: err instanceof ProxyError ? err.message : 'Transcription service failed.',
    }
  }
}

/** Saves the transcript and marks the job complete. Idempotent. */
async function completeJob(job: JobRow, text: string): Promise<JobView> {
  const db = await admin()

  if (job.transcription_id) {
    const { data } = await db
      .from('transcriptions')
      .select('text_content')
      .eq('id', job.transcription_id)
      .maybeSingle()
    return toView({ ...job, status: 'completed' }, data?.text_content ?? text)
  }

  const { data: inserted, error } = await db
    .from('transcriptions')
    .insert({
      user_id: job.user_id,
      transcription_type: 'uploaded_file',
      text_content: text,
      audio_url: job.audio_url,
      storage_path: job.storage_path,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    console.error('Failed to save transcript for job', job.id, error?.message)
    return toView({ ...job, status: 'processing' }, null)
  }

  const completedAt = new Date().toISOString()
  await db
    .from('transcription_jobs')
    .update({ status: 'completed', transcription_id: inserted.id, completed_at: completedAt, error: null })
    .eq('id', job.id)

  return toView(
    { ...job, status: 'completed', transcription_id: inserted.id, completed_at: completedAt },
    text,
  )
}

async function failJob(job: JobRow, message: string): Promise<JobView> {
  const db = await admin()
  const completedAt = new Date().toISOString()
  await db
    .from('transcription_jobs')
    .update({ status: 'failed', error: message, completed_at: completedAt })
    .eq('id', job.id)
  return toView({ ...job, status: 'failed', error: message, completed_at: completedAt }, null)
}

function toView(job: JobRow, text: string | null): JobView {
  return {
    id: job.id,
    status: job.status,
    transcription_id: job.transcription_id,
    text,
    error: job.error,
    created_at: job.created_at,
    completed_at: job.completed_at,
  }
}

/** Handles a provider webhook callback for a job. */
export async function handleWebhook(jobId: string, token: string, providerStatus: string) {
  const db = await admin()
  const { data: job } = await db
    .from('transcription_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  const row = job as JobRow | null
  if (!row || row.webhook_token !== token) return { ok: false as const, status: 404 }
  if (row.status === 'completed' || row.status === 'failed') return { ok: true as const, status: 200 }

  if (providerStatus === 'error') {
    await failJob(row, 'The transcription provider reported an error.')
    return { ok: true as const, status: 200 }
  }

  await reconcile(row)
  return { ok: true as const, status: 200 }
}

/** Asks the provider for the current result and settles the job when it is done. */
async function reconcile(job: JobRow): Promise<JobView> {
  if (!job.provider_job_id) return toView(job, null)

  const { fetchWithRetry, requireEnv } = await import('./ai-proxy.server')

  try {
    const apiKey = requireEnv('ASSEMBLYAI_API_KEY')
    const res = await fetchWithRetry(
      `${ASSEMBLY}/transcript/${job.provider_job_id}`,
      { headers: { Authorization: apiKey } },
      { retries: 2 },
    )
    const body = (await res.json().catch(() => ({}))) as {
      status?: string
      text?: string
      error?: string
    }

    if (!res.ok) return toView(job, null)
    if (body.status === 'completed') return completeJob(job, body.text || 'No speech detected')
    if (body.status === 'error') return failJob(job, body.error || 'Transcription failed.')
    return toView(job, null)
  } catch (err) {
    console.error('reconcile failed for job', job.id, err)
    return toView(job, null)
  }
}

/** Reads a job for its owner, reconciling with the provider while still pending. */
export async function getJob(opts: {
  supabase: SupabaseClient<Database>
  userId: string
  jobId: string
}): Promise<JobView | null> {
  const { data } = await opts.supabase
    .from('transcription_jobs')
    .select('*')
    .eq('id', opts.jobId)
    .eq('user_id', opts.userId)
    .maybeSingle()

  const job = data as JobRow | null
  if (!job) return null

  if (job.status === 'queued' || job.status === 'processing') {
    return reconcile(job)
  }

  if (job.status === 'completed' && job.transcription_id) {
    const { data: transcript } = await opts.supabase
      .from('transcriptions')
      .select('text_content')
      .eq('id', job.transcription_id)
      .maybeSingle()
    return toView(job, transcript?.text_content ?? null)
  }

  return toView(job, null)
}
