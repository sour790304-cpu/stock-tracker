import { useState, useMemo } from 'react'
import { trendClass, fmtPct, fmtPrice, fmtChange, fmtVolume } from '../lib/format.js'

const TAG_ORDER = ['AI', '衛星', '泰國設廠', '其他', 'ETF']
const TAG_LABEL = { AI: 'AI 股', 衛星: 'SpaceX/衛星', 泰國設廠: '🇹🇭 泰國設廠', 其他: '其他', ETF: 'ETF' }

export default function OverviewTable({ stocks, selected, onSelect, live }) {
  const [filter, setFilter] = useState('全部')

  // 出現過的分類(依固定順序)
  const tags = useMemo(() => {
    const present = new Set()
    stocks.forEach((s) => (s.tags || []).forEach((t) => present.add(t)))
    return TAG_ORDER.filter((t) => present.has(t))
  }, [stocks])

  const shown = filter === '全部' ? stocks : stocks.filter((s) => (s.tags || []).includes(filter))

  return (
    <div className="card">
      <div className="chart-head">
        <h2>總覽</h2>
        <div className="filter-chips">
          <button className={filter === '全部' ? 'on' : ''} onClick={() => setFilter('全部')}>全部 {stocks.length}</button>
          {tags.map((t) => {
            const n = stocks.filter((s) => (s.tags || []).includes(t)).length
            return (
              <button key={t} className={filter === t ? 'on' : ''} onClick={() => setFilter(t)}>
                {TAG_LABEL[t] || t} {n}
              </button>
            )
          })}
        </div>
      </div>

      <div className="table-wrap">
        <table className="overview">
          <thead>
            <tr>
              <th>代號</th>
              <th>名稱</th>
              <th>分類</th>
              <th className="num">收盤</th>
              <th className="num">漲跌</th>
              <th className="num">漲跌幅</th>
              <th className="num">成交量</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const q = live?.[s.code]
              const price = q && q.price != null ? q.price : s.close
              const change = q && q.change != null ? q.change : s.change
              const pct = q && q.change_pct != null ? q.change_pct : s.change_pct
              const cls = trendClass(pct)
              return (
                <tr
                  key={s.code}
                  className={`row ${s.code === selected ? 'active' : ''}`}
                  onClick={() => onSelect(s.code)}
                >
                  <td className="code">{s.code}</td>
                  <td>{s.name}</td>
                  <td className="tags-cell">
                    {(s.tags || []).map((t) => (
                      <span key={t} className={`tag tag-${t}`}>{t}</span>
                    ))}
                  </td>
                  <td className={`num ${cls}`}>{fmtPrice(price)}{q && <span className="live-dot" title="即時">·</span>}</td>
                  <td className={`num ${cls}`}>{fmtChange(change)}</td>
                  <td className={`num ${cls}`}>{fmtPct(pct)}</td>
                  <td className="num vol">{fmtVolume(s.volume)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">點選任一列查看走勢圖與基本面 · 上方可依分類篩選</p>
    </div>
  )
}
