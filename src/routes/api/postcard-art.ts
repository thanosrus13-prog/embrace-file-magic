import { createFileRoute } from '@tanstack/react-router'

type Body = { images?: string[]; narrative?: string }

const STYLE =
  'Repaint these photos as ONE animated-film style illustration (bold outlines, warm light, rich colours). ' +
  'Take something from each photo. No text, no borders, no collage. Landscape postcard image.'

export const Route = createFileRoute('/api/postcard-art')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env['LOVABLE_API_KEY']
        if (!key) return new Response(JSON.stringify({ error: 'Missing API key' }), { status: 500 })

        const body = (await request.json()) as Body
        const images = (Array.isArray(body.images) ? body.images : [])
          .filter((img) => typeof img === 'string' && img.startsWith('data:image/'))
          .slice(0, 4)
        if (!images.length) {
          return new Response(JSON.stringify({ error: 'At least one image is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const narrative = typeof body.narrative === 'string' ? body.narrative.slice(0, 500) : ''
        const content = [
          {
            type: 'text',
            text: `${STYLE}${narrative ? ` The scene should also match this memory: "${narrative}"` : ''}`,
          },
          ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ]

        const upstream = await fetch('https://ai.gateway.lovable.dev/v1/images/generations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-3-pro-image',
            messages: [{ role: 'user', content }],
            modalities: ['image', 'text'],
          }),
        })

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => '')
          console.error('postcard-art upstream error', upstream.status, text.slice(0, 300))
          const message =
            upstream.status === 429
              ? 'Artwork service is busy, please retry shortly.'
              : upstream.status === 402
                ? 'AI credits are exhausted, so the illustrated front is unavailable.'
                : 'Artwork service unavailable.'
          return new Response(JSON.stringify({ error: message }), {
            status: upstream.status,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const json = (await upstream.json()) as { data?: Array<{ b64_json?: string }> }
        const b64 = json.data?.[0]?.b64_json
        if (!b64) {
          return new Response(JSON.stringify({ error: 'No artwork was generated.' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ image: `data:image/png;base64,${b64}` }), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
