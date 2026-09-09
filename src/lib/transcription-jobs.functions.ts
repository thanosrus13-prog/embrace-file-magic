import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

async function currentOrigin() {
  const { getRequest } = await import('@tanstack/react-start/server')
  const configured = process.env['PUBLIC_APP_URL']
  if (configured) return configured
  return new URL(getRequest().url).origin
}

// Accepts an uploaded audio file URL, queues an asynchronous job and returns its id.
export const createTranscriptionJob = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { audioUrl: string; storagePath?: string | null }) => {
    const audioUrl = (input?.audioUrl ?? '').trim()
    if (!/^https:\/\//.test(audioUrl)) throw new Error('a https audio URL is required')
    return { audioUrl, storagePath: input?.storagePath ?? null }
  })
  .handler(async ({ data, context }) => {
    const { assertRateLimit } = await import('./rate-limit.server')
    // 10 uploads per 5 minutes per user.
    assertRateLimit(`jobs:create:${context.userId}`, 10, 5 * 60_000)

    const { createJob } = await import('./transcription-jobs.server')
    return createJob({
      supabase: context.supabase,
      userId: context.userId,
      audioUrl: data.audioUrl,
      storagePath: data.storagePath,
      origin: await currentOrigin(),
    })
  })

// Polls a job. Also reconciles with the provider so the job settles even if the
// webhook callback never reaches this deployment.
export const getTranscriptionJob = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => {
    const jobId = (input?.jobId ?? '').trim()
    if (!/^[0-9a-fA-F-]{36}$/.test(jobId)) throw new Error('invalid job id')
    return { jobId }
  })
  .handler(async ({ data, context }) => {
    const { assertRateLimit } = await import('./rate-limit.server')
    assertRateLimit(`jobs:poll:${context.userId}`, 240, 60_000)

    const { getJob } = await import('./transcription-jobs.server')
    const job = await getJob({ supabase: context.supabase, userId: context.userId, jobId: data.jobId })
    if (!job) return { id: data.jobId, status: 'failed' as const, text: null, error: 'Job not found', transcription_id: null, created_at: null, completed_at: null }
    return job
  })
