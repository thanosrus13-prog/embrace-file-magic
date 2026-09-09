import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '@/integrations/supabase/client'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
    })

    const init = async () => {
      const hash = window.location.hash || ''
      const search = window.location.search || ''
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
      const searchParams = new URLSearchParams(search)

      const errorDescription =
        hashParams.get('error_description') || searchParams.get('error_description')
      if (errorDescription) {
        if (active) setLinkError(errorDescription)
        return
      }

      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (active && error) setLinkError(error.message)
      }

      const { data } = await supabase.auth.getSession()
      if (active && data.session) setReady(true)
    }

    init()

    return () => {
      active = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!password || password.length < 6) {
      setStatus('Please choose a password with at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setStatus('Passwords do not match.')
      return
    }
    setBusy(true)
    setStatus('Updating your password...')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setStatus(error.message)
        return
      }
      setDone(true)
      setStatus('Password updated. Taking you to your profile...')
      setTimeout(() => navigate({ to: '/profile' }), 1200)
    } catch (err) {
      setStatus(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-black text-gray-100 flex flex-col items-center justify-start pb-20"
      style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
    >
      <div className="fixed top-4 left-4 right-4 z-50 bg-[#0f0f0f]/35 backdrop-blur-md px-5 py-3 flex items-center gap-3 rounded-xl shadow-lg border border-[#352f3d]/50">
        <button
          data-href="/"
          data-reload
          className="flex items-center gap-4 hover:scale-105 active:scale-95 transition-transform duration-200"
        >
          <img src="/images/uigradients.png" alt="Logo" className="h-12 w-auto" />
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{
              fontFamily: 'DM Sans, sans-serif',
              background: 'linear-gradient(90deg, #c1336b, #ec5144)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            VibePost
          </h1>
        </button>
        <div className="flex-1"></div>
      </div>
      <div className="h-24"></div>

      <div className="w-full flex flex-col items-center px-4 pt-32">
        <h2 className="text-5xl font-bold text-center text-white mb-10" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          Choose a new password
        </h2>

        <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: '#221416' }}>
          {linkError ? (
            <div className="text-center">
              <p className="text-sm mb-5" style={{ color: '#c0bec6' }}>{linkError}</p>
              <button
                onClick={() => navigate({ to: '/auth' })}
                className="w-full px-8 py-3 rounded-xl text-lg font-bold text-white cursor-pointer hover-ltr transition-all duration-200 active:scale-[0.98] active:opacity-90"
                style={{ backgroundColor: 'black' }}
              >
                <span className="relative z-10">Request a new link</span>
              </button>
            </div>
          ) : !ready ? (
            <p className="text-sm text-center" style={{ color: '#c0bec6' }}>Checking your reset link...</p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wide" style={{ color: '#c0bec6' }}>New password</span>
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

              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wide" style={{ color: '#c0bec6' }}>Confirm new password</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none border border-[#352f3d]/70 focus:border-[#ec5144]"
                  style={{ backgroundColor: '#0f0f0f' }}
                />
              </label>

              <button
                type="submit"
                disabled={busy || done}
                className="w-full px-8 py-3 rounded-xl text-lg font-bold text-white cursor-pointer hover-ltr transition-all duration-200 active:scale-[0.98] active:opacity-90 disabled:opacity-60 disabled:active:scale-100"
                style={{ backgroundColor: 'black' }}
              >
                <span className="relative z-10">{busy ? 'Please wait...' : 'Update password'}</span>
              </button>
            </form>
          )}

          {status && (
            <p className="mt-4 text-sm text-center" style={{ color: '#c0bec6' }}>{status}</p>
          )}
        </div>
      </div>
    </div>
  )
}
