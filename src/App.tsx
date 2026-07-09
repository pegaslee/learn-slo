import { useHashRoute, type Route } from './lib/router'
import { CookbookPage } from './pages/CookbookPage'
import { LearnPage } from './pages/LearnPage'
import { ReportCardPage } from './pages/ReportCardPage'
import { SliPage } from './pages/SliPage'
import { Playground } from './sections/Playground'

const TABS: { id: Route; label: string; blurb: string }[] = [
  { id: 'learn', label: 'Learn', blurb: 'The MWMBR tutorial — start here' },
  { id: 'sli', label: 'SLIs & Queries', blurb: 'Choosing what to measure, and the PromQL to do it' },
  { id: 'cookbook', label: 'Cookbook', blurb: 'Recommended policies per workload' },
  { id: 'playground', label: 'Playground', blurb: 'Free-form simulator' },
  { id: 'report-card', label: 'Report Card', blurb: 'Score your alert policy' },
]

export function App() {
  const [route, navigate] = useHashRoute()

  return (
    <div className="container">
      <header className="site-header">
        <h1>Alerting on SLOs, interactively</h1>
        <p className="subtitle">
          A hands-on guide to <strong>multiwindow, multi-burn-rate (MWMBR)</strong> alerting, the
          approach recommended in{' '}
          <a href="https://sre.google/workbook/alerting-on-slos/" target="_blank" rel="noreferrer">
            Chapter 5 of the Google SRE Workbook
          </a>
          . Every chart is a live simulation — drag the sliders and watch the alerts react.
        </p>
        <nav className="tab-nav" aria-label="Pages">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${route === t.id ? 'active' : ''}`}
              title={t.blurb}
              onClick={() => navigate(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {route === 'learn' && <LearnPage />}
        {route === 'sli' && <SliPage />}
        {route === 'cookbook' && <CookbookPage />}
        {route === 'playground' && <Playground />}
        {route === 'report-card' && <ReportCardPage />}
      </main>
      <footer className="site-footer">
        Built as a learning companion to{' '}
        <a href="https://sre.google/workbook/alerting-on-slos/" target="_blank" rel="noreferrer">
          The Site Reliability Workbook, Chapter 5: Alerting on SLOs
        </a>{' '}
        (Google, O'Reilly). Simulations run entirely in your browser at 1-minute resolution with
        seeded randomness — same settings, same picture.
      </footer>
    </div>
  )
}
