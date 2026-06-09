import { useEffect, useState } from 'react'
import { loadData, fmtPrice, fmtChange, trendClass } from '../lib/format.js'

export default function Picks() {
  const [index, setIndex] = useState(null)
  const [date, setDate] = useState(null)
  const [data, setData] = useState(null)

  useEffect(() => {
    loadData('picks/index.json')
      .then((d) => { setIndex(d.dates || []); if (d.dates?.length) setDate(d.dates[0]) })
      .catch(() => setIndex([]))
  }, [])

  useEffect(() => {
    if (!date) return
    setData(null)
    loadData(`picks/${date}.json`).then(setData).catch(() => setData(null))
  }, [date])

  if (index === null) return null
  if (index.length === 0) return null

  return (
    <div className="card picks-card">
      <div className="chart-head">
        <h2>📰 明日觀察清單 <span className="picks-sub">新聞驅動 · AI 篩選</span></h2>
        {index.length > 1 && (
          <select className="date-select" value={date || ''} onChange={(e) => setDate(e.target.value)}>
            {index.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {!data ? (
        <p className="empty">載入中…</p>
      ) : data.picks.length === 0 ? (
        <p className="empty">今日新聞未篩出明確催化的個股</p>
      ) : (
        <>
          <p className="picks-meta">{data.for_date} · 掃描 {data.news_count} 則新聞 · 排除已追蹤股</p>
          <div className="picks-grid">
            {data.picks.map((p) => {
              const cls = trendClass(p.change)
              return (
                <div className="pick" key={p.code}>
                  <div className="pick-top">
                    <div>
                      <span className="pick-name">{p.name}</span>
                      <span className="pick-code">{p.code} · {p.market === 'TWSE' ? '上市' : '上櫃'}</span>
                    </div>
                    <div className="pick-price">
                      <span className={`num ${cls}`}>{fmtPrice(p.close)}</span>
                      <span className={`num ${cls} pick-chg`}>{fmtChange(p.change)}</span>
                    </div>
                  </div>
                  {p.sentiment && <span className={`tag ${p.sentiment === '利多' ? 'sent-up' : p.sentiment === '利空' ? 'sent-down' : 'sent-flat'}`}>{p.sentiment}</span>}
                  <p className="pick-line"><b>看點</b>{p.reason}</p>
                  <p className="pick-line"><b>催化</b>{p.catalyst}</p>
                  <p className="pick-line pick-risk"><b>風險</b>{p.risk}</p>
                  {p.news_link && (
                    <a className="pick-news" href={p.news_link} target="_blank" rel="noreferrer">📎 {p.news_title || '相關新聞'}</a>
                  )}
                </div>
              )
            })}
          </div>
          <p className="picks-disclaimer">⚠️ {data.disclaimer}</p>
        </>
      )}
    </div>
  )
}
