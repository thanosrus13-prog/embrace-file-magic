import { createServerFn } from '@tanstack/react-start'

type StoryInput = { images: string[]; style?: string }
type StoryResult = { narrative: string | null; city: string | null; error: string | null }

// Tone directions for the "Regenerate Story" styles. The story content must
// always come from the photos; the style only changes HOW it is told.
const STYLE_PROMPTS: Record<string, string> = {
  cinematic:
    'Tell it like an epic movie-trailer voiceover: dramatic, sweeping, larger-than-life — but every detail must come from what is visible in the photos.',
  nostalgia:
    'Tell it like a warm, grainy 1970s diary entry: gentle, wistful, fondly remembering the exact moments visible in the photos.',
  blues:
    'Tell it with melancholic end-of-trip blues: the sadness of leaving, looking back at the places and moments visible in the photos before the flight home.',
  joyful:
    'Tell it with pure joy and high energy: excited, delighted, exclaiming about the specific things visible in the photos.',
  stressful:
    'Tell it as a chaotic, stressful travel misadventure: the trip visible in the photos retold as frantic, rushed and nerve-wracking, while still describing what is actually in the photos.',
  natgeo:
    'Tell it like a sophisticated National Geographic field note: an observant, documentary tone describing the scenes, environment and subjects visible in the photos.',
}

const BASE_RULES =
  'The photos are the source of truth. Base every event and detail ONLY on what is visibly present: places, objects, weather, people, colours, activities and mood. Mention at least one concrete visible detail from EACH numbered photo. Style may change the emotional wording, but must NEVER add events such as delays, missed flights, lost bags, rain or other trouble unless they are visibly supported by a photo. Never invent a landmark or city. Write in past tense, first person, with no hashtags, emoji or preamble. The story text MUST contain at most 240 JavaScript characters.'

function validateImages(input: StoryInput) {
  const images = Array.isArray(input?.images) ? input.images : []
  if (!images.length) throw new Error('At least one image is required')
  if (images.length > 4) throw new Error('Too many images (max 4)')
  for (const img of images) {
    if (typeof img !== 'string' || !img.startsWith('data:image/')) {
      throw new Error('Images must be data URLs')
    }
    if (img.length > 1_500_000) throw new Error('Image is too large')
  }
  return images
}

// Guarantees the story never exceeds 240 characters: trim to the last
// complete sentence that fits, else the last word boundary (never mid-word,
// never an ellipsis).
function capAt240(narrative: string): string {
  const clean = narrative.replace(/\s+/g, ' ').trim()
  if (clean.length <= 240) return clean
  const withinLimit = clean.slice(0, 240)
  const lastSentenceEnd = Math.max(
    withinLimit.lastIndexOf('. '),
    withinLimit.lastIndexOf('! '),
    withinLimit.lastIndexOf('? ')
  )
  if (lastSentenceEnd >= 120) {
    return withinLimit.slice(0, lastSentenceEnd + 1).trim()
  }
  const lastSpace = withinLimit.lastIndexOf(' ')
  return (lastSpace > 0 ? withinLimit.slice(0, lastSpace) : withinLimit)
    .replace(/[,.;:!?\s]+$/, '')
    .trim()
}

