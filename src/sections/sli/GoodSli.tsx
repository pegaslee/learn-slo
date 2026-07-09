import { Formula } from '../../components/Formula'

const EXCLUSIONS = [
  {
    what: 'Health checks & load-balancer probes',
    call: 'Exclude',
    gotcha: 'They can be 30%+ of a quiet service’s traffic — enough to dilute a real outage below your page threshold.',
  },
  {
    what: '4xx client errors',
    call: 'Usually exclude, but…',
    gotcha: 'A bad deploy that suddenly returns 404 for valid URLs looks like “client error.” Watch the 4xx *rate* separately; a step change is your bug.',
  },
  {
    what: '429 rate-limit responses',
    call: 'Depends on who you ask',
    gotcha: 'Deliberate load shedding is “working as intended” to you and “down” to the user you shed. Decide per endpoint, write it down.',
  },
  {
    what: 'Bot / scraper traffic',
    call: 'Exclude if identifiable',
    gotcha: 'Bots retry aggressively during incidents — they inflate the denominator and the numerator differently, distorting the ratio.',
  },
  {
    what: 'Canary / staging traffic',
    call: 'Exclude',
    gotcha: 'A failing canary is supposed to fail — that’s the canary working. Alert on it separately.',
  },
  {
    what: 'Client retries',
    call: 'Count final outcome per logical request if you can',
    gotcha: 'Counting per attempt: 3 retries then success = 75% error rate for one happy user. Counting only final outcomes: silent dependency pain.',
  },
]

export function GoodSli() {
  return (
    <section className="lesson" id="good-sli">
      <h2>
        <span className="kicker">1 · The foundation</span>
        A good SLI is a ratio of valid events
      </h2>
      <p>
        Everything on the Learn page assumed you already have a trustworthy error ratio. That’s the
        hard part. The SRE Workbook’s discipline: express every SLI as
      </p>
      <Formula tex="\text{SLI} = \frac{\text{good events}}{\text{valid events}}" />
      <p>
        Both words carry weight. <strong>Good</strong> must reflect the user’s experience, not
        your server’s opinion of itself. <strong>Valid</strong> is a filter you choose — and every
        inclusion or exclusion changes what your burn rate means. The most common alerting bugs
        are not in the alert expression; they’re in the denominator.
      </p>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="rules">
          <thead>
            <tr>
              <th>Traffic</th>
              <th>Typical call</th>
              <th>The gotcha</th>
            </tr>
          </thead>
          <tbody>
            {EXCLUSIONS.map((e) => (
              <tr key={e.what}>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--ink-1)' }}>{e.what}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{e.call}</td>
                <td>{e.gotcha}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="callout">
        <p>
          <strong>Write the definition down next to the alert.</strong> Six months from now,
          someone will stare at a burn-rate page and need to know whether it counts 429s. The SLI
          definition — filters, vantage point, retry handling — is part of the alert, not tribal
          knowledge.
        </p>
      </div>
    </section>
  )
}
