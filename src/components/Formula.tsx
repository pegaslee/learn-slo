import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useMemo } from 'react'

interface Props {
  tex: string
  display?: boolean
}

/** Render a LaTeX formula with KaTeX. */
export function Formula({ tex, display = true }: Props) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: display, throwOnError: false }),
    [tex, display],
  )
  return (
    <span
      className={display ? 'formula-block' : 'formula-inline'}
      style={display ? { display: 'block' } : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
