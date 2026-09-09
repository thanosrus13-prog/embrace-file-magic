import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'

export type ApiAuthResult =
  | { ok: true; supabase: SupabaseClient<Database>; userId: string }
  | { ok: false; response: Response }

export function jsonError(status: number, error: string, details?: unknown) {
  return Response.json({ error, ...(details ? { details } : {}) }, { status })
}

function isNewSupabaseApiKey(value: string) {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_')
}

/**
 * Authenticates an incoming REST request using the `Authorization: Bearer <supabase access token>`
 * header and returns a Supabase client scoped to that user (RLS applies).
 */
export async function authenticateRequest(request: Request): Promise<ApiAuthResult> {
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']
  if (!url || !key) {
    return { ok: false, response: jsonError(500, 'Server is not configured for database access') }
  }

  const header = request.headers.get('Authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    return { ok: false, response: jsonError(401, 'Missing bearer token') }
  }

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers)
        if (isNewSupabaseApiKey(key) && headers.get('Authorization') === `Bearer ${key}`) {
          headers.delete('Authorization')
        }
        headers.set('apikey', key)
        headers.set('Authorization', `Bearer ${token}`)
        return fetch(input, { ...init, headers })
      },
    },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    return { ok: false, response: jsonError(401, 'Invalid or expired token') }
  }

  return { ok: true, supabase, userId: data.user.id }
}
