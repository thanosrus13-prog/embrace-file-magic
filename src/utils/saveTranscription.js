import { supabase } from '@/integrations/supabase/client'

const BUCKET = 'audio_files'

// Uploads an audio file to storage for the signed-in user and returns its URL.
export async function uploadAudioFile(file) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { url: null, error: 'not signed in' }

  const ext = (file.name?.split('.').pop() || 'dat').toLowerCase()
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'audio/mpeg', upsert: false })

  if (error) {
    console.error('Failed to upload audio file:', error.message)
    return { url: null, error: error.message }
  }

  // Bucket is private, so hand back a long-lived signed URL.
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365)

  if (signErr) {
    console.error('Failed to sign audio URL:', signErr.message)
    return { url: null, error: signErr.message, path }
  }

  return { url: signed.signedUrl, path, error: null }
}

// Saves a finished transcription for the signed-in user.
// type: 'live' | 'uploaded_file'
export async function saveTranscription(type, text, audioUrl = null) {
  const content = (text || '').trim()
  if (!content) return { error: 'empty' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not signed in' }

  const { error } = await supabase.from('transcriptions').insert({
    user_id: user.id,
    transcription_type: type,
    text_content: content,
    audio_url: audioUrl,
  })

  if (error) console.error('Failed to save transcription:', error.message)
  return { error: error?.message ?? null }
}
