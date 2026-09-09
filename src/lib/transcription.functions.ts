import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

const ASSEMBLY = 'https://api.assemblyai.com/v2'

// Kicks off an AssemblyAI job for an already-uploaded audio URL.
export const startTranscription = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { audioUrl: string }) => {
    const audioUrl = (input?.audioUrl ?? '').trim()
    if (!/^https:\/\//.test(audioUrl)) throw new Error('a https audio URL is required')
    return { audioUrl }
  })
  .handler(async ({ data, context }) => {
    const { fetchWithRetry, enforceRateLimit, requireEnv, ProxyError } = await import('./ai-proxy.server')

    try {
      enforceRateLimit(`transcribe:${context.userId}`, 10, 60_000)
      const apiKey = requireEnv('ASSEMBLYAI_API_KEY')

      const res = await fetchWithRetry(
        `${ASSEMBLY}/transcript`,
        {
          method: 'POST',
          headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio_url: data.audioUrl,
            speech_models: ['universal-2'],
            language_code: 'en',
          }),
        },
        { retries: 2 },
      )

      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string }

      if (!res.ok || !body.id) {
        console.error('AssemblyAI start failed', res.status, body.error)
        return {
          id: null,
          error:
            res.status === 429
              ? 'Transcription service is busy, please retry in a moment.'
              : body.error || 'Could not start transcription.',
        }
      }

      return { id: body.id, error: null }
    } catch (err) {
      console.error('startTranscription failed:', err)
      return { id: null, error: err instanceof ProxyError ? err.message : 'Transcription service failed.' }
    }
  })

// Polls an AssemblyAI job. Returns status plus text when finished.
export const getTranscriptionStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    const id = (input?.id ?? '').trim()
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new Error('invalid transcription id')
    return { id }
  })
  .handler(async ({ data, context }) => {
    const { fetchWithRetry, enforceRateLimit, requireEnv, ProxyError } = await import('./ai-proxy.server')

    try {
      enforceRateLimit(`transcribe-poll:${context.userId}`, 300, 60_000)
      const apiKey = requireEnv('ASSEMBLYAI_API_KEY')

      const res = await fetchWithRetry(
        `${ASSEMBLY}/transcript/${data.id}`,
        { headers: { Authorization: apiKey } },
        { retries: 2 },
      )

      const body = (await res.json().catch(() => ({}))) as {
        status?: string
        text?: string
        error?: string
      }

      if (!res.ok) {
        console.error('AssemblyAI poll failed', res.status, body.error)
        return { status: 'error', text: null, error: body.error || 'Could not read transcription status.' }
      }

      return {
        status: body.status ?? 'queued',
        text: body.text ?? null,
        error: body.status === 'error' ? body.error ?? 'Transcription failed.' : null,
      }
    } catch (err) {
      console.error('getTranscriptionStatus failed:', err)
      return {
        status: 'error',
        text: null,
        error: err instanceof ProxyError ? err.message : 'Transcription service failed.',
      }
    }
  })
