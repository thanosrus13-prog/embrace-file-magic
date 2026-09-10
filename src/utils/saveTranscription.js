import { supabase } from '@/integrations/supabase/client'
import { getS3UploadUrl, getS3DownloadUrl } from '@/lib/s3-storage.functions'

const BUCKET = 'audio_files'
const S3_SIZE_LIMIT = 25 * 1024 * 1024 // 25 MB — files at or below this go to S3.

// Uploads an audio file for the signed-in user and returns its URL.
// Files ≤ 25 MB are stored in AWS S3; larger files go to Supabase Storage.
export async function uploadAudioFile(file) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { url: null, error: 'not signed in' }

  if (file.size <= S3_SIZE_LIMIT) {
    return uploadToS3(file)
  }
  return uploadToSupabase(file, user.id)
}

// Uploads to AWS S3 via a pre-signed URL from the gateway.
async function uploadToS3(file) {
  try {
    const signed = await getS3UploadUrl({
      data: { fileName: file.name || 'audio.dat', contentType: file.type || 'audio/mpeg' },
    })
    if (!signed?.uploadUrl) return { url: null, error: signed?.error || 'Could not get S3 upload URL' }

    const putRes = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'audio/mpeg' },
      body: file,
    })
    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => 'unknown')
      console.error('S3 PUT failed', putRes.status, errText)
      return { url: null, error: `S3 upload failed [${putRes.status}]` }
    }

    // Get a signed download URL so AssemblyAI can fetch the audio.
    const dl = await getS3DownloadUrl({ data: { objectKey: signed.objectKey } })
    if (!dl?.downloadUrl) return { url: null, error: dl?.error || 'Could not get S3 download URL' }

    return { url: dl.downloadUrl, path: signed.objectKey, provider: 's3', error: null }
  } catch (e) {
    console.error('S3 upload failed:', e)
    return { url: null, error: e.message || 'S3 upload failed' }
  }
}

// Uploads to Supabase Storage (for files larger than 25 MB).
async function uploadToSupabase(file, userId) {
  const ext = (file.name?.split('.').pop() || 'dat').toLowerCase()
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

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

  return { url: signed.signedUrl, path, provider: 'supabase', error: null }
}

// Saves a finished transcription for the signed-in user.
// type: 'live' | 'uploaded_file'
export async function saveTranscription(type, text, audioUrl = null, storagePath = null, storageProvider = 'supabase') {
  const content = (text || '').trim()
  if (!content) return { error: 'empty' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not signed in' }

  const insert = {
    user_id: user.id,
    transcription_type: type,
    text_content: content,
    audio_url: audioUrl,
    storage_provider: storageProvider,
  }
  if (storagePath) insert.storage_path = storagePath

  const { error } = await supabase.from('transcriptions').insert(insert)

  if (error) console.error('Failed to save transcription:', error.message)
  return { error: error?.message ?? null }
}
