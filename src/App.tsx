import { BurnRates } from './sections/BurnRates'
import { Intro } from './sections/Intro'
import { Limitations } from './sections/Limitations'
import { MultiBurnRate } from './sections/MultiBurnRate'
import { MultiWindow } from './sections/MultiWindow'
import { NaiveAlerting } from './sections/NaiveAlerting'
import { Playground } from './sections/Playground'
import { SingleWindow } from './sections/SingleWindow'

const TOC = [
  { id: 'intro', label: '1 · SLOs & error budgets' },
  { id: 'naive', label: '2 · Why naive alerting fails' },
  { id: 'burn-rates', label: '3 · Burn rates' },
  { id: 'single-window', label: '4 · Burn-rate alerts' },
  { id: 'multi-window', label: '5 · Multiwindow' },
  { id: 'multi-burn-rate', label: '6 · Multi-burn-rate' },
  { id: 'limitations', label: '7 · Limitations' },
  { id: 'playground', label: '8 · Playground' },
]

export function App() {
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
          . Every chart below is a live simulation — drag the sliders and watch the alerts react.
        </p>
        <nav className="toc" aria-label="Sections">
          {TOC.map((t) => (
            <a key={t.id} href={`#${t.id}`}>
              {t.label}
            </a>
          ))}
        </nav>
      </header>
      <main>
        <Intro />
        <NaiveAlerting />
        <BurnRates />
        <SingleWindow />
        <MultiWindow />
        <MultiBurnRate />
        <Limitations />
        <Playground />
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
