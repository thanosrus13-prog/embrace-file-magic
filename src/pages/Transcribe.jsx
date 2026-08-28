import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSession, signOut } from '@/hooks/useSession'
import { supabase } from '@/integrations/supabase/client'
import { saveTranscription, uploadAudioFile } from '../utils/saveTranscription'

export default function Transcribe() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useSession()
  const goToAuth = () => navigate({ to: '/auth', search: { redirect: '/transcribe' } })
  const [scrollRotation, setScrollRotation] = useState(0)
  const [audioFile, setAudioFile] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [recordingMode, setRecordingMode] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const loadHistory = useCallback(async () => {
    if (!user) { setHistory([]); return }
    setHistoryLoading(true)
    const { data, error } = await supabase
      .from('transcriptions')
      .select('id, transcription_type, text_content, audio_url, created_at')
      .order('created_at', { ascending: false })
    if (error) console.error('Failed to load transcriptions:', error.message)
    setHistory(error ? [] : (data || []))
    setHistoryLoading(false)
  }, [user])

  useEffect(() => { loadHistory() }, [loadHistory])

  const deleteTranscription = async (id) => {
    const { error } = await supabase.from('transcriptions').delete().eq('id', id)
    if (error) { console.error('Failed to delete transcription:', error.message); return }
    setHistory(prev => prev.filter(t => t.id !== id))
  }

  // Track scroll rotation
  useEffect(() => {
    let lastScrollY = window.scrollY
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const delta = currentScrollY - lastScrollY
      setScrollRotation(prev => prev - delta * 0.5)
      lastScrollY = currentScrollY
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleFile = (files) => {
    if (!user) { goToAuth(); return }
    const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/') || f.name.endsWith('.mp3') || f.name.endsWith('.wav') || f.name.endsWith('.m4a'))
    if (audioFiles.length > 0) {
      setAudioFile(audioFiles[0])
      setTranscript('')
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    handleFile(e.dataTransfer.files)
  }

  const onDragOver = (e) => {
    e.preventDefault()
    setDragActive(true)
  }

  const onDragLeave = () => setDragActive(false)

  const onFileInput = (e) => {
    handleFile(e.target.files)
    e.target.value = ''
  }

  const transcribeAudio = async () => {
    if (!user) { goToAuth(); return }
    if (!audioFile) return
    
    setIsTranscribing(true)
    setTranscript('Saving audio file...')

    let storedAudioUrl = null
    try {
      const uploaded = await uploadAudioFile(audioFile)
      storedAudioUrl = uploaded.url
    } catch (e) {
      console.error('Audio storage upload failed:', e)
    }

    setTranscript('Transcribing audio file...')

    try {
      // Convert file to base64
      const reader = new FileReader()
      reader.readAsDataURL(audioFile)
      
      reader.onload = async () => {
        const base64Audio = reader.result.split(',')[1]
        
        try {
          // Use AssemblyAI free transcription API
          // Get free API key from https://www.assemblyai.com/
          const API_KEY = localStorage.getItem('assemblyai_key')
          
          if (!API_KEY) {
            // Ask user for API key
            const key = prompt('Enter your AssemblyAI API key (free at https://www.assemblyai.com/):')
            if (!key) {
              setTranscript('API key required. Get one free at https://www.assemblyai.com/')
              setIsTranscribing(false)
              return
            }
            localStorage.setItem('assemblyai_key', key)
          }
          
          setTranscript('Uploading audio...')
          
          // Convert base64 to binary
          const binaryString = atob(base64Audio)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          
          // Upload audio as binary
          const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
            method: 'POST',
            headers: { 
              'Authorization': localStorage.getItem('assemblyai_key'),
              'Content-Type': 'application/octet-stream'
            },
            body: bytes
          })
          
          const uploadData = await uploadResponse.json()
          
          if (!uploadResponse.ok) {
            setTranscript('Upload failed: ' + (uploadData.error || 'Unknown error'))
            setIsTranscribing(false)
            return
          }
          
          if (!uploadData.upload_url) {
            setTranscript('Upload failed: No URL returned')
            setIsTranscribing(false)
            return
          }
          
          setTranscript('Transcribing...')
          
          // Start transcription - force English
          const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST',
            headers: { 
              'Authorization': localStorage.getItem('assemblyai_key'),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              audio_url: uploadData.upload_url,
              speech_models: ['universal-2'],
              language_code: 'en'
            })
          })
          
          const transcriptData = await transcriptResponse.json()
          
          if (!transcriptResponse.ok || transcriptData.error) {
            setTranscript('Transcription failed: ' + (transcriptData.error || 'Unknown error'))
            setIsTranscribing(false)
            return
          }
          
          // Poll for result - animate words appearing
          const checkResult = async () => {
            const result = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptData.id}?words=true`, {
              headers: { 'Authorization': localStorage.getItem('assemblyai_key') }
            })
            const resultData = await result.json()
            
            if (resultData.status === 'completed') {
              // Animate words appearing one by one
              const fullText = resultData.text || 'No speech detected'
              const words = fullText.split(' ')
              let currentIndex = 0
              
              const showNextWord = () => {
                if (currentIndex < words.length) {
                  setTranscript(words.slice(0, currentIndex + 1).join(' ') + ' █')
                  currentIndex++
                  setTimeout(showNextWord, 100)
                } else {
                  setTranscript(fullText)
                  setIsTranscribing(false)
                  saveTranscription('uploaded_file', fullText, storedAudioUrl).then(() => loadHistory())
                }
              }
              showNextWord()
            } else if (resultData.status === 'error') {
              setTranscript('Transcription failed: ' + (resultData.error || 'Unknown'))
              setIsTranscribing(false)
            } else {
              setTranscript('Transcribing...')
              setTimeout(checkResult, 500)
            }
          }
          
          checkResult()
        } catch (apiError) {
          console.error('API error:', apiError)
          setTranscript('API error: ' + apiError.message)
          setIsTranscribing(false)
        }
      }
      
      reader.onerror = () => {
        setTranscript('Error reading audio file.')
        setIsTranscribing(false)
      }
    } catch (err) {
      console.error('Error:', err)
      setTranscript('Error processing audio.')
      setIsTranscribing(false)
    }
  }
  
  const stoppingRef = useRef(false)
  const finalTranscriptRef = useRef('')
  const recognitionRef = useRef(null)
  const savedRef = useRef(false)

  const persistLive = useCallback(async () => {
    if (savedRef.current) return
    const text = (finalTranscriptRef.current || '').trim()
    if (!text) {
      console.warn('Live recording produced no final text — nothing saved.')
      return
    }
    savedRef.current = true
    const { error } = await saveTranscription('live', text)
    if (error) {
      savedRef.current = false
      console.error('Failed to save live transcription:', error)
      return
    }
    loadHistory()
  }, [loadHistory])

  const startRecording = async () => {
    if (!user) { goToAuth(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)

      stoppingRef.current = false
      savedRef.current = false
      finalTranscriptRef.current = ''

      // Start speech recognition for real-time transcription
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      let recognition = null

      if (SpeechRecognition) {
        recognition = new SpeechRecognition()
        recognitionRef.current = recognition
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        recognition.onresult = (event) => {
          let interim = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscriptRef.current += text + ' '
            } else {
              interim += text
            }
          }
          setTranscript((finalTranscriptRef.current + interim).trim())
        }

        recognition.onerror = (e) => {
          console.error('Speech error:', e.error)
        }

        recognition.onend = () => {
          if (!stoppingRef.current) {
            // Chrome ends recognition periodically — keep it alive while recording
            try { recognition.start() } catch (e) { /* already started */ }
            return
          }
          recognitionRef.current = null
          persistLive()
        }

        recognition.start()
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        if (!recognitionRef.current) persistLive()
      }

      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
    } catch (e) {
      console.error('Recording error:', e)
    }
  }

  const stopRecording = () => {
    stoppingRef.current = true
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) { /* noop */ }
    }
    if (mediaRecorder) {
      mediaRecorder.stop()
    }
    setIsRecording(false)
  }


  return (
    <div className="min-h-screen bg-black text-gray-100 flex flex-col items-center justify-start pb-20" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      {/* Navbar */}
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
        <button
          data-href="/transcribe"
          className="ml-4 px-4 py-2 rounded-lg text-white text-sm font-medium hover-ltr transition-all duration-200 active:scale-95 active:opacity-80"
          style={{ backgroundColor: 'rgba(15, 15, 15, 0.35)' }}
        >
          <span className="relative z-10">Transcribe</span>
        </button>
        <div className="flex-1"></div>
        {user ? (
          <button
            onClick={async () => {
              if (isRecording) stopRecording()
              await signOut()
              setAudioFile(null)
              setTranscript('')
            }}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium hover-ltr transition-all duration-200 active:scale-95 active:opacity-80"
            style={{ backgroundColor: 'rgba(15, 15, 15, 0.35)' }}
          >
            <span className="relative z-10">Sign out</span>
          </button>
        ) : (
          <button
            data-href="/auth"
            className="px-4 py-2 rounded-lg text-white text-sm font-medium hover-ltr transition-all duration-200 active:scale-95 active:opacity-80"
            style={{ backgroundColor: 'rgba(15, 15, 15, 0.35)' }}
          >
            <span className="relative z-10">Sign in / Sign up</span>
          </button>
        )}
      </div>
      <div className="h-24"></div>

      {/* Transcribe Page Content */}
      <div className="w-full flex flex-col items-center px-4 pt-32">
        <h2 className="text-5xl font-bold text-center text-white" style={{ fontFamily: 'DM Sans, sans-serif' }}>Audio in. Text out.</h2>
        <h2 className="text-5xl font-bold text-center text-white mb-48" style={{ fontFamily: 'DM Sans, sans-serif' }}>Instantly.</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 w-full max-w-4xl">
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
            <h3 className="text-white text-lg font-semibold mb-2 text-center">Cross-Platform Support</h3>
            <p className="text-sm" style={{ color: '#c0bec6' }}>Upload your audio files across Mac, Windows, and mobile. Your files stay accessible everywhere.</p>
          </div>
          
          {/* Card 2 */}
          <div className="bg-[#221416]/80 backdrop-blur-sm rounded-2xl p-8 transition-all duration-300">
            <div className="flex items-center justify-center gap-2 mb-6">
              {/* Audio file */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              </div>
              {/* Arrow */}
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              {/* Magic wand (AI) */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              {/* Arrow */}
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              {/* Text document */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <h3 className="text-white text-lg font-semibold mb-2 text-center">Convert to Text</h3>
            <p className="text-sm" style={{ color: '#c0bec6' }}>Transform your audio files into accurate text transcripts instantly.</p>
          </div>
          
          {/* Card 3 */}
          <div className="bg-[#221416]/80 backdrop-blur-sm rounded-2xl p-8 transition-all duration-300">
            <div className="flex items-center justify-center gap-2 mb-6">
              {/* Brain/AI */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              {/* Check */}
              <span className="text-gray-500 text-2xl font-bold">✓</span>
              {/* Accuracy/Target */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
            <h3 className="text-white text-lg font-semibold mb-2 text-center">High Accuracy AI</h3>
            <p className="text-sm" style={{ color: '#c0bec6' }}>Benefit from state-of-the-art AI transcription with 95%+ accuracy.</p>
          </div>
        </div>

        <h2 className="text-5xl font-bold text-center text-white mt-32 mb-32" style={{ fontFamily: 'DM Sans, sans-serif' }}>Insert audio to begin transcription</h2>
        
        {!user ? (
          <div className="w-full max-w-xl rounded-2xl p-8 flex flex-col items-center gap-4 text-center" style={{ backgroundColor: '#221416' }}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: '#c0bec6' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <p className="text-white text-lg font-semibold">Sign in to transcribe</p>
            <p className="text-sm max-w-sm" style={{ color: '#c0bec6' }}>
              Uploading audio and live recording are available once you have an account. It only takes a moment.
            </p>
            <button
              onClick={goToAuth}
              disabled={authLoading}
              className="mt-2 px-8 py-3 rounded-xl text-lg font-bold text-white cursor-pointer hover-ltr transition-all duration-200 active:scale-[0.98] active:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: 'black' }}
            >
              <span className="relative z-10">Sign in / Sign up</span>
            </button>
          </div>
        ) : (
        <>
        {/* Mode toggle */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => { setRecordingMode(false); setAudioFile(null); setTranscript('') }}
            className="px-4 py-2 rounded-lg text-sm font-medium hover-ltr"
            style={{ backgroundColor: !recordingMode ? 'black' : 'black', color: !recordingMode ? 'white' : 'gray' }}
          >
            <span className="relative z-10">Upload File</span>
          </button>
          <button
            onClick={() => { setRecordingMode(true); setAudioFile(null); setTranscript('') }}
            className="px-4 py-2 rounded-lg text-sm font-medium hover-ltr"
            style={{ backgroundColor: 'black', color: recordingMode ? 'white' : 'gray' }}
          >
            <span className="relative z-10">🎙️ Record Live</span>
          </button>
        </div>
        
        {recordingMode ? (
          <div className="w-full max-w-2xl flex flex-col items-center gap-4">
            <div className="bg-[#221416] rounded-2xl p-8 w-full">
              {isRecording ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-red-500 animate-pulse flex items-center justify-center">
                    <span className="text-white text-2xl">🎙️</span>
                  </div>
                  <p className="text-white font-medium">Recording & Transcribing...</p>
                  <button
                    onClick={stopRecording}
                    className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium"
                  >
                    Stop
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: '#c0bec6' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                  <p className="text-gray-400 text-sm">Click to start recording & transcribing</p>
                  <button
                    onClick={() => { setAudioFile(null); startRecording() }}
                    className="px-5 py-2 rounded-lg text-white text-sm font-medium hover-ltr"
                    style={{ backgroundColor: 'black' }}
                  >
                    <span className="relative z-10">Start Recording</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`w-full max-w-xl rounded-2xl border-2 border-dashed transition-colors duration-200 flex flex-col items-center justify-center gap-4 py-8 px-6 cursor-pointer
            ${dragActive
              ? 'border-[#221416] bg-[#221416]/30'
              : 'border-[#221416] bg-[#221416]'
            }`}
          onClick={() => document.getElementById('audio-input').click()}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: '#c0bec6' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
          <p className="text-sm text-center" style={{ color: '#c0bec6' }}>
            Drag and drop audio files here or
          </p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); document.getElementById('audio-input').click() }}
            className="px-5 py-2 rounded-lg text-white text-sm font-medium hover-ltr"
            style={{ backgroundColor: 'black' }}
          >
            <span className="relative z-10">Upload Audio</span>
          </button>
          <input
            id="audio-input"
            type="file"
            accept="audio/*,.mp3,.wav,.m4a"
            multiple
            className="hidden"
            onChange={onFileInput}
          />
        </div>
        )}
        </>
        )}

        {/* Selected file - only show for upload mode */}
        {!recordingMode && audioFile && (
          <div className="w-full max-w-2xl mt-6 flex items-center justify-between rounded-xl p-4" style={{ backgroundColor: '#221416' }}>
            <div className="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
              </svg>
              <span className="text-white text-sm font-semibold">{audioFile.name}</span>
            </div>
            <button
              onClick={() => { setAudioFile(null); setTranscript('') }}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Transcribe button for upload mode */}
        {!recordingMode && audioFile && (
          <div className="mt-32 flex flex-col items-center gap-3">
            <button
              onClick={transcribeAudio}
              disabled={isTranscribing}
              className="w-full px-8 py-3 rounded-xl text-2xl font-bold text-white cursor-pointer hover-ltr"
              style={{ backgroundColor: 'black' }}
            >
              <span className="relative z-10">{isTranscribing ? 'Transcribing...' : 'Start Transcription'}</span>
            </button>
          </div>
        )}

        {/* Transcript output */}
        {transcript && (
          <div className="w-full max-w-2xl mt-8">
            <h3 className="text-white font-semibold mb-3">Transcript:</h3>
            <div className="rounded-xl p-4" style={{ backgroundColor: '#221416' }}>
              <p className="text-gray-300 text-sm whitespace-pre-wrap">{transcript}</p>
            </div>
          </div>
        )}

        {/* Past transcriptions */}
        {user && (
          <div className="w-full max-w-2xl mt-32 px-4">
            <h2 className="text-2xl font-bold text-center text-white mb-8" style={{ fontFamily: 'DM Sans, sans-serif' }}>Your past transcriptions</h2>
            {history.length > 0 && (
              <div className="relative mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transcripts…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-[#ec5144]/50 transition-all"
                  style={{ backgroundColor: '#221416', border: '1px solid rgba(53, 47, 61, 0.5)' }}
                />
              </div>
            )}
            {historyLoading ? (
              <p className="text-center text-sm" style={{ color: '#c0bec6' }}>Loading…</p>
            ) : filteredHistory.length === 0 ? (
              <p className="text-center text-sm" style={{ color: '#c0bec6' }}>
                {searchQuery.trim() ? 'No transcripts match your search.' : 'No saved transcriptions yet. Finish a recording or upload and it will appear here.'}
              </p>
            ) : (
              <div className="space-y-3">
                {filteredHistory.map(item => (
                  <HistoryItem key={item.id} item={item} onDelete={() => deleteTranscription(item.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* FAQ Section */}
        <div className="w-full max-w-2xl mt-48 mb-12 px-4">
          <h2 className="text-2xl font-bold text-center text-white mb-8">Common Questions</h2>
          <div className="space-y-3">
            {[
              { q: 'What exactly is Transcribe?', a: 'Transcribe uses AssemblyAI to convert your audio files into accurate text transcripts. Simply upload your audio or record live, and our AI-powered transcription will convert it to text.' },
              { q: 'What audio formats do you support?', a: 'We support all common audio formats including MP3, WAV, M4A, AAC, and more. Just drag and drop your file or click to upload.' },
              { q: 'How accurate is the transcription?', a: 'AssemblyAI provides state-of-the-art speech recognition with 95%+ accuracy on clear audio recordings.' },
              { q: 'How long does transcription take?', a: 'Transcription typically takes just a few seconds to a minute depending on the length of your audio file. Most files are processed in under 10 seconds.' },
              { q: 'Can I edit the transcript?', a: 'Yes! Once the transcription is complete, you can copy the text and edit it however you like. You can also download it for your records.' },
              { q: 'Are my audio files secure?', a: 'Absolutely! Your audio files are sent directly to AssemblyAI for transcription and are never stored on our servers. We prioritize your privacy and data security.' },
              { q: 'Is there a limit on file size?', a: 'We support audio files up to 100MB. For longer recordings, you can split them into smaller files for better results.' },
              { q: 'Do I need an API key?', a: 'For uploaded files, you need an AssemblyAI API key (free at assemblyai.com). Your key is stored locally in your browser and never shared. The "Record Live" mode is free and uses your browser\'s built-in speech recognition.' },
            ].map((faq, i) => (
              <FAQItem key={i} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function HistoryItem({ item, onDelete }) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const date = new Date(item.created_at)
  const preview = item.text_content.length > 120 ? item.text_content.slice(0, 120) + '…' : item.text_content

  const copy = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(item.text_content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) { console.error(err) }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#221416' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-4 text-left transition-all duration-200 active:opacity-80"
      >
        <span
          className="shrink-0 px-2 py-1 rounded-md text-xs font-semibold text-white"
          style={{ background: 'linear-gradient(90deg, #c1336b, #ec5144)' }}
        >
          {item.transcription_type === 'live' ? '🎙️ Live' : '📁 File'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-300 truncate">{preview}</p>
          <p className="text-xs mt-1" style={{ color: '#c0bec6' }}>
            {date.toLocaleDateString()} · {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <span className="text-white text-xl font-bold w-6 text-center shrink-0">{isOpen ? '−' : '+'}</span>
      </button>
      <div
        className="grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', opacity: isOpen ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1">
            <p className="text-sm text-gray-300 whitespace-pre-wrap mb-4">{item.text_content}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={copy}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-200 active:scale-95"
                style={{ backgroundColor: 'black' }}
              >
                {copied ? 'Copied!' : 'Copy text'}
              </button>
              {item.audio_url && (
                <a
                  href={item.audio_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-200 active:scale-95"
                  style={{ backgroundColor: 'black' }}
                >
                  Play audio
                </a>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 transition-all duration-200 active:scale-95"
                style={{ backgroundColor: 'black' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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