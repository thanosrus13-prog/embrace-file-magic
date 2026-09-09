import { createFileRoute } from '@tanstack/react-router'
import { authenticateRequest, jsonError } from '@/lib/api-auth.server'
import { idParamSchema } from '@/lib/api-schemas'
import { enforceApiRateLimit } from '@/lib/rate-limit.server'
import { cached, cacheInvalidatePrefix } from '@/lib/cache.server'

const SELECT = 'id, transcription_type, text_content, audio_url, created_at'
const ITEM_TTL_MS = 30_000

export const Route = createFileRoute('/api/transcriptions/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateRequest(request)
        if (!auth.ok) return auth.response

        // 120 single reads per minute per user.
        const limited = enforceApiRateLimit('transcriptions:get', auth.userId, 120, 60_000)
        if ('response' in limited) return limited.response

        const parsed = idParamSchema.safeParse(params)
        if (!parsed.success) {
          return jsonError(400, 'Invalid id', parsed.error.flatten().fieldErrors)
        }

        const cacheKey = `transcriptions:${auth.userId}:item:${parsed.data.id}`

        const { value, hit } = await cached(cacheKey, ITEM_TTL_MS, async () => {
          const { data, error } = await auth.supabase
            .from('transcriptions')
            .select(SELECT)
            .eq('id', parsed.data.id)
            .eq('user_id', auth.userId)
            .is('deleted_at', null)
            .maybeSingle()

          if (error) return { status: 500 as const, data: null }
          if (!data) return { status: 404 as const, data: null }
          return { status: 200 as const, data }
        })

        if (value.status === 500) return jsonError(500, 'Failed to fetch transcription')
        if (value.status === 404) return jsonError(404, 'Transcription not found')

        return Response.json(
          { data: value.data },
          {
            headers: {
              ...limited.headers,
              'Cache-Control': 'private, no-store',
              'X-Cache': hit ? 'HIT' : 'MISS',
            },
          },
        )
      },

      DELETE: async ({ request, params }) => {
        const auth = await authenticateRequest(request)
        if (!auth.ok) return auth.response

        // 30 deletes per minute per user.
        const limited = enforceApiRateLimit('transcriptions:delete', auth.userId, 30, 60_000)
        if ('response' in limited) return limited.response

        const parsed = idParamSchema.safeParse(params)
        if (!parsed.success) {
          return jsonError(400, 'Invalid id', parsed.error.flatten().fieldErrors)
        }

        // Soft delete: the row is retained and excluded from reads
        const { data, error } = await auth.supabase
          .from('transcriptions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', parsed.data.id)
          .eq('user_id', auth.userId)
          .is('deleted_at', null)
          .select('id, storage_path')

        if (error) return jsonError(500, 'Failed to delete transcription')
        if (!data || data.length === 0) return jsonError(404, 'Transcription not found')

        // Any cached read for this user is now stale.
        cacheInvalidatePrefix(`transcriptions:${auth.userId}:`)

        const storagePath = data[0]?.storage_path
        if (storagePath) {
          const { error: storageError } = await auth.supabase.storage
            .from('audio_files')
            .remove([storagePath])
          if (storageError) console.error('Failed to delete audio file:', storageError.message)
        }

        return new Response(null, { status: 204, headers: limited.headers })
      },
    },
  },
})
