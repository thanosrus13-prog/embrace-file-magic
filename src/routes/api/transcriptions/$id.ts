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
          .select('id, storage_path, storage_provider')

        if (error) return jsonError(500, 'Failed to delete transcription')
        if (!data || data.length === 0) return jsonError(404, 'Transcription not found')

        // Any cached read for this user is now stale.
        cacheInvalidatePrefix(`transcriptions:${auth.userId}:`)

        const storagePath = data[0]?.storage_path
        const storageProvider = data[0]?.storage_provider ?? 'supabase'
        if (storagePath) {
          if (storageProvider === 's3') {
            // Delete from AWS S3 via the gateway.
            const LOVABLE_API_KEY = process.env['LOVABLE_API_KEY']
            const AWS_S3_API_KEY = process.env['AWS_S3_API_KEY']
            if (LOVABLE_API_KEY && AWS_S3_API_KEY) {
              const delRes = await fetch(
                `https://connector-gateway.lovable.dev/aws_s3/${encodeURIComponent(storagePath)}`,
                { method: 'DELETE', headers: {
                  'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                  'X-Connection-Api-Key': AWS_S3_API_KEY,
                } },
              )
              if (!delRes.ok && delRes.status !== 404) {
                console.error('Failed to delete S3 object:', delRes.status, await delRes.text().catch(() => ''))
              }
            }
          } else {
            const { error: storageError } = await auth.supabase.storage
              .from('audio_files')
              .remove([storagePath])
            if (storageError) console.error('Failed to delete audio file:', storageError.message)
          }
        }

        return new Response(null, { status: 204, headers: limited.headers })
      },
    },
  },
})
