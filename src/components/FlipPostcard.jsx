import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { generateMemoirPDF } from '../utils/pdfGenerator'
import { synthesizeSpeech } from '@/lib/tts.functions'
import { regenerateStory } from '@/lib/story.functions'

// Shrink an image down to a compact data URL for the vision model.
const toDataUrl = (src, maxSide = 768) =>
  new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })

// Turns base64 audio returned by the server into a playable blob URL.
function base64ToAudioUrl(base64, mimeType) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mimeType || 'audio/mpeg' }))
}

const STORY_STYLES = [
  // Cinematic: Adam voice, Stability 0.3, Style 0.6
  { id: 'cinematic', label: 'Cinematic Adventure', voiceId: 'pNInz6obpgDQGcFmaJgB', settings: { stability: 0.3, style_exaggeration: 0.6 } },
  // Nostalgia: Bill voice, Stability 0.8, Similarity 0.8
  { id: 'nostalgia', label: 'Vintage Nostalgia', voiceId: 'pqHfZKP75CvOlQylNhV4', settings: { stability: 0.8, similarity_boost: 0.8 } },
  // Holiday Blues: Alice voice, Stability 0.4
  { id: 'blues', label: 'Holiday Blues', voiceId: 'Xb7hH8MSUJpSbSDYk0k2', settings: { stability: 0.4 } },
  // Joyful: Adam voice, Stability 0.3, Style 0.8
  { id: 'joyful', label: 'Joyful', voiceId: 'pNInz6obpgDQGcFmaJgB', settings: { stability: 0.3, style_exaggeration: 0.8 } },
  // Stressful: Adam voice, Stability 0.2, Speed 1.1
  { id: 'stressful', label: 'Stressful', voiceId: 'pNInz6obpgDQGcFmaJgB', settings: { stability: 0.2, speed: 1.1 } },
  // Nat Geo: Bill, Stability 0.7, Similarity 0.9
  { id: 'natgeo', label: 'National Geographic', voiceId: 'pqHfZKP75CvOlQylNhV4', settings: { stability: 0.7, similarity_boost: 0.9 } },
]

const rewriteStory = (originalStory, styleId, city) => {
  const location = city === 'Unknown' ? 'this unknown destination' : city
  
  const stories = {
    // Cinematic: Epic movie trailer starting with "In a world where..."
    cinematic: `In a world where memories come alive, one traveler embarked on an unforgettable journey to ${location}. ${originalStory.replace(/^I /, 'The protagonist ').toLowerCase()} This is not just a story—it's a legend in the making.`,
    
    // Nostalgia: Warm, grainy 1970s diary entry
    nostalgia: `Dear Diary, December 1975. I found myself in ${location}, and the warmth of it all stays with me still. The photos have that golden grain, you know? ${originalStory.replace(/^I /, '')} Those were simpler times. We didn't have all this technology, just pure moments.`,
    
    // Holiday Blues: Melancholic 'end-of-trip' vibe
    blues: `The last day of the trip always comes too soon. As I look back at ${location}, there's that familiar ache—the knowing that I'll have to leave this magic behind. The suitcase is almost packed. The flight is in the morning. ${originalStory.replace(/\./g, '...').replace(/^I /, 'We ').toLowerCase()} Until next time, my friend.`,
    
    // Joyful: High-energy language and exclamation points
    joyful: `OH WOW! What an absolutely incredible adventure we had in ${location}! ${originalStory.replace(/\./g, '!').replace(/^I /, 'I ')} Every single moment was absolutely magical and I cherished every second! Can't wait to go back!`,
    
    // Stressful: heighten the pace without inventing events outside the photos.
    stressful: `Everything felt urgent in ${location}; I rushed through each moment, trying to take it all in. ${originalStory.replace(/^I /, '').replace(/\s+/g, ' ').trim()}`,
    
    // Nat Geo: Sophisticated, scientific observer
    natgeo: `Field observations from ${location}: The subject exhibited signs of profound cultural immersion during the expedition. Notable behavioral patterns include extended periods of contemplation and documented instances of awe. ${originalStory.replace(/^I /, 'The observer ').toLowerCase()} A fascinating specimen of the modern wanderer, adapting to foreign environments with remarkable resilience.`,
  }
  return capStoryLength(stories[styleId] || originalStory)
}

