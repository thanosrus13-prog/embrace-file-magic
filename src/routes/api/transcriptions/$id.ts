import { createFileRoute } from '@tanstack/react-router'
import { authenticateRequest, jsonError } from '@/lib/api-auth.server'
import { idParamSchema } from '@/lib/api-schemas'

const SELECT = 'id, transcription_type, text_content, audio_url, created_at'

export const Route = createFileRoute('/api/transcriptions/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateRequest(request)
        if (!auth.ok) return auth.response

        const parsed = idParamSchema.safeParse(params)
        if (!parsed.success) {
          return jsonError(400, 'Invalid id', parsed.error.flatten().fieldErrors)
        }

        const { data, error } = await auth.supabase
          .from('transcriptions')
          .select(SELECT)
          .eq('id', parsed.data.id)
          .eq('user_id', auth.userId)
          .maybeSingle()

        if (error) return jsonError(500, 'Failed to fetch transcription')
        if (!data) return jsonError(404, 'Transcription not found')

        return Response.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
      },

      DELETE: async ({ request, params }) => {
        const auth = await authenticateRequest(request)
        if (!auth.ok) return auth.response

        const parsed = idParamSchema.safeParse(params)
        if (!parsed.success) {
          return jsonError(400, 'Invalid id', parsed.error.flatten().fieldErrors)
        }

        const { data, error } = await auth.supabase
          .from('transcriptions')
          .delete()
          .eq('id', parsed.data.id)
          .eq('user_id', auth.userId)
          .select('id, storage_path')

        if (error) return jsonError(500, 'Failed to delete transcription')
        if (!data || data.length === 0) return jsonError(404, 'Transcription not found')

        const storagePath = data[0]?.storage_path
        if (storagePath) {
          const { error: storageError } = await auth.supabase.storage
            .from('audio_files')
            .remove([storagePath])
          if (storageError) console.error('Failed to delete audio file:', storageError.message)
        }

        return new Response(null, { status: 204 })
      },
    },
  },
})
