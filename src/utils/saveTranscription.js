import { supabase } from '@/integrations/supabase/client'

// Saves a finished transcription for the signed-in user.
// type: 'live' | 'uploaded_file'
export async function saveTranscription(type, text) {
  const content = (text || '').trim()
  if (!content) return { error: 'empty' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not signed in' }

  const { error } = await supabase.from('transcriptions').insert({
    user_id: user.id,
    transcription_type: type,
    text_content: content,
  })

  if (error) console.error('Failed to save transcription:', error.message)
  return { error: error?.message ?? null }
}