// Regenerated stories must be between 220 and 240 characters. Trim to the
// last complete sentence that fits inside the range; if no sentence works,
// cut at the last word boundary inside the range. If a story is too short,
// pad with a short closing phrase so it never falls below 220.
const capStoryLength = (story) => {
  const MIN = 220
  const MAX = 240
  if (!story) return story

  if (story.length >= MIN && story.length <= MAX) return story

  if (story.length < MIN) {
    const endings = [
      ' A memory to cherish.',
      ' Truly unforgettable.',
      ' What a moment to remember.',
      ' An experience worth keeping.',
    ]
    const base = story.replace(/[.!?\s]+$/, '').trim()
    for (const ending of endings) {
      if (base.length + ending.length >= MIN && base.length + ending.length <= MAX) {
        return base + ending
      }
    }
    return story
  }

  const withinLimit = story.slice(0, MAX)
  let bestSentenceEnd = -1
  for (let i = withinLimit.length - 1; i >= 0; i--) {
    if ('.!?'.includes(withinLimit[i]) && (i === withinLimit.length - 1 || withinLimit[i + 1] === ' ')) {
      const len = i + 1
      if (len >= MIN && len <= MAX) {
        bestSentenceEnd = i
        break
      }
    }
  }
  if (bestSentenceEnd !== -1) {
    return withinLimit.slice(0, bestSentenceEnd + 1).trim()
  }

  for (let i = MAX; i >= MIN; i--) {
    if (withinLimit[i] === ' ') {
      return withinLimit.slice(0, i).replace(/[,.;:!?\s]+$/, '').trim()
    }
  }

  return withinLimit.replace(/[,.;:!?\s]+$/, '').trim()
}

