import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

// Provider callback for finished transcription jobs.
// Authenticated by the per-job webhook token issued when the job was created.
const querySchema = z.object({
  job: z.string().uuid(),
  token: z.string().uuid(),
})

const bodySchema = z
  .object({
    status: z.string().optional(),
    transcript_id: z.string().optional(),
  })
  .passthrough()

export const Route = createFileRoute('/api/public/transcription-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const query = querySchema.safeParse(Object.fromEntries(url.searchParams))
        if (!query.success) return new Response('Invalid callback parameters', { status: 400 })

        const raw = await request.text()
        let payload: unknown = {}
        try {
          payload = raw ? JSON.parse(raw) : {}
        } catch {
          return new Response('Invalid JSON body', { status: 400 })
        }

        const parsedBody = bodySchema.safeParse(payload)
        if (!parsedBody.success) return new Response('Invalid payload', { status: 400 })

        const { handleWebhook } = await import('@/lib/transcription-jobs.server')
        const result = await handleWebhook(
          query.data.job,
          query.data.token,
          parsedBody.data.status ?? 'completed',
        )

        if (!result.ok) return new Response('Unknown job', { status: result.status })
        return new Response('ok')
      },
    },
  },
})
