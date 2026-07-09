import { BurnRates } from '../sections/BurnRates'
import { Intro } from '../sections/Intro'
import { Limitations } from '../sections/Limitations'
import { MultiBurnRate } from '../sections/MultiBurnRate'
import { MultiWindow } from '../sections/MultiWindow'
import { NaiveAlerting } from '../sections/NaiveAlerting'
import { SingleWindow } from '../sections/SingleWindow'

const TOC = [
  { id: 'intro', label: '1 · SLOs & error budgets' },
  { id: 'naive', label: '2 · Why naive alerting fails' },
  { id: 'burn-rates', label: '3 · Burn rates' },
  { id: 'single-window', label: '4 · Burn-rate alerts' },
  { id: 'multi-window', label: '5 · Multiwindow' },
  { id: 'multi-burn-rate', label: '6 · Multi-burn-rate' },
  { id: 'limitations', label: '7 · Limitations' },
]

export function LearnPage() {
  return (
    <>
      <nav className="toc" aria-label="Sections">
        {TOC.map((t) => (
          <button
            key={t.id}
            className="toc-link"
            onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' })}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <Intro />
      <NaiveAlerting />
      <BurnRates />
      <SingleWindow />
      <MultiWindow />
      <MultiBurnRate />
      <Limitations />
    </>
  )
}
