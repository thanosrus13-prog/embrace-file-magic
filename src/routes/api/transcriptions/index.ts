import { createFileRoute } from '@tanstack/react-router'
import { authenticateRequest, jsonError } from '@/lib/api-auth.server'
import { listQuerySchema } from '@/lib/api-schemas'
import { enforceApiRateLimit } from '@/lib/rate-limit.server'
import { cached } from '@/lib/cache.server'

const SELECT = 'id, transcription_type, text_content, audio_url, created_at'
const LIST_TTL_MS = 15_000

export const Route = createFileRoute('/api/transcriptions/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateRequest(request)
        if (!auth.ok) return auth.response

        // 60 list reads per minute per user.
        const limited = enforceApiRateLimit('transcriptions:list', auth.userId, 60, 60_000)
        if ('response' in limited) return limited.response

        const url = new URL(request.url)
        const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams))
        if (!parsed.success) {
          return jsonError(400, 'Invalid query parameters', parsed.error.flatten().fieldErrors)
        }
        const { limit, offset, type, search } = parsed.data

        const cacheKey = `transcriptions:${auth.userId}:list:${limit}:${offset}:${type ?? ''}:${search ?? ''}`

        const { value, hit } = await cached(cacheKey, LIST_TTL_MS, async () => {
          let query = auth.supabase
            .from('transcriptions')
            .select(SELECT, { count: 'exact' })
            .eq('user_id', auth.userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

          if (type) query = query.eq('transcription_type', type)
          if (search) query = query.ilike('text_content', `%${search}%`)

          const { data, error, count } = await query
          if (error) return null
          return { data: data ?? [], pagination: { limit, offset, total: count ?? 0 } }
        })

        if (!value) return jsonError(500, 'Failed to fetch transcriptions')

        return Response.json(value, {
          headers: {
            ...limited.headers,
            'Cache-Control': 'private, no-store',
            'X-Cache': hit ? 'HIT' : 'MISS',
          },
        })
      },
    },
  },
})
