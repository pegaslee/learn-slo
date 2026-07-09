import { useEffect, useState } from 'react'

export type Route = 'learn' | 'sli' | 'cookbook' | 'playground' | 'report-card'

const ROUTES: Route[] = ['learn', 'sli', 'cookbook', 'playground', 'report-card']

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').replace(/\/$/, '')
  return (ROUTES as string[]).includes(path) ? (path as Route) : 'learn'
}

/** Minimal hash router: '#/cookbook' → 'cookbook'. Works on GitHub Pages. */
export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const navigate = (r: Route) => {
    window.location.hash = `/${r}`
  }
  return [route, navigate]
}
