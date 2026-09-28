import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders workspace markdown. Relative links to other .md files are rewritten to in-app routes,
 * resolved against the current document's location. Raw HTML in markdown is not rendered.
 */
export function Markdown({ source, docId, linkFor }: { source: string; docId: string; linkFor: (id: string) => string }) {
  const baseDir = docId.includes('/') ? docId.slice(0, docId.lastIndexOf('/')) : ''

  const resolve = (href: string): string | null => {
    const [rawPath, hash] = href.split('#')
    let path = rawPath
    try {
      path = decodeURIComponent(rawPath)
    } catch {
      /* keep the raw path */
    }
    if (!path.endsWith('.md')) return null
    const parts = (baseDir ? `${baseDir}/${path}` : path).split('/')
    const out: string[] = []
    for (const p of parts) {
      if (p === '..') out.pop()
      else if (p && p !== '.') out.push(p)
    }
    return linkFor(out.join('/')) + (hash ? `#${hash}` : '')
  }

  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = '', children }) => {
            if (/^https?:\/\//.test(href))
              return (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              )
            if (href.startsWith('#')) return <a href={href}>{children}</a>
            const target = resolve(href)
            return target ? <Link href={target}>{children}</Link> : <span className="mono">{children}</span>
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
