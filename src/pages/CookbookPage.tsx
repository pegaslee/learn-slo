import { BusyApi } from '../sections/cookbook/BusyApi'
import { Freshness } from '../sections/cookbook/Freshness'
import { LowTrafficFixes } from '../sections/cookbook/LowTrafficFixes'
import { MultiRegion } from '../sections/cookbook/MultiRegion'
import { ThirdParty } from '../sections/cookbook/ThirdParty'

export function CookbookPage() {
  return (
    <>
      <p className="subtitle" style={{ marginTop: 24, color: 'var(--ink-2)' }}>
        The workbook's defaults assume a busy, single-homed, request-driven service. Real fleets
        aren't. Five common workload shapes, each with a live simulation of where the standard
        recipe holds, where it bends, and what to change.
      </p>
      <BusyApi />
      <MultiRegion />
      <Freshness />
      <LowTrafficFixes />
      <ThirdParty />
    </>
  )
}
