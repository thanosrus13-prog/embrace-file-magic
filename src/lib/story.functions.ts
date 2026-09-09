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
                  'You write short first-person postcard memories about a set of photos from one trip. You are given several numbered photos and you MUST weave details from EVERY photo into the story — do not describe only the first one. Base the story ONLY on what is visibly in the photos: the places, objects, weather, people, colours, activities and mood. Name concrete details you can actually see in each photo. Never invent a famous landmark or city that is not clearly visible. Write 2-4 warm, vivid sentences in past tense, no hashtags, no emoji, no preamble. The story must be between 220 and 240 characters long.',
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Here are ${data.images.length} photos from the trip. Write one postcard story between 220 and 240 characters that mentions something visible from EVERY photo (photo 1 through photo ${data.images.length}), not just the first. Then, on a final separate line, write "PLACE: " followed by the specific place or city if you can clearly identify it from the photos, otherwise "PLACE: Unknown".`,
                  },
                  ...data.images.flatMap((url, i) => [
                    { type: 'text', text: `Photo ${i + 1}:` },
                    { type: 'image_url', image_url: { url } },
                  ]),
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
      let narrative = raw.replace(/PLACE:\s*.+\s*$/i, '').trim()

      // Enforce the 220–240 character target. If the model missed the range,
      // try once more with an explicit correction before giving up.
      if (narrative.length < 220 || narrative.length > 240) {
        const currentLength = narrative.length
        const retryRes = await fetchWithRetry(
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
                    'You write short first-person postcard memories about a set of photos from one trip. Base the story ONLY on what is visibly in the photos. The story must be between 220 and 240 characters long.',
                },
                {
                  role: 'user',
                  content: `Here are ${data.images.length} photos from the trip. Write one postcard story between 220 and 240 characters that mentions something visible from every photo. Then on a final separate line write "PLACE: " followed by the specific place or city, or "PLACE: Unknown".`,
                },
                ...data.images.flatMap((url, i) => [
                  { type: 'text', text: `Photo ${i + 1}:` },
                  { type: 'image_url', image_url: { url } },
                ]),
                {
                  role: 'user',
                  content: `Your previous story was ${currentLength} characters. Please rewrite it to be between 220 and 240 characters. Keep the same warm, first-person past-tense style and reference details from every photo.`,
                },
              ],
            }),
          },
          { retries: 1, timeoutMs: 60_000 },
        )

        if (retryRes.ok) {
          const retryJson = (await retryRes.json()) as {
            choices?: Array<{ message?: { content?: string } }>
          }
          const retryRaw = retryJson.choices?.[0]?.message?.content?.trim() ?? ''
          if (retryRaw) {
            const retryMatch = retryRaw.match(/PLACE:\s*(.+)\s*$/i)
            const retryCity = retryMatch?.[1]?.trim() || city
            const retryNarrative = retryRaw.replace(/PLACE:\s*.+\s*$/i, '').trim()
            if (retryNarrative.length >= 220 && retryNarrative.length <= 240) {
              return { narrative: retryNarrative, city: retryCity || 'Unknown', error: null }
            }
            // If the retry still missed, fall back to the closest valid length.
            narrative = retryNarrative
          }
        }
      }

      // If the story is over 240 characters, trim it back to the end of the
      // last complete sentence that fits within the limit (no mid-sentence cuts).
      if (narrative.length > 240) {
        const withinLimit = narrative.slice(0, 240)
        const lastSentenceEnd = Math.max(
          withinLimit.lastIndexOf('. '),
          withinLimit.lastIndexOf('! '),
          withinLimit.lastIndexOf('? '),
          narrative.endsWith('.') && narrative.length <= 240 ? narrative.length - 1 : -1
        )
        if (lastSentenceEnd > 0) {
          narrative = withinLimit.slice(0, lastSentenceEnd + 1).trim()
        }
      }
      if (narrative.length < 220) {
        return {
          narrative: null,
          city: null,
          error: 'The generated story was too short. Please try again or upload clearer photos.',
        }
      }

      return { narrative, city: city || 'Unknown', error: null }
    } catch (err) {
      const message = err instanceof ProxyError ? err.message : 'Story generation failed.'
      console.error('generateStory failed:', err)
      return { narrative: null, city: null, error: message }
    }
  })
