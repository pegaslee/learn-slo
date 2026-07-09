import { GoodSli } from '../sections/sli/GoodSli'
import { LatencySli } from '../sections/sli/LatencySli'
import { Promql } from '../sections/sli/Promql'
import { VantagePoints } from '../sections/sli/VantagePoints'

export function SliPage() {
  return (
    <>
      <p className="subtitle" style={{ marginTop: 24, color: 'var(--ink-2)' }}>
        Burn-rate alerting is only as good as the ratio underneath it. This page is about the
        ratio: what to count, where to measure it, how to handle latency, and the PromQL that
        implements all of it.
      </p>
      <GoodSli />
      <VantagePoints />
      <LatencySli />
      <Promql />
    </>
  )
}
