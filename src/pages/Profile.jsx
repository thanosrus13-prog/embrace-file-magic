import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '@/integrations/supabase/client'
import { useSession, signOut } from '@/hooks/useSession'
import { getCachedHistory, setCachedHistory, clearCachedHistory } from '@/lib/history-cache'

export default function Profile() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useSession()
  const [scrollRotation, setScrollRotation] = useState(0)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Redirect signed-out users to auth
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: '/auth', search: { redirect: '/profile' } })
    }
  }, [authLoading, user, navigate])

  const loadHistory = useCallback(async ({ force = false } = {}) => {
    if (!user) { setHistory([]); return }
    if (!force) {
      const cachedHistory = getCachedHistory(user.id)
      if (cachedHistory) { setHistory(cachedHistory); return }
    }
    setHistoryLoading(true)
    const { data, error } = await supabase
      .from('transcriptions')
      .select('id, transcription_type, text_content, audio_url, storage_path, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) console.error('Failed to load transcriptions:', error.message)
    const rows = error ? [] : (data || [])
    if (!error) setCachedHistory(user.id, rows)
    setHistory(rows)
    setHistoryLoading(false)
  }, [user])

  useEffect(() => { loadHistory() }, [loadHistory])

  const deleteTranscription = async (id) => {
    const item = history.find(t => t.id === id)
    // Soft delete: the record is kept and hidden, and the audit log records it
    const { error } = await supabase
      .from('transcriptions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
    if (error) { console.error('Failed to delete transcription:', error.message); return }
    if (item?.storage_path) {
      const { error: storageError } = await supabase.storage.from('audio_files').remove([item.storage_path])
      if (storageError) console.error('Failed to delete audio file:', storageError.message)
    }
    clearCachedHistory(user?.id)
    setHistory(prev => {
      const next = prev.filter(t => t.id !== id)
      if (user?.id) setCachedHistory(user.id, next)
      return next
    })
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

  const filteredHistory = history.filter(item =>
    item.text_content.toLowerCase().includes(searchQuery.trim().toLowerCase())
  )

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
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'DM Sans, sans-serif', background: 'linear-gradient(90deg, #c1336b, #ec5144)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>PostScript</h1>
        </button>
        <button
          data-href="/vibepost"
          className="ml-4 px-4 py-2 rounded-lg text-white text-sm font-medium hover-ltr transition-all duration-200 active:scale-95 active:opacity-80"
          style={{ backgroundColor: 'rgba(15, 15, 15, 0.35)' }}
        >
          <span className="relative z-10">VibePost</span>
        </button>
        <div className="flex-1"></div>
        {user ? (
          <button
            onClick={async () => { await signOut(); navigate({ to: '/auth' }) }}
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

      <div className="w-full flex flex-col items-center px-4 pt-32">
        <h2 className="text-5xl font-bold text-center text-white" style={{ fontFamily: 'DM Sans, sans-serif' }}>Your memories.</h2>
        <h2 className="text-5xl font-bold text-center text-white mb-10" style={{ fontFamily: 'DM Sans, sans-serif' }}>In one place.</h2>

        {user && (
          <p className="text-sm mb-12" style={{ color: '#c0bec6' }}>{user.email}</p>
        )}

        {/* Past transcriptions */}
        {user && (
          <div className="w-full max-w-2xl mt-12 px-4">
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
