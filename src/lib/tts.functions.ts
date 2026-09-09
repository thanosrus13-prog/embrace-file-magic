import { createServerFn } from '@tanstack/react-start'

// Text-to-speech proxy: the ElevenLabs key stays on the server.
export const synthesizeSpeech = createServerFn({ method: 'POST' })
  .inputValidator((input: { text: string; voiceId: string; settings?: Record<string, unknown> }) => {
    const text = (input?.text ?? '').trim()
    if (!text) throw new Error('text is required')
    if (text.length > 3000) throw new Error('text is too long (max 3000 characters)')
    const voiceId = (input?.voiceId ?? '').trim()
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(voiceId)) throw new Error('invalid voiceId')
    return { text, voiceId, settings: input.settings ?? {} }
  })
  .handler(async ({ data }) => {
    const { fetchWithRetry, enforceRateLimit, requireEnv, ProxyError } = await import('./ai-proxy.server')
    const { getRequestIP } = await import('@tanstack/react-start/server')

    try {
      const caller = getRequestIP({ xForwardedFor: true }) ?? 'anonymous'
      enforceRateLimit(`tts:${caller}`, 20, 60_000)

      const apiKey = requireEnv('ELEVENLABS_API_KEY')

      const res = await fetchWithRetry(
        `https://api.elevenlabs.io/v1/text-to-speech/${data.voiceId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
          body: JSON.stringify({
            text: data.text,
            model_id: 'eleven_flash_v2_5',
            voice_settings: data.settings,
          }),
        },
        { retries: 2, timeoutMs: 45_000 },
      )

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        console.error('ElevenLabs error', res.status, detail.slice(0, 300))
        return {
          audio: null,
          error: res.status === 429 ? 'Voice service is busy, please retry shortly.' : 'Voice service unavailable.',
        }
      }

      const buffer = await res.arrayBuffer()
      // Server functions return serializable data, so hand back base64 audio.
      let binary = ''
      const bytes = new Uint8Array(buffer)
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      }
      return { audio: btoa(binary), mimeType: 'audio/mpeg', error: null }
    } catch (err) {
      const message = err instanceof ProxyError ? err.message : 'Voice service failed.'
      console.error('synthesizeSpeech failed:', err)
      return { audio: null, error: message }
    }
  })
