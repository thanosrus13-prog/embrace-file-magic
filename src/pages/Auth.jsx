import { useState, useEffect } from 'react'

export default function Auth() {
  const [scrollRotation, setScrollRotation] = useState(0)
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

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

  const switchMode = (next) => {
    setMode(next)
    setStatus('')
  }

  const onSubmit = (e) => {
    e.preventDefault()
    if (!email || !password) {
      setStatus('Please enter your email and password.')
      return
    }
    if (mode === 'signup' && password !== confirm) {
      setStatus('Passwords do not match.')
      return
    }
    setBusy(true)
    setStatus(mode === 'signin' ? 'Signing you in...' : 'Creating your account...')
    setTimeout(() => {
      setBusy(false)
      setStatus(
        mode === 'signin'
          ? 'Accounts are not connected yet — this is the sign in layout.'
          : 'Accounts are not connected yet — this is the sign up layout.'
      )
    }, 900)
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 flex flex-col items-center justify-start pb-20" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      {/* Navbar */}
      <div className="fixed top-4 left-4 right-4 z-50 bg-[#0f0f0f]/35 backdrop-blur-md px-5 py-3 flex items-center gap-3 rounded-xl shadow-lg border border-[#352f3d]/50">
        <button data-href="/" data-reload className="flex items-center gap-4 hover:scale-105 transition-transform">
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
          className="ml-4 px-4 py-2 rounded-lg text-white text-sm font-medium hover-ltr"
          style={{ backgroundColor: 'rgba(15, 15, 15, 0.35)' }}
        >
          <span className="relative z-10">Transcribe</span>
        </button>
        <div className="flex-1"></div>
        <button
          data-href="/auth"
          className="px-4 py-2 rounded-lg text-white text-sm font-medium hover-ltr"
          style={{ backgroundColor: 'rgba(15, 15, 15, 0.35)' }}
        >
          <span className="relative z-10">Sign in / Sign up</span>
        </button>
      </div>
      <div className="h-24"></div>

      <div className="w-full flex flex-col items-center px-4 pt-32">
        <h2 className="text-5xl font-bold text-center text-white" style={{ fontFamily: 'DM Sans, sans-serif' }}>Your memories.</h2>
        <h2 className="text-5xl font-bold text-center text-white mb-48" style={{ fontFamily: 'DM Sans, sans-serif' }}>One account.</h2>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 w-full max-w-4xl">
          <div className="bg-[#221416]/80 backdrop-blur-sm rounded-2xl p-8 transition-all duration-300">
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm-4 6c-3.314 0-6 1.79-6 4h12c0-2.21-2.686-4-6-4z" />
                </svg>
              </div>
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              </div>
            </div>
            <h3 className="text-white text-lg font-semibold mb-2 text-center">One Profile</h3>
            <p className="text-sm" style={{ color: '#c0bec6' }}>Keep your postcards, transcripts and memoirs together under a single account.</p>
          </div>

          <div className="bg-[#221416]/80 backdrop-blur-sm rounded-2xl p-8 transition-all duration-300">
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <h3 className="text-white text-lg font-semibold mb-2 text-center">Private by Default</h3>
            <p className="text-sm" style={{ color: '#c0bec6' }}>Your uploads stay yours. Nothing is shared until you decide to send it.</p>
          </div>

          <div className="bg-[#221416]/80 backdrop-blur-sm rounded-2xl p-8 transition-all duration-300">
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c1336b] to-[#ec5144] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
            </div>
            <h3 className="text-white text-lg font-semibold mb-2 text-center">Pick Up Anywhere</h3>
            <p className="text-sm" style={{ color: '#c0bec6' }}>Start a postcard on your phone, finish it on your laptop — same account, same work.</p>
          </div>
        </div>

        {/* Auth card */}
        <div className="w-full max-w-md mt-6 rounded-2xl p-6" style={{ backgroundColor: '#221416' }}>
          <div className="flex gap-2 mb-6 p-1 rounded-xl" style={{ backgroundColor: 'rgba(15, 15, 15, 0.6)' }}>
            {['signin', 'signup'].map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                style={
                  mode === m
                    ? { background: 'linear-gradient(90deg, #c1336b, #ec5144)', color: '#ffffff' }
                    : { color: '#c0bec6' }
                }
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wide" style={{ color: '#c0bec6' }}>Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none border border-[#352f3d]/70 focus:border-[#ec5144]"
                  style={{ backgroundColor: '#0f0f0f' }}
                />
              </label>
            )}

            <label className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-wide" style={{ color: '#c0bec6' }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none border border-[#352f3d]/70 focus:border-[#ec5144]"
                style={{ backgroundColor: '#0f0f0f' }}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-wide" style={{ color: '#c0bec6' }}>Password</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl px-4 py-3 pr-16 text-sm text-white outline-none border border-[#352f3d]/70 focus:border-[#ec5144]"
                  style={{ backgroundColor: '#0f0f0f' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                  style={{ color: '#c0bec6' }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {mode === 'signup' && (
              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wide" style={{ color: '#c0bec6' }}>Confirm password</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none border border-[#352f3d]/70 focus:border-[#ec5144]"
                  style={{ backgroundColor: '#0f0f0f' }}
                />
              </label>
            )}

            {mode === 'signin' && (
              <div className="flex justify-end">
                <button type="button" className="text-xs" style={{ color: '#c0bec6' }}>Forgot password?</button>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full px-8 py-3 rounded-xl text-lg font-bold text-white cursor-pointer hover-ltr"
              style={{ backgroundColor: 'black' }}
            >
              <span className="relative z-10">
                {busy ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </span>
            </button>
          </form>

          {status && (
            <p className="mt-4 text-sm text-center" style={{ color: '#c0bec6' }}>{status}</p>
          )}

          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1" style={{ backgroundColor: '#352f3d' }}></div>
            <span className="text-xs" style={{ color: '#c0bec6' }}>or continue with</span>
            <div className="h-px flex-1" style={{ backgroundColor: '#352f3d' }}></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="py-3 rounded-xl text-sm font-medium text-white hover-ltr" style={{ backgroundColor: '#0f0f0f' }}>
              <span className="relative z-10">Google</span>
            </button>
            <button type="button" className="py-3 rounded-xl text-sm font-medium text-white hover-ltr" style={{ backgroundColor: '#0f0f0f' }}>
              <span className="relative z-10">Apple</span>
            </button>
          </div>

          <p className="mt-6 text-center text-sm" style={{ color: '#c0bec6' }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
              className="font-semibold"
              style={{ color: '#ec5144' }}
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        {/* FAQ */}
        <div className="w-full max-w-2xl mt-48 mb-12 px-4">
          <h2 className="text-2xl font-bold text-center text-white mb-8">Common Questions</h2>
          <div className="space-y-3">
            {[
              { q: 'Why do I need an account?', a: 'An account keeps your postcards, narratives and transcripts saved so you can come back to them from any device.' },
              { q: 'Is signing up free?', a: 'Yes. Creating an account is free — you only need one to save and revisit your work.' },
              { q: 'What do you do with my email?', a: 'It is used to sign you in and to recover your account. We do not sell or share it.' },
              { q: 'Can I use Google or Apple instead?', a: 'Those options are laid out here and can be switched on once accounts are connected to a backend.' },
              { q: 'I forgot my password — now what?', a: 'Use the “Forgot password?” link on the sign in tab and we will send a reset link to your email.' },
              { q: 'Can I delete my account?', a: 'Yes. Deleting your account removes your saved postcards and transcripts permanently.' },
            ].map((faq, i) => (
              <FAQItem key={i} question={faq.q} answer={faq.a} />
            ))}
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
        <span className="relative z-10 text-white ml-4">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          <p className="text-sm" style={{ color: '#c0bec6' }}>{answer}</p>
        </div>
      )}
    </div>
  )
}