export default function FlipPostcard({ image, narrative: initialNarrative, city = 'Unknown', allImages }) {
  // Ensure allImages is always an array
  const imagesArray = Array.isArray(allImages) ? allImages : []
  const [isFlipped, setIsFlipped] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showBubbles, setShowBubbles] = useState(false)
  const [narrative, setNarrative] = useState(initialNarrative)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [currentVoice, setCurrentVoice] = useState({ voiceId: 'pNInz6obpgDQGcFmaJgB', settings: { stability: 0.2, style_exaggeration: 0.9 } })
  const [savedPosition, setSavedPosition] = useState(0)
  const [currentText, setCurrentText] = useState('')
  const audioRef = useRef(null)

  const stopAudio = () => {
    console.log('Stopping audio...')
    if (audioRef.current) {
      // Save position for ElevenLabs audio
      const currentPos = audioRef.current.currentTime
      setSavedPosition(currentPos)
      audioRef.current.pause()
      audioRef.current = null
    } else {
      // For browser TTS, we can't save position - just stop
      speechSynthesis.cancel()
    }
    setIsPlaying(false)
    setIsLoadingAudio(false)
    console.log('Audio stopped at position:', savedPosition)
  }

  const handleDownload = async () => {
    if (isDownloading) return
    setIsDownloading(true)
    try {
      const imagesToUse = imagesArray.length > 0 ? imagesArray : [image]
      await generateMemoirPDF(imagesToUse, narrative, city)
    } catch (err) {
      console.error('PDF error:', err)
      alert('Failed to generate PDF: ' + err.message)
    }
    setIsDownloading(false)
  }

  const playAudio = async (text = narrative) => {
    // If already playing or loading, stop it
    if (isPlaying || isLoadingAudio) {
      stopAudio()
      return
    }

    // Check if we have a saved position and same text - resume from there
    const textToPlay = savedPosition > 0 && currentText === text ? text : text
    const startPosition = savedPosition > 0 && currentText === text ? savedPosition : 0
    
    setCurrentText(text)
    setSavedPosition(0)
    setIsLoadingAudio(true)
    setIsPlaying(true)
    console.log('Playing with voice:', currentVoice)
    
    try {
      const response = await synthesizeSpeech({
        data: {
          text,
          voiceId: currentVoice.voiceId,
          settings: currentVoice.settings,
        },
      })

      if (response?.audio) {
        const audioUrl = base64ToAudioUrl(response.audio, response.mimeType)
        const audio = new Audio(audioUrl)
        if (startPosition > 0) {
          audio.currentTime = startPosition
          console.log('Resuming from position:', startPosition)
        }
        audioRef.current = audio
        setIsLoadingAudio(false)
        audio.onended = () => { 
          console.log('Audio ended'); 
          audioRef.current = null
          setIsPlaying(false) 
        }
        audio.onerror = (e) => { 
          console.log('Audio error:', e); 
          audioRef.current = null
          setIsPlaying(false) 
        }
        const playPromise = audio.play()
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.log('Play promise error:', err)
            audioRef.current = null
            setIsPlaying(false)
          })
        }
      } else {
        console.log('Voice service unavailable:', response?.error, '- falling back to browser TTS')
        setIsLoadingAudio(false)
        // Fallback to browser TTS with better voice
        speechSynthesis.cancel()
        const voices = speechSynthesis.getVoices()
        // Try to find a good English voice
        const preferredVoice = voices.find(v => 
          v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
        ) || voices.find(v => v.lang.startsWith('en'))
        
        const utterance = new SpeechSynthesisUtterance(text)
        if (preferredVoice) {
          utterance.voice = preferredVoice
          console.log('Using browser voice:', preferredVoice.name)
        }
        utterance.rate = 0.9
        utterance.pitch = 1
        utterance.onend = () => setIsPlaying(false)
        utterance.onerror = () => setIsPlaying(false)
        speechSynthesis.speak(utterance)
      }
    } catch (err) {
      console.warn('ElevenLabs failed:', err, 'using browser TTS')
      setIsLoadingAudio(false)
      speechSynthesis.cancel()
      const voices = speechSynthesis.getVoices()
      const preferredVoice = voices.find(v => 
        v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
      ) || voices.find(v => v.lang.startsWith('en'))
      
      const utterance = new SpeechSynthesisUtterance(text)
      if (preferredVoice) {
        utterance.voice = preferredVoice
      }
      utterance.rate = 0.9
      utterance.onend = () => setIsPlaying(false)
      utterance.onerror = () => setIsPlaying(false)
      speechSynthesis.speak(utterance)
    }
  }

  const handleStyleSelect = async (style) => {
    stopAudio() // Stop any playing audio
    setIsRegenerating(true)
    setCurrentVoice({ voiceId: style.voiceId, settings: style.settings })

    // Ask the vision model to retell the story in the chosen style, grounded
    // in the uploaded photos. Fall back to the local rewrite if it fails.
    let newStory = null
    try {
      const sourceImages = imagesArray.length > 0 ? imagesArray : [image]
      const payload = (await Promise.all(sourceImages.slice(0, 4).map((img) => toDataUrl(img.url)))).filter(Boolean)
      if (payload.length) {
        const result = await regenerateStory({ data: { images: payload, style: style.id } })
        if (result?.narrative) newStory = capStoryLength(result.narrative)
      }
    } catch (err) {
      console.warn('AI style regeneration failed, using local rewrite:', err)
    }
    // A failed vision request must never replace photo-grounded content with
    // invented travel events. The fallback only restyles the original story.
    if (!newStory) newStory = rewriteStory(narrative || initialNarrative, style.id, city)
    newStory = capStoryLength(newStory).slice(0, 240)
    setNarrative(newStory)
    console.log('Style selected:', style.label, 'Voice ID:', style.voiceId, 'Settings:', style.settings)
    setShowBubbles(false)
    
    try {
      // Warm the voice for the new style; playback happens when the user hits Listen.
      await synthesizeSpeech({
        data: { text: newStory, voiceId: style.voiceId, settings: style.settings },
      })
    } catch (err) {
      console.warn('Voice preload failed, browser TTS will be used:', err)
    } finally {
      setIsRegenerating(false)
    }
  }

  const bubbleVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: (i) => ({
      scale: 1,
      opacity: 1,
      transition: {
        delay: i * 0.08,
        type: 'spring',
        stiffness: 300,
        damping: 20,
      },
    }),
    exit: (i) => ({
      scale: 0,
      opacity: 0,
      transition: {
        delay: (5 - i) * 0.08,
        type: 'spring',
        stiffness: 300,
        damping: 20,
      },
    }),
  }

  // Front side - Image with glossy overlay
  const FrontCard = () => (
    <div style={{ width: '600px', height: '400px', position: 'relative', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
      <img 
        src={image.url} 
        alt={image.name}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* Glossy overlay */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%, rgba(255,255,255,0.1) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )

  // Back side - Story with nostalgic layout
  const BackCard = () => (
    <div 
      style={{ 
        width: '600px', 
        height: '400px', 
        background: `
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 400'%3E%3Cdefs%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' stitchTiles='stitch'/%3E%3CfeDiffuseLighting in='noise' lighting-color='white' surfaceScale='3'%3E%3CfeDistantLight azimuth='45' elevation='60'/%3E%3C/feDiffuseLighting%3E%3C/filter%3E%3Cfilter id='brush1'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.015' numOctaves='3' result='turb'/%3E%3CfeDisplacementMap in='SourceGraphic' in2='turb' scale='25' xChannelSelector='R' yChannelSelector='G'/%3E%3C/filter%3E%3Cfilter id='brush2'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.02' numOctaves='4' result='turb'/%3E%3CfeDisplacementMap in='SourceGraphic' in2='turb' scale='20' xChannelSelector='G' yChannelSelector='B'/%3E%3C/filter%3E%3ClinearGradient id='grad1' x1='0%25' y1='0%25' x2='0%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23c1336b;stop-opacity:1'/%3E%3Cstop offset='50%25' style='stop-color:%23c24258;stop-opacity:1'/%3E%3Cstop offset='100%25' style='stop-color:%23ec5144;stop-opacity:1'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='%23c1336b'/%3E%3Cellipse cx='150' cy='80' rx='280' ry='60' fill='%23c24258' filter='url(%23brush1)' opacity='0.7'/%3E%3Cellipse cx='450' cy='120' rx='250' ry='70' fill='%23c1336b' filter='url(%23brush2)' opacity='0.6'/%3E%3Cellipse cx='300' cy='200' rx='320' ry='80' fill='%23c24258' filter='url(%23brush1)' opacity='0.8'/%3E%3Cellipse cx='180' cy='280' rx='260' ry='65' fill='%23ec5144' filter='url(%23brush2)' opacity='0.7'/%3E%3Cellipse cx='420' cy='320' rx='290' ry='75' fill='%23c24258' filter='url(%23brush1)' opacity='0.6'/%3E%3Cellipse cx='300' cy='380' rx='350' ry='60' fill='%23ec5144' filter='url(%23brush2)' opacity='0.8'/%3E%3Crect width='100%25' height='100%25' fill='url(%23grad1)' opacity='0.5'/%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.15'/%3E%3C/svg%3E")
        `,
        backgroundSize: 'cover',
        padding: '24px',
        display: 'flex',
        borderRadius: '4px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Palette knife strokes - horizontal fluid strokes */}
      <svg 

        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', mixBlendMode: 'overlay' }}
        viewBox="0 0 600 400"
      >

        
        {/* Varied horizontal strokes - different lengths, angles, and positions - 3x density */}
        {/* Top section - short angled strokes */}
        <path d="M20,8 Q70,2 120,10" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.3" strokeLinecap="round"/>
        <path d="M150,12 Q210,5 260,15" stroke="#c24258" strokeWidth="62" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M290,6 Q350,0 400,10" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M430,14 Q490,6 550,12" stroke="#ec5144" strokeWidth="66" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M570,8 Q600,4 620,10" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.3" strokeLinecap="round"/>
        
        {/* Upper mid - longer flowing strokes */}
        <path d="M-5,45 Q40,38 100,48 Q160,58 200,44" stroke="#c1336b" strokeWidth="68" fill="none" opacity="0.5" strokeLinecap="round"/>
        <path d="M220,42 Q280,34 340,46 Q400,58 450,40" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M470,38 Q530,30 580,42 Q610,50 630,36" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        {/* More upper mid */}
        <path d="M30,65 Q80,58 140,68" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M170,60 Q230,52 280,64 Q340,76 390,58" stroke="#c1336b" strokeWidth="66" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M420,62 Q480,54 530,66 Q580,78 620,60" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.5" strokeLinecap="round"/>
        
        {/* Mid section - varied lengths */}
        <path d="M10,90 Q60,82 110,94" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M140,86 Q200,78 250,90 Q300,102 350,84" stroke="#c24258" strokeWidth="66" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M380,88 Q440,80 490,92 Q540,104 590,86" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        {/* More mid */}
        <path d="M50,110 Q110,102 160,114" stroke="#c1336b" strokeWidth="68" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M190,106 Q250,98 300,110 Q350,122 400,104" stroke="#ec5144" strokeWidth="62" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M430,108 Q490,100 540,112 Q590,124 630,106" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        
        {/* Center area - overlapping strokes */}
        <path d="M-10,135 Q40,126 100,138 Q160,150 210,134" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M240,130 Q300,122 350,134 Q400,146 450,128" stroke="#c1336b" strokeWidth="66" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M480,132 Q540,124 590,136 Q620,144 640,130" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        {/* More center */}
        <path d="M20,155 Q70,148 130,158" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M160,150 Q220,142 270,154 Q320,166 370,148" stroke="#c24258" strokeWidth="62" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M400,152 Q460,144 510,156 Q560,168 610,150" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.5" strokeLinecap="round"/>
        
        {/* Lower mid - scattered strokes */}
        <path d="M60,178 Q120,170 180,182" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M210,174 Q270,166 320,178 Q370,190 420,172" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M450,176 Q510,168 560,180 Q600,188 630,174" stroke="#c24258" strokeWidth="66" fill="none" opacity="0.34" strokeLinecap="round"/>
        
        {/* More lower mid */}
        <path d="M-5,200 Q50,192 110,204 Q170,216 220,198" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M250,196 Q310,188 360,200 Q410,212 460,194" stroke="#ec5144" strokeWidth="66" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M490,198 Q550,190 600,202 Q620,208 640,196" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.5" strokeLinecap="round"/>
        
        {/* Mid-lower - longer diagonal feel */}
        <path d="M30,222 Q90,214 150,226" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M180,218 Q240,210 290,222 Q340,234 390,216" stroke="#ec5144" strokeWidth="66" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M420,220 Q480,212 530,224 Q580,236 620,218" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        
        {/* More mid-lower */}
        <path d="M10,245 Q70,237 130,249 Q190,261 240,243" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M270,240 Q330,232 380,244 Q430,256 480,238" stroke="#c1336b" strokeWidth="62" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M510,242 Q570,234 610,246 Q630,252 650,240" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        {/* Lower section - varied */}
        <path d="M20,268 Q80,260 140,272" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.5" strokeLinecap="round"/>
        <path d="M170,264 Q230,256 280,268 Q330,280 380,262" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M410,266 Q470,258 520,270 Q570,282 610,264" stroke="#c1336b" strokeWidth="66" fill="none" opacity="0.32" strokeLinecap="round"/>
        
        {/* More lower */}
        <path d="M-5,290 Q50,282 110,294 Q170,306 210,288" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M240,286 Q300,278 350,290 Q400,302 450,284" stroke="#c24258" strokeWidth="66" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M480,288 Q540,280 590,292 Q620,300 640,286" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        
        {/* Near bottom - scattered */}
        <path d="M30,312 Q90,304 150,316" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M180,308 Q240,300 290,312 Q340,324 390,306" stroke="#c24258" strokeWidth="62" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M420,310 Q480,302 530,314 Q580,326 620,308" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        {/* More near bottom */}
        <path d="M10,335 Q70,327 130,339 Q190,351 230,333" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M260,330 Q320,322 370,334 Q420,346 470,328" stroke="#ec5144" strokeWidth="66" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M500,332 Q560,324 600,336 Q620,342 640,330" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        
        {/* Bottom section */}
        <path d="M40,358 Q100,350 160,362" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M190,354 Q250,346 300,358 Q350,370 400,352" stroke="#ec5144" strokeWidth="66" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M430,356 Q490,348 540,360 Q590,372 620,354" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        {/* More bottom */}
        <path d="M-5,380 Q50,372 110,384 Q170,396 200,378" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M230,376 Q290,368 340,380 Q390,392 440,374" stroke="#c1336b" strokeWidth="62" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M470,378 Q530,370 580,382 Q610,390 640,376" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        
        {/* Additional scattered strokes for density */}
        <path d="M55,20 Q95,14 145,22" stroke="#c24258" strokeWidth="64" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M195,28 Q255,20 305,30" stroke="#ec5144" strokeWidth="72" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M355,16 Q415,8 465,18 Q515,28 565,14" stroke="#c1336b" strokeWidth="68" fill="none" opacity="0.5" strokeLinecap="round"/>
        
        <path d="M25,52 Q85,44 135,56" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M165,48 Q225,40 275,52 Q325,64 375,46" stroke="#c24258" strokeWidth="60" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M405,50 Q465,42 515,54 Q565,66 615,48" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        <path d="M15,78 Q75,70 125,82" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M155,74 Q215,66 265,78 Q315,90 365,72" stroke="#ec5144" strokeWidth="64" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M395,76 Q455,68 505,80 Q555,92 605,74" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.5" strokeLinecap="round"/>
        
        <path d="M35,102 Q95,94 145,106" stroke="#c24258" strokeWidth="68" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M175,98 Q235,90 285,102 Q335,114 385,96" stroke="#c1336b" strokeWidth="68" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M415,100 Q475,92 525,104 Q575,116 625,98" stroke="#ec5144" strokeWidth="62" fill="none" opacity="0.34" strokeLinecap="round"/>
        
        <path d="M5,126 Q65,118 115,130" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M145,122 Q205,114 255,126 Q305,138 355,120" stroke="#c24258" strokeWidth="66" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M385,124 Q445,116 495,128 Q545,140 595,122" stroke="#c1336b" strokeWidth="72" fill="none" opacity="0.36" strokeLinecap="round"/>
        
        <path d="M45,150 Q105,142 155,154" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M185,146 Q245,138 295,150 Q345,162 395,144" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.5" strokeLinecap="round"/>
        <path d="M425,148 Q485,140 535,152 Q585,164 635,146" stroke="#c24258" strokeWidth="64" fill="none" opacity="0.32" strokeLinecap="round"/>
        
        <path d="M25,174 Q85,166 135,178" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M165,170 Q225,162 275,174 Q325,186 375,168" stroke="#c1336b" strokeWidth="68" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M405,172 Q465,164 515,176 Q565,188 615,170" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        <path d="M55,198 Q115,190 165,202" stroke="#ec5144" strokeWidth="66" fill="none" opacity="0.5" strokeLinecap="round"/>
        <path d="M195,194 Q255,186 305,198 Q355,210 405,192" stroke="#c24258" strokeWidth="68" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M435,196 Q495,188 545,200 Q595,212 645,194" stroke="#c1336b" strokeWidth="62" fill="none" opacity="0.34" strokeLinecap="round"/>
        
        <path d="M15,224 Q75,216 125,228" stroke="#c1336b" strokeWidth="68" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M155,220 Q215,212 265,224 Q315,236 365,218" stroke="#ec5144" strokeWidth="64" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M395,222 Q455,214 505,226 Q555,238 605,220" stroke="#c24258" strokeWidth="72" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        <path d="M45,250 Q105,242 155,254" stroke="#c24258" strokeWidth="68" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M185,246 Q245,238 295,250 Q345,262 395,244" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M425,248 Q485,240 535,252 Q585,264 635,246" stroke="#ec5144" strokeWidth="66" fill="none" opacity="0.34" strokeLinecap="round"/>
        
        <path d="M5,276 Q65,268 115,280" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M145,272 Q205,264 255,276 Q305,288 355,270" stroke="#c24258" strokeWidth="62" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M385,274 Q445,266 495,278 Q545,290 595,272" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.5" strokeLinecap="round"/>
        
        <path d="M35,302 Q95,294 145,306" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M175,298 Q235,290 285,302 Q335,314 385,296" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M415,300 Q475,292 525,304 Q575,316 625,298" stroke="#c24258" strokeWidth="64" fill="none" opacity="0.34" strokeLinecap="round"/>
        
        <path d="M55,328 Q115,320 165,332" stroke="#c24258" strokeWidth="68" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M195,324 Q255,316 305,328 Q355,340 405,322" stroke="#c1336b" strokeWidth="66" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M435,326 Q495,318 545,330 Q595,342 645,324" stroke="#ec5144" strokeWidth="72" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        <path d="M25,354 Q85,346 135,358" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M165,350 Q225,342 275,354 Q325,366 375,348" stroke="#c24258" strokeWidth="68" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M405,352 Q465,344 515,356 Q565,368 615,350" stroke="#c1336b" strokeWidth="62" fill="none" opacity="0.32" strokeLinecap="round"/>
        
        <path d="M65,385 Q125,377 175,389" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M205,381 Q265,373 315,385 Q365,397 415,379" stroke="#ec5144" strokeWidth="66" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M445,383 Q505,375 555,387 Q605,399 655,381" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.5" strokeLinecap="round"/>
        
        {/* Even more strokes for extra density */}
        <path d="M40,5 Q90,-2 140,8" stroke="#ec5144" strokeWidth="60" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M170,10 Q230,2 280,12" stroke="#c24258" strokeWidth="68" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M310,4 Q370,-4 420,6 Q470,16 520,2" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M550,8 Q600,2 640,10" stroke="#ec5144" strokeWidth="62" fill="none" opacity="0.34" strokeLinecap="round"/>
        
        <path d="M20,32 Q80,24 130,36" stroke="#c1336b" strokeWidth="72" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M160,28 Q220,20 270,32 Q320,44 370,26" stroke="#c24258" strokeWidth="64" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M400,30 Q460,22 510,34 Q560,46 610,28" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        <path d="M50,58 Q110,50 160,62" stroke="#ec5144" strokeWidth="66" fill="none" opacity="0.5" strokeLinecap="round"/>
        <path d="M190,54 Q250,46 300,58 Q350,70 400,52" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M430,56 Q490,48 540,60 Q590,72 640,54" stroke="#c24258" strokeWidth="62" fill="none" opacity="0.32" strokeLinecap="round"/>
        
        <path d="M10,84 Q70,76 120,88" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M150,80 Q210,72 260,84 Q310,96 360,78" stroke="#ec5144" strokeWidth="66" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M390,82 Q450,74 500,86 Q550,98 600,80" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.5" strokeLinecap="round"/>
        
        <path d="M60,112 Q120,104 170,116" stroke="#c1336b" strokeWidth="64" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M200,108 Q260,100 310,112 Q360,124 410,106" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M440,110 Q500,102 550,114 Q600,126 650,108" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.36" strokeLinecap="round"/>
        
        <path d="M30,138 Q90,130 140,142" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M170,134 Q230,126 280,138 Q330,150 380,132" stroke="#c1336b" strokeWidth="62" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M410,136 Q470,128 520,140 Q570,152 620,134" stroke="#c24258" strokeWidth="72" fill="none" opacity="0.5" strokeLinecap="round"/>
        
        <path d="M70,164 Q130,156 180,168" stroke="#c24258" strokeWidth="66" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M210,160 Q270,152 320,164 Q370,176 420,158" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M450,162 Q510,154 560,166 Q610,178 660,160" stroke="#c1336b" strokeWidth="64" fill="none" opacity="0.34" strokeLinecap="round"/>
        
        <path d="M40,190 Q100,182 150,194" stroke="#c1336b" strokeWidth="68" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M180,186 Q240,178 290,190 Q340,202 390,184" stroke="#c24258" strokeWidth="66" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M420,188 Q480,180 530,192 Q580,204 630,186" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.5" strokeLinecap="round"/>
        
        <path d="M5,216 Q65,208 115,220" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M155,212 Q215,204 265,216 Q315,228 365,210" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M395,214 Q455,206 505,218 Q555,230 605,212" stroke="#c24258" strokeWidth="62" fill="none" opacity="0.32" strokeLinecap="round"/>
        
        <path d="M55,242 Q115,234 165,246" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M195,238 Q255,230 305,242 Q355,254 405,236" stroke="#ec5144" strokeWidth="64" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M435,240 Q495,232 545,244 Q595,256 645,238" stroke="#c1336b" strokeWidth="72" fill="none" opacity="0.5" strokeLinecap="round"/>
        
        <path d="M25,268 Q85,260 135,272" stroke="#c1336b" strokeWidth="66" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M165,264 Q225,256 275,268 Q325,280 375,262" stroke="#c24258" strokeWidth="68" fill="none" opacity="0.32" strokeLinecap="round"/>
        <path d="M405,266 Q465,258 515,270 Q565,282 615,264" stroke="#ec5144" strokeWidth="62" fill="none" opacity="0.34" strokeLinecap="round"/>
        
        <path d="M65,294 Q125,286 175,298" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M205,290 Q265,282 315,294 Q365,306 415,288" stroke="#c1336b" strokeWidth="66" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M445,292 Q505,284 555,296 Q605,308 655,290" stroke="#c24258" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        <path d="M35,320 Q95,312 145,324" stroke="#c24258" strokeWidth="64" fill="none" opacity="0.5" strokeLinecap="round"/>
        <path d="M175,316 Q235,308 285,320 Q335,332 385,314" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M415,318 Q475,310 525,322 Q575,334 625,316" stroke="#c1336b" strokeWidth="68" fill="none" opacity="0.36" strokeLinecap="round"/>
        
        <path d="M75,346 Q135,338 185,350" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M215,342 Q275,334 325,346 Q375,358 425,340" stroke="#c24258" strokeWidth="62" fill="none" opacity="0.34" strokeLinecap="round"/>
        <path d="M455,344 Q515,336 565,348 Q615,360 665,342" stroke="#ec5144" strokeWidth="70" fill="none" opacity="0.42" strokeLinecap="round"/>
        
        <path d="M45,372 Q105,364 155,376" stroke="#ec5144" strokeWidth="66" fill="none" opacity="0.42" strokeLinecap="round"/>
        <path d="M185,368 Q245,360 295,372 Q345,384 395,366" stroke="#c1336b" strokeWidth="70" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M425,370 Q485,362 535,374 Q585,386 635,368" stroke="#c24258" strokeWidth="64" fill="none" opacity="0.36" strokeLinecap="round"/>
        
        <path d="M15,398 Q75,390 125,402" stroke="#c24258" strokeWidth="72" fill="none" opacity="0.36" strokeLinecap="round"/>
        <path d="M155,394 Q215,386 265,398 Q315,410 365,392" stroke="#ec5144" strokeWidth="68" fill="none" opacity="0.5" strokeLinecap="round"/>
        <path d="M395,396 Q455,388 505,400 Q555,412 605,394" stroke="#c1336b" strokeWidth="68" fill="none" opacity="0.42" strokeLinecap="round"/>
      </svg>

      {/* Left 70% - Narrative */}
      <div style={{ flex: 7, paddingRight: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <p style={{ fontFamily: '"Caveat", cursive', fontSize: '1.5rem', color: '#FFFFFF', lineHeight: '1.7', maxHeight: '260px', overflow: 'hidden', textAlign: 'left', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
          {(() => {
            if (narrative.length <= 350) return narrative
            const truncated = narrative.slice(0, 350)
            const lastPeriod = truncated.lastIndexOf('.')
            const lastExclaim = truncated.lastIndexOf('!')
            const lastQuestion = truncated.lastIndexOf('?')
            const lastPunctuation = Math.max(lastPeriod, lastExclaim, lastQuestion)
            return lastPunctuation > 200 ? narrative.slice(0, lastPunctuation + 1) + '...' : truncated + '...'
          })()}
        </p>
        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); playAudio() }}
            disabled={isRegenerating || isLoadingAudio}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer hover-ltr text-white"
            style={{ backgroundColor: isPlaying ? '#b45309' : '#7c3aed' }}
          >
            {isPlaying ? 'Stop' : 'Listen'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleDownload()
            }}
            disabled={isDownloading}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer hover-ltr text-white"
            style={{ backgroundColor: isDownloading ? '#047857' : '#059669' }}
          >
            {isDownloading ? 'Generating...' : 'Download Memoir'}
          </button>
        </div>
      </div>

      {/* Dividing Line */}
      <div style={{ width: '3px', background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.5) 20%, rgba(255,255,255,0.5) 80%, transparent)', marginRight: '8px' }} />

      {/* Right 30% - Stamp & Address */}
      <div style={{ flex: 3, paddingLeft: '16px', display: 'flex', flexDirection: 'column' }}>
        {/* Stamp area with decorative frame */}
        <div 
          style={{
            width: '80px',
            height: '100px',
            border: '3px double rgba(255,255,255,0.6)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            backgroundColor: 'rgba(255,255,255,0.15)',
            boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>✉️</div>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', fontFamily: '"Caveat", cursive' }}>Stamp</span>
          </div>
        </div>

        {/* Address lines with envelope hint */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '12px' }}>
          <div style={{ height: '2px', background: 'rgba(255,255,255,0.5)', marginBottom: '24px' }} />
          <div style={{ height: '2px', background: 'rgba(255,255,255,0.5)', marginBottom: '24px' }} />
          <div style={{ height: '2px', background: 'rgba(255,255,255,0.5)', marginBottom: '24px' }} />
          <div style={{ height: '2px', background: 'rgba(255,255,255,0.5)' }} />
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '40px' }}>
      <div style={{ cursor: 'pointer', perspective: '1000px' }}>
        <motion.div
          style={{ 
            width: '600px', 
            height: '400px', 
            position: 'relative',
            transformStyle: 'preserve-3d'
          }}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          onClick={() => setIsFlipped(!isFlipped)}
        >
          <div style={{ 
            position: 'absolute', 
            width: '100%', 
            height: '100%', 
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden'
          }}>
            <FrontCard />
          </div>
          <div style={{ 
            position: 'absolute', 
            width: '100%', 
            height: '100%', 
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)'
          }}>
            <BackCard />
          </div>
        </motion.div>
      </div>

      {/* Regenerate Button */}
      <div className="mt-32 flex flex-col items-center">
        <button
          onClick={() => setShowBubbles(!showBubbles)}
          disabled={isRegenerating}
          className="px-8 py-3 rounded-xl text-lg font-semibold text-white cursor-pointer hover-ltr flex flex-col items-center"
          style={{ backgroundColor: 'black', width: '320px' }}
        >
          <span className="relative z-10">{isRegenerating ? 'Regenerating...' : 'Regenerate Story'}</span>
          <span className="relative z-10 text-sm mt-1" style={{ color: '#c0bec6' }}>Regenerate your story to explore a new tone, style, or perspective—same memories, completely new storytelling.</span>
        </button>
      </div>

      {/* Style Bubbles */}
      <AnimatePresence>
        {showBubbles && (
          <motion.div 
            style={{ 
              display: 'flex', 
              alignItems: 'flex-end', 
              justifyContent: 'center', 
              gap: '32px', 
              marginTop: '72px' 
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.25 }}
          >
            {STORY_STYLES.map((style, i) => (
              <motion.button
                key={style.id}
                custom={i}
                variants={bubbleVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                onClick={() => handleStyleSelect(style)}
                style={{
                  width: '92px',
                  height: '92px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontSize: '14px',
                  fontWeight: '500',
                  padding: '8px',
                  lineHeight: '1.2',
                  background: 'linear-gradient(135deg, #c1336b, #ec5144)',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                {style.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}