import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import FlipPostcard from '../components/FlipPostcard'
import { useSession } from '@/hooks/useSession'
import { generateStory } from '@/lib/story.functions'

function NavButton({ href, children, reload, onClick }) {
  return (
    <button
      data-href={onClick ? undefined : href}
      data-reload={reload ? '' : undefined}
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-white text-sm font-medium hover-ltr transition-all duration-200 active:scale-95 active:opacity-80"
      style={{ backgroundColor: 'rgba(15, 15, 15, 0.35)' }}
    >
      <span className="relative z-10">{children}</span>
    </button>
  )
}

function FAQItem({ question, answer }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="bg-black rounded-xl overflow-hidden hover-ltr" style={{ backgroundColor: 'black' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover-ltr"
      >
        <span className="text-white font-semibold text-left" style={{ color: '#ffffff' }}>{question}</span>
        <span className="text-[#29b19f] text-xl font-bold ml-4 w-6 text-center">
          <span style={{ color: '#ffffff' }}>{isOpen ? '−' : '+'}</span>
        </span>
      </button>
      <div 
        className="grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', opacity: isOpen ? 1 : 0 }}
      >
        <div className="overflow-hidden">
        <div className="px-4 pb-5 pt-3">
          <p className="text-sm" style={{ color: '#c0bec6' }}>{answer}</p>
        </div>
      </div>
      </div>
    </div>
  )
}

function App() {
  const navigate = useNavigate()
  const { user } = useSession()
  const [images, setImages] = useState([])
  const [rendered, setRendered] = useState([])
  const [dragging, setDragging] = useState(false)
  const [scrollRotation, setScrollRotation] = useState(0)
  const [busy, setBusy] = useState(false)
  const [storyError, setStoryError] = useState('')
  const inputRef = useRef(null)

  // Track scroll rotation (throttled)
  useEffect(() => {
    let lastScrollY = window.scrollY
    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const currentScrollY = window.scrollY
          const delta = currentScrollY - lastScrollY
          setScrollRotation(prev => prev + delta * 0.5)
          lastScrollY = currentScrollY
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const addFiles = (files) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (!imageFiles.length) return
    const newImages = imageFiles.map((file) => ({
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      url: URL.createObjectURL(file),
      name: file.name,
    }))
    setImages((prev) => [...prev, ...newImages])
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [])

  const onDragOver = (e) => {
    e.preventDefault()
    setDragging(true)
  }

  const onDragLeave = () => setDragging(false)

  const onFileInput = (e) => addFiles(e.target.files)

  const removeImage = (id) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id)
      if (img) URL.revokeObjectURL(img.url)
      return prev.filter((i) => i.id !== id)
    })
  }

  const processImages = async () => {
    // Landmark detection from filename hints
    const detectLandmark = (filename) => {
      const name = filename.toLowerCase()
      const landmarks = [
        { keywords: ['eiffel', 'paris'], city: 'Paris', narrative: "I stood beneath the Eiffel Tower, watching the iron lattice reach for the sky. Paris felt alive around me." },
        { keywords: ['tower', 'london'], city: 'London', narrative: "Big Ben's chimes echoed across Westminster as the Thames slipped quietly by. London felt timeless." },
        { keywords: ['colosseum', 'rome', 'italy'], city: 'Rome', narrative: "The Colosseum rose before me like a giant from another age. Rome's history hummed in every stone." },
        { keywords: ['statue', 'liberty', 'new york', 'nyc'], city: 'New York', narrative: "Lady Liberty held her torch high as the ferry carried me toward her. New York felt impossibly grand." },
        { keywords: ['bridge', 'san francisco', 'golden gate'], city: 'San Francisco', narrative: "The Golden Gate Bridge burned orange through the fog. San Francisco's breeze carried adventure." },
        { keywords: ['pyramid', 'egypt', 'cairo'], city: 'Cairo', narrative: "The pyramids stood silent against the desert heat. I felt tiny beside their ancient weight." },
        { keywords: ['beach', 'hawaii', 'maui', 'waikiki'], city: 'Hawaii', narrative: "Palm trees swayed over endless blue water. Hawaii wrapped me in warm, salty air." },
        { keywords: ['tokyo', 'japan', 'shibuya'], city: 'Tokyo', narrative: "Neon lights and quiet respect filled the streets of Tokyo. The city pulsed with electric energy." },
        { keywords: ['sydney', 'opera'], city: 'Sydney', narrative: "The Sydney Opera House's white sails caught the sun. The harbor felt calm and bright." },
        { keywords: ['barcelona', 'sagrada'], city: 'Barcelona', narrative: "Gaudi's Sagrada Familia rose like a stone forest around me. Barcelona was pure art." },
        { keywords: ['venice', 'italy', 'canal'], city: 'Venice', narrative: "I drifted through Venice's canals, where old buildings leaned over the water. Magic moved slowly here." },
        { keywords: ['amsterdam', 'netherlands', 'canal'], city: 'Amsterdam', narrative: "Amsterdam's canals wound past bicycles and café terraces. The city felt easy and open." },
        { keywords: ['berlin', 'wall'], city: 'Berlin', narrative: "I walked where the Wall once stood, now covered in colour. Berlin breathed freedom." },
        { keywords: ['prague', 'czech'], city: 'Prague', narrative: "Gothic spires pierced the twilight over Prague. The Charles Bridge felt like a fairy tale." },
        { keywords: ['dubai', 'burj'], city: 'Dubai', narrative: "The Burj Khalifa scraped the clouds above Dubai. Ambition glittered in every direction." },
      ]
      
      for (const landmark of landmarks) {
        if (landmark.keywords.some(k => name.includes(k))) {
          return { city: landmark.city, narrative: landmark.narrative }
        }
      }
      return null
    }

    // Combine all images into one
    const combineImages = async () => {
      if (images.length === 1) {
        return images[0].url
      }

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      // Calculate grid dimensions
      const cols = images.length === 2 ? 2 : 2
      const rows = images.length <= 2 ? 1 : Math.ceil(images.length / 2)
      
      const imgWidth = 600
      const imgHeight = 400
      canvas.width = imgWidth * cols
      canvas.height = imgHeight * rows
      
      ctx.fillStyle = '#1f1c1f'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // Load and draw all images
      const loadImage = (src) => {
        return new Promise((resolve) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = () => resolve(null)
          img.src = src
        })
      }
      
      for (let i = 0; i < images.length; i++) {
        const img = await loadImage(images[i].url)
        if (img) {
          const col = i % cols
          const row = Math.floor(i / cols)
          const x = col * imgWidth
          const y = row * imgHeight
          
          // Draw image to fill the cell
          const imgAspect = img.width / img.height
          const cellAspect = imgWidth / imgHeight
          
          let sx, sy, sw, sh, dx, dy, dw, dh
          
          if (imgAspect > cellAspect) {
            sh = img.height
            sw = sh * cellAspect
            sx = (img.width - sw) / 2
            sy = 0
          } else {
            sw = img.width
            sh = sw / cellAspect
            sx = 0
            sy = (img.height - sh) / 2
          }
          
          ctx.drawImage(img, sx, sy, sw, sh, x, y, imgWidth, imgHeight)
        }
      }
      
      return canvas.toDataURL('image/jpeg', 0.9)
    }

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

    setStoryError('')
    setBusy(true)

    try {
      // Create combined image
      const combinedUrl = await combineImages()

      // Ask the vision model to write a story from what the photos actually show.
      let narrative = null
      let city = 'Unknown'

      const payload = (await Promise.all(images.slice(0, 6).map((img) => toDataUrl(img.url)))).filter(Boolean)

      if (payload.length) {
        try {
          const result = await generateStory({ data: { images: payload } })
          if (result?.narrative) {
            narrative = result.narrative
            city = result.city || 'Unknown'
          } else if (result?.error) {
            setStoryError(result.error)
          }
        } catch (err) {
          setStoryError(err?.message || 'Could not write a story from these photos.')
        }
      }

      if (!narrative) {
        // Fallback: filename hints, then a generic memory.
        let detected = null
        for (const img of images) {
          detected = detectLandmark(img.name)
          if (detected) break
        }

        const defaultNarratives = [
          "The light was perfect and the moment felt fleeting. I stood there, camera in hand, holding onto a memory.",
          "The world seemed to pause just for me. I breathed it all in—the sounds, the smells, the warmth of that sun.",
          "I saw this view and knew I'd found something special. I grabbed my camera and captured a piece of forever.",
          "I walked until my feet ached and my mind overflowed. This is what I came for—the feeling of being alive.",
          "I found peace here, away from everything familiar. Some places change you, and this one did."
        ]

        narrative = detected ? detected.narrative : defaultNarratives[Math.floor(Math.random() * defaultNarratives.length)]
        city = detected ? detected.city : 'Unknown'
      }

      const combinedPostcard = {
        id: 'combined-' + Date.now(),
        file: images[0].file,
        url: combinedUrl,
        name: images.map(img => img.name).join(' + '),
        narrative,
        city,
        allImages: images
      }

      setRendered([combinedPostcard])
    } finally {
      setBusy(false)
    }
  }


  return (
    <div className="min-h-screen bg-black text-gray-100 flex flex-col items-center justify-start pb-20" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      {/* Navbar banner */}
      <div className="fixed top-4 left-4 right-4 z-50 bg-[#0f0f0f]/35 backdrop-blur-md px-5 py-3 flex items-center gap-3 rounded-xl shadow-lg border border-[#352f3d]/50">
        <button data-href="/" data-reload className="flex items-center gap-4 hover:scale-105 active:scale-95 transition-transform duration-200">
          <img 
            src="/images/uigradients.png" 
            alt="Logo" 
            className="h-12 w-auto"
            style={{ transform: `rotate(${scrollRotation}deg)` }}
          />
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'DM Sans, sans-serif', background: 'linear-gradient(90deg, #c1336b, #ec5144)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>VibePost</h1>
        </button>
        <NavButton href="/transcribe">Transcribe</NavButton>
        <div className="flex-1"></div>
        {user ? (
          <NavButton href="/profile">My profile</NavButton>
        ) : (
          <NavButton href="/auth">Sign in / Sign up</NavButton>
        )}
      </div>
      <div className="h-24"></div>
      <div className="w-full flex flex-col items-center px-4 pt-32">
      <h2 className="text-5xl font-bold text-center text-white" style={{ fontFamily: 'DM Sans, sans-serif' }}>Camera roll to narrative</h2>
        <h2 className="text-5xl font-bold text-center text-white mb-48" style={{ fontFamily: 'DM Sans, sans-serif' }}>on demand</h2>
      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 w-full max-w-4xl">
        {/* Card 1 */}
        <div className="bg-[#221416]/80 backdrop-blur-sm rounded-2xl p-8 transition-all duration-300">
          <div className="flex items-center justify-center gap-2 mb-6">
            {/* Central hub */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            {/* Branch lines */}
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            {/* Device icons row */}
            <div className="flex gap-2">
              <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center border border-[#c1336b]">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
              </div>
              <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center border border-[#ec5144]">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 5.5l9-2.5L21 5.5v13l-9 2.5-9-2.5V5.5zm9 11.5l7-2.5-7-2.5-7 2.5 7 2.5z"/>
                </svg>
              </div>
              <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center border border-[#c1336b]">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>
          <h3 className="text-white text-lg font-semibold mb-2">Sync Across Devices</h3>
          <p className="text-sm" style={{ color: '#c0bec6' }}>Upload your images seamlessly across Mac, Windows, and mobile. Your entire library stays updated and accessible no matter where you are.</p>
        </div>
        
        {/* Card 2 */}
        <div className="bg-[#221416]/80 backdrop-blur-sm rounded-2xl p-8 transition-all duration-300">
          <div className="flex items-center justify-center gap-2 mb-6">
            {/* Photo */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            {/* Arrow */}
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            {/* Magic wand */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            {/* Arrow */}
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            {/* Postcard */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-white text-lg font-semibold mb-2">Transform Your Memories</h3>
          <p className="text-sm" style={{ color: '#c0bec6' }}>Convert your favorite holiday pictures into memorable postcards and stories. Our intuitive editor turns raw shots into polished, narrative-driven keepsakes.</p>
        </div>
        
        {/* Card 3 */}
        <div className="bg-[#221416]/80 backdrop-blur-sm rounded-2xl p-8 transition-all duration-300">
          <div className="flex items-center justify-center gap-2 mb-6">
            {/* Save */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            </div>
            {/* Plus */}
            <span className="text-gray-500 text-2xl font-bold">+</span>
            {/* Share */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </div>
          </div>
          <h3 className="text-white text-lg font-semibold mb-2">Save & Share Instantly</h3>
          <p className="text-sm" style={{ color: '#c0bec6' }}>Benefit from flexible storage by saving high-res files locally or posting directly to social media. Maintain full control over your media while staying connected.</p>
        </div>
      </div>

      <h2 className="text-5xl font-bold text-center text-white mt-32 mb-48" style={{ fontFamily: 'DM Sans, sans-serif' }}>Add images to start your story</h2>
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`w-full max-w-xl rounded-2xl border-2 border-dashed transition-colors duration-200 flex flex-col items-center justify-center gap-4 py-8 px-6 cursor-pointer
          ${dragging
            ? 'border-[#221416] bg-[#221416]/30'
            : 'border-[#221416] bg-[#221416]'
          }`}
        onClick={() => inputRef.current?.click()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: '#c0bec6' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm text-center" style={{ color: '#c0bec6' }}>
          Drag and drop files here or
        </p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
          className="px-5 py-2 rounded-lg text-white text-sm font-medium hover-ltr"
          style={{ backgroundColor: 'black' }}
        >
          <span className="relative z-10">Upload Files</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onFileInput}
        />
      </div>

      {/* Thumbnail preview */}
      {images.length > 0 && (
        <div className="w-full max-w-md mt-6 grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group rounded-lg overflow-hidden aspect-square bg-gray-800">
              <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(img.id)}
                className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove ${img.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Process button */}
      {images.length > 0 && (
        <div className="w-full max-w-sm mt-16 flex flex-col items-center gap-3">
          <button
            onClick={processImages}
            disabled={busy}
            className="w-full px-8 py-3 rounded-xl text-2xl font-bold text-white cursor-pointer hover-ltr transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
            style={{ backgroundColor: 'black' }}
          >
            <span className="relative z-10">{busy ? 'Reading your photos...' : 'Process Images'}</span>
          </button>
          {storyError && (
            <p className="text-sm text-center" style={{ color: '#c0bec6' }}>{storyError}</p>
          )}
        </div>
      )}

      {/* Rendered output */}
      <AnimatePresence>
        {rendered.length > 0 && (
          <motion.div 
            className="w-full mt-12 flex flex-col items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div 
              className="px-6 py-3 rounded-xl text-center my-8 text-white"
              style={{ 
                backgroundColor: '#221416', 
                fontSize: '2.5rem', 
                fontWeight: 'bold', 
                fontFamily: 'DM Sans, sans-serif',
                animation: 'bounce 30s linear infinite'
              }}
            >
              Click the postcard<br />to flip it!
            </div>
            <div className="flex flex-col items-center gap-8 mb-12 mt-20">
              {rendered.map((img) => (
                <FlipPostcard key={img.id} image={img} narrative={img.narrative} city={img.city} allImages={rendered} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAQ Section */}
      <div className="w-full max-w-2xl mt-48 mb-12 px-4">
        <h2 className="text-2xl font-bold text-center text-white mb-8">Common Questions</h2>
        <div className="space-y-3">
          {[
            { q: 'What exactly is VibePost?', a: 'VibePost transforms your travel photos into personalized magazine-style postcards with AI-generated stories that capture the mood and memory of your journey.' },
            { q: 'How does the AI "read" my photos?', a: 'Our AI analyzes the filename and image content to detect landmarks and locations, then generates a unique narrative that matches the vibe of your photo.' },
            { q: 'What if I don\'t like the first story the AI writes?', a: 'No problem! Click "Regenerate Story" and choose from 6 different styles - Cinematic, Vintage Nostalgia, Holiday Blues, Joyful, Stressful, or National Geographic.' },
            { q: 'Can I share my postcards on social media?', a: 'Absolutely! Download your memoir as a PDF or take a screenshot of your postcard to share on Instagram, Facebook, or any platform you like.' },
            { q: 'How long does the transformation take?', a: 'It only takes a few seconds! Upload your photos, click "Process Images," and your personalized postcards are ready instantly.' },
            { q: 'Are my photos safe?', a: 'Yes! Your photos are processed locally in your browser and are never uploaded to our servers. We respect your privacy.' },
            { q: 'What file types do you support?', a: 'We support all common image formats including JPG, PNG, HEIC, and WebP. Just drag and drop your photos or click to upload.' },
          ].map((faq, i) => (
            <FAQItem key={i} question={faq.q} answer={faq.a} />
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}

export default App
