import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { authenticateRequest, jsonError } from '@/lib/api-auth.server'
import { enforceApiRateLimit } from '@/lib/rate-limit.server'

const createJobSchema = z.object({
  audio_url: z.string().url().startsWith('https://'),
  storage_path: z.string().min(1).max(500).optional(),
})

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['queued', 'processing', 'completed', 'failed']).optional(),
})

const SELECT = 'id, status, transcription_id, error, created_at, updated_at, completed_at'

export const Route = createFileRoute('/api/transcriptions/jobs/')({
  server: {
    handlers: {
      // Queue a transcription job for an already-uploaded audio file.
      POST: async ({ request }) => {
        const auth = await authenticateRequest(request)
        if (!auth.ok) return auth.response

        // Uploads are expensive: 10 queued jobs per 5 minutes per user.
        const limited = enforceApiRateLimit('jobs:create', auth.userId, 10, 5 * 60_000)
        if ('response' in limited) return limited.response

        const body = await request.json().catch(() => null)
        const parsed = createJobSchema.safeParse(body)
        if (!parsed.success) {
          return jsonError(400, 'Invalid request body', parsed.error.flatten().fieldErrors)
        }

        const { createJob } = await import('@/lib/transcription-jobs.server')
        const result = await createJob({
          supabase: auth.supabase,
          userId: auth.userId,
          audioUrl: parsed.data.audio_url,
          storagePath: parsed.data.storage_path ?? null,
          origin: process.env['PUBLIC_APP_URL'] || new URL(request.url).origin,
        })

        if (!result.id) return jsonError(502, result.error ?? 'Could not queue the job')

        return Response.json(
          { data: { id: result.id, status: result.status, error: result.error } },
          {
            status: 202,
            headers: { ...limited.headers, Location: `/api/transcriptions/jobs/${result.id}` },
          },
        )
      },

      // List the caller's jobs.
      GET: async ({ request }) => {
        const auth = await authenticateRequest(request)
        if (!auth.ok) return auth.response

        // 60 job-list reads per minute per user.
        const listLimited = enforceApiRateLimit('jobs:list', auth.userId, 60, 60_000)
        if ('response' in listLimited) return listLimited.response

        const url = new URL(request.url)
        const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) {
          return jsonError(400, 'Invalid query parameters', parsed.error.flatten().fieldErrors)
        }
        const { limit, offset, status } = parsed.data

        let query = auth.supabase
          .from('transcription_jobs')
          .select(SELECT, { count: 'exact' })
          .eq('user_id', auth.userId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1)

        if (status) query = query.eq('status', status)

        const { data, error, count } = await query
        if (error) return jsonError(500, 'Failed to fetch jobs')

        return Response.json(
          { data: data ?? [], pagination: { limit, offset, total: count ?? 0 } },
          { headers: { ...listLimited.headers, 'Cache-Control': 'private, no-store' } },
        )
      },
    },
  },
})
