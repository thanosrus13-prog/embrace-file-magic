import { createServerFn } from '@tanstack/react-start'

type StoryInput = { images: string[] }

// Generates a first-person postcard narrative that is grounded in what the
// uploaded photos actually show (vision model via the Lovable AI gateway).
export const generateStory = createServerFn({ method: 'POST' })
  .inputValidator((input: StoryInput) => {
    const images = Array.isArray(input?.images) ? input.images : []
    if (!images.length) throw new Error('At least one image is required')
    if (images.length > 6) throw new Error('Too many images (max 6)')
    for (const img of images) {
      if (typeof img !== 'string' || !img.startsWith('data:image/')) {
        throw new Error('Images must be data URLs')
      }
      if (img.length > 1_500_000) throw new Error('Image is too large')
    }
    return { images }
  })
  .handler(async ({ data }) => {
    const { fetchWithRetry, enforceRateLimit, requireEnv, ProxyError } = await import('./ai-proxy.server')
    const { getRequestIP } = await import('@tanstack/react-start/server')

    try {
      const caller = getRequestIP({ xForwardedFor: true }) ?? 'anonymous'
      enforceRateLimit(`story:${caller}`, 15, 60_000)

      const apiKey = requireEnv('LOVABLE_API_KEY')

      const res = await fetchWithRetry(
        'https://ai.gateway.lovable.dev/v1/chat/completions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content:
                  'You write short first-person postcard memories. Base the story ONLY on what is visibly in the photos: the place, objects, weather, people, colours, activity and mood. Name concrete details you can actually see. Never invent a famous landmark or city that is not clearly visible. Write 4-6 warm, vivid sentences in past tense, no hashtags, no emoji, no preamble.',
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text:
                      'Write the postcard story for these photos. Then, on a final separate line, write "PLACE: " followed by the specific place or city if you can clearly identify it from the photos, otherwise "PLACE: Unknown".',
                  },
                  ...data.images.map((url) => ({ type: 'image_url', image_url: { url } })),
                ],
              },
            ],
          }),
        },
        { retries: 2, timeoutMs: 60_000 },
      )

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        console.error('Story generation error', res.status, detail.slice(0, 300))
        return {
          narrative: null,
          city: null,
          error:
            res.status === 429
              ? 'Story service is busy, please retry shortly.'
              : res.status === 402
                ? 'AI credits are exhausted. Please top up to keep generating stories.'
                : 'Story service unavailable.',
        }
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const raw = json.choices?.[0]?.message?.content?.trim() ?? ''
      if (!raw) return { narrative: null, city: null, error: 'No story was generated.' }

      const match = raw.match(/PLACE:\s*(.+)\s*$/i)
      const city = match?.[1]?.trim() || 'Unknown'
      const narrative = raw.replace(/PLACE:\s*.+\s*$/i, '').trim()

      return { narrative, city: city || 'Unknown', error: null }
    } catch (err) {
      const message = err instanceof ProxyError ? err.message : 'Story generation failed.'
      console.error('generateStory failed:', err)
      return { narrative: null, city: null, error: message }
    }
  })
