import { useState } from 'react'

interface Props {
  title?: string
  code: string
}

/** Plain monospace code block with a copy button — no highlighter dependency. */
export function CodeBlock({ title, code }: Props) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be unavailable (e.g. non-secure context); ignore.
    }
  }
  return (
    <div className="code-block">
      {title && <div className="code-title">{title}</div>}
      <button className="copy-btn" onClick={copy}>
        {copied ? 'copied ✓' : 'copy'}
      </button>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}
