import { useEffect, useState } from 'react'
import { loadData } from '../lib/format.js'

export default function Commentary() {
  const [index, setIndex] = useState(null)
  const [date, setDate] = useState(null)
  const [entry, setEntry] = useState(null)

  useEffect(() => {
    loadData('commentary/index.json')
      .then((d) => {
        setIndex(d.dates || [])
        if (d.dates?.length) setDate(d.dates[0])
      })
      .catch(() => setIndex([]))
  }, [])

  useEffect(() => {
    if (!date) return
    setEntry(null)
    loadData(`commentary/${date}.json`).then(setEntry).catch(() => setEntry(null))
  }, [date])

  if (index === null) return <div className="card"><h2>當日評論</h2><p className="empty">載入中…</p></div>
  if (index.length === 0) return <div className="card"><h2>當日評論</h2><p className="empty">尚無評論</p></div>

  return (
    <div className="card">
      <div className="chart-head">
        <h2>當日評論</h2>
        <select className="date-select" value={date || ''} onChange={(e) => setDate(e.target.value)}>
          {index.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {!entry ? (
        <p className="empty">載入中…</p>
      ) : (
        <>
          {entry.ai && (
            <div className="commentary-ai">
              <span className="badge">AI 短評</span>
              {entry.ai.split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}
          <div className="commentary-rule">
            {entry.ai && <span className="badge badge-rule">數據摘要</span>}
            <p className="summary">{entry.rule?.summary}</p>
            {entry.rule?.highlights?.length > 0 && (
              <ul className="highlights">
                {entry.rule.highlights.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
