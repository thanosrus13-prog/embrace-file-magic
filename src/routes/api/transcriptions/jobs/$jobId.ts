import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { authenticateRequest, jsonError } from '@/lib/api-auth.server'
import { enforceApiRateLimit } from '@/lib/rate-limit.server'

const paramSchema = z.object({ jobId: z.string().uuid('jobId must be a valid UUID') })

export const Route = createFileRoute('/api/transcriptions/jobs/$jobId')({
  server: {
    handlers: {
      // Poll a job's status; returns the transcript once it has completed.
      GET: async ({ request, params }) => {
        const auth = await authenticateRequest(request)
        if (!auth.ok) return auth.response

        // Clients poll roughly every 1.5s, so allow a generous polling budget.
        const limited = enforceApiRateLimit('jobs:poll', auth.userId, 240, 60_000)
        if ('response' in limited) return limited.response

        const parsed = paramSchema.safeParse(params)
        if (!parsed.success) {
          return jsonError(400, 'Invalid job id', parsed.error.flatten().fieldErrors)
        }

        const { getJob } = await import('@/lib/transcription-jobs.server')
        const job = await getJob({
          supabase: auth.supabase,
          userId: auth.userId,
          jobId: parsed.data.jobId,
        })

        if (!job) return jsonError(404, 'Job not found')

        return Response.json(
          { data: job },
          { headers: { ...limited.headers, 'Cache-Control': 'private, no-store' } },
        )
      },
    },
  },
})