async function writeStoryFromPhotos(
  images: string[],
  styleId: string | undefined
): Promise<StoryResult> {
  const { fetchWithRetry, requireEnv } = await import('./ai-proxy.server')
  const apiKey = requireEnv('LOVABLE_API_KEY')

  const styleRule = styleId && STYLE_PROMPTS[styleId] ? STYLE_PROMPTS[styleId] : null
  const systemPrompt = styleRule
    ? `You write short postcard memories about a set of photos from one trip. ${styleRule} ${BASE_RULES} Describe the numbered photos in order so every uploaded photo affects the result. Photo evidence is more important than style.`
    : `You write short first-person postcard memories about a set of photos from one trip. Describe the numbered photos in order so every uploaded photo affects the result. Write warm, vivid sentences. ${BASE_RULES}`

  const userText = styleRule
    ? `Inspect all ${images.length} numbered photos. Write one story of 220–240 characters total in the requested tone. Include a specific visible detail from every photo and invent nothing. The style changes only the emotion, never the facts. Then add a separate PLACE line.`
    : `Inspect all ${images.length} numbered photos. Write one story of 220–240 characters total. Include a specific visible detail from every photo and invent nothing. Then add a separate PLACE line.`

  const buildMessages = (correction?: string) => [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userText },
        ...images.flatMap((url, i) => [
          { type: 'text', text: `Photo ${i + 1}:` },
          { type: 'image_url', image_url: { url } },
        ]),
      ],
    },
    ...(correction ? [{ role: 'user', content: correction }] : []),
  ]

  const callModel = async (correction?: string, retries = 2) => {
    const res = await fetchWithRetry(
      'https://ai.gateway.lovable.dev/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'google/gemini-3.8-flash', messages: buildMessages(correction) }),
      },
      { retries, timeoutMs: 60_000 }
    )
    if (!res.ok) return { status: res.status, narrative: null as string | null, city: null as string | null }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = json.choices?.[0]?.message?.content?.trim() ?? ''
    const match = raw.match(/PLACE:\s*(.+)\s*$/i)
    return {
      status: res.status,
      narrative: raw.replace(/PLACE:\s*.+\s*$/i, '').trim() || null,
      city: match?.[1]?.trim() || null,
    }
  }

  const first = await callModel()
  if (first.narrative === null && first.status !== 200) {
    console.error('Story generation error', first.status)
    return {
      narrative: null,
      city: null,
      error:
        first.status === 429
          ? 'Story service is busy, please retry shortly.'
          : first.status === 402
            ? 'AI credits are exhausted. Please top up to keep generating stories.'
            : 'Story service unavailable.',
    }
  }
  if (!first.narrative) return { narrative: null, city: null, error: 'No story was generated.' }

  let narrative = first.narrative
  const city = first.city || 'Unknown'

  // If the model missed the 220–240 range, retry once with an explicit correction.
  if (narrative.length < 220 || narrative.length > 240) {
    const retry = await callModel(
      `Your previous story was ${narrative.length} characters. Please rewrite it to be between 220 and 240 characters, keeping the same style and grounding it in details visible in every photo.`,
      1
    )
    if (retry.narrative) {
      if (retry.narrative.length >= 220 && retry.narrative.length <= 240) {
        return { narrative: retry.narrative, city: retry.city || city, error: null }
      }
      narrative = retry.narrative
    }
  }

  narrative = capAt240(narrative)
  if (narrative.length < 220) {
    return {
      narrative: null,
      city: null,
      error: 'The generated story was too short. Please try again or upload clearer photos.',
    }
  }

  return { narrative, city, error: null }
}

// Generates a first-person postcard narrative that is grounded in what the
// uploaded photos actually show (vision model via the Lovable AI gateway).
export const generateStory = createServerFn({ method: 'POST' })
  .inputValidator((input: StoryInput) => ({ images: validateImages(input) }))
  .handler(async ({ data }) => {
    const { enforceRateLimit, ProxyError } = await import('./ai-proxy.server')
    const { getRequestIP } = await import('@tanstack/react-start/server')
    try {
      const caller = getRequestIP({ xForwardedFor: true }) ?? 'anonymous'
      enforceRateLimit(`story:${caller}`, 15, 60_000)
      return await writeStoryFromPhotos(data.images, undefined)
    } catch (err) {
      const message = err instanceof ProxyError ? err.message : 'Story generation failed.'
      console.error('generateStory failed:', err)
      return { narrative: null, city: null, error: message }
    }
  })

// Regenerates the story in a chosen style (cinematic, nostalgia, blues,
// joyful, stressful, natgeo) while staying heavily grounded in the photos.
export const regenerateStory = createServerFn({ method: 'POST' })
  .inputValidator((input: StoryInput) => ({
    images: validateImages(input),
    style: typeof input?.style === 'string' ? input.style : '',
  }))
  .handler(async ({ data }) => {
    const { enforceRateLimit, ProxyError } = await import('./ai-proxy.server')
    const { getRequestIP } = await import('@tanstack/react-start/server')
    try {
      const caller = getRequestIP({ xForwardedFor: true }) ?? 'anonymous'
      enforceRateLimit(`story:${caller}`, 15, 60_000)
      return await writeStoryFromPhotos(data.images, data.style)
    } catch (err) {
      const message = err instanceof ProxyError ? err.message : 'Story generation failed.'
      console.error('regenerateStory failed:', err)
      return { narrative: null, city: null, error: message }
    }
  })
