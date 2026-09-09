import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

export const Route = createFileRoute('/api-docs')({
  head: () => ({
    meta: [
      { title: 'Transcriptions API Docs | VibePost' },
      {
        name: 'description',
        content:
          'Interactive OpenAPI documentation for the VibePost transcriptions REST API: list, fetch and delete your transcripts.',
      },
      { property: 'og:title', content: 'Transcriptions API Docs | VibePost' },
      {
        property: 'og:description',
        content: 'Interactive OpenAPI reference for the VibePost transcriptions REST API.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: ApiDocs,
})

function ApiDocs() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null))
  }, [])

  useEffect(() => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css'
    document.head.appendChild(css)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js'
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      const w = window as unknown as { SwaggerUIBundle?: (o: unknown) => void }
      if (!w.SwaggerUIBundle || !containerRef.current) return
      w.SwaggerUIBundle({
        url: '/api/public/openapi.json',
        domNode: containerRef.current,
        docExpansion: 'list',
        persistAuthorization: true,
        tryItOutEnabled: true,
      })
    }
    document.body.appendChild(script)

    return () => {
      css.remove()
      script.remove()
    }
  }, [])

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-3xl font-bold">Transcriptions API</h1>
        <p className="mt-2 text-muted-foreground">
          REST endpoints for listing, fetching and deleting your transcripts. Authenticate with{' '}
          <code>Authorization: Bearer &lt;access token&gt;</code>.
        </p>
        {token ? (
          <div className="mt-4 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              You are signed in. Paste this token into “Authorize” to try requests:
            </p>
            <textarea
              readOnly
              value={token}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 h-24 w-full resize-none rounded-md border bg-muted p-2 font-mono text-xs"
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Sign in first to get a token you can use with “Authorize”.
          </p>
        )}
        <div ref={containerRef} className="mt-6" />
      </div>
    </main>
  )
}
