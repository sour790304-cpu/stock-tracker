import { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler,
} from 'chart.js'
import { loadData, fmtPrice } from '../lib/format.js'
import { sma } from '../lib/indicators.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

const DAILY_RANGES = [
  { key: '1M', label: '1 月', days: 22 },
  { key: '3M', label: '3 月', days: 66 },
  { key: 'ALL', label: '全部', days: Infinity },
]

const hhmm = (sec) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(sec * 1000))

export default function StockChart({ code, name, market, proxy }) {
  const [points, setPoints] = useState(null)   // 每日收盤歷史
  const [range, setRange] = useState('3M')
  const [error, setError] = useState(null)
  const [intra, setIntra] = useState(null)      // 當日分時 {points, prevClose}
  const [intraErr, setIntraErr] = useState(null)

  // 載入每日歷史
  useEffect(() => {
    let alive = true
    setPoints(null); setError(null)
    loadData(`history/${code}.json`)
      .then((d) => { if (alive) setPoints(d.points || []) })
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [code])

  // 1日分時：透過 proxy 抓 Yahoo 分鐘線
  useEffect(() => {
    if (range !== '1D' || !proxy) return
    let alive = true
    setIntra(null); setIntraErr(null)
    const symbol = `${code}${market === 'TWSE' ? '.TW' : '.TWO'}`
    fetch(`${proxy}${proxy.includes('?') ? '&' : '?'}chart=${encodeURIComponent(symbol)}&range=1d&interval=1m`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive) { if (d.error) setIntraErr(d.error); else setIntra(d) } })
      .catch((e) => { if (alive) setIntraErr(e.message) })
    return () => { alive = false }
  }, [range, code, market, proxy])

  const ranges = proxy ? [{ key: '1D', label: '當日' }, ...DAILY_RANGES] : DAILY_RANGES

  const Header = (
    <div className="chart-head">
      <h2>{name}（{code}）走勢</h2>
      <div className="range-toggle">
        {ranges.map((r) => (
          <button key={r.key} className={range === r.key ? 'on' : ''} onClick={() => setRange(r.key)}>{r.label}</button>
        ))}
      </div>
    </div>
  )

  // ---- 1日分時模式 ----
  if (range === '1D') {
    let body
    if (intraErr) body = <p className="empty">當日分時讀取失敗（{intraErr}）</p>
    else if (!intra) body = <p className="empty">載入中…</p>
    else if (!intra.points?.length) body = <p className="empty">當日尚無分時資料（非交易時段或剛開盤）</p>
    else {
      const labels = intra.points.map((p) => hhmm(p.t))
      const closes = intra.points.map((p) => p.c)
      const prev = intra.prevClose
      const lineColor = prev != null && closes.at(-1) >= prev ? '#d32f2f' : '#1b8a3a'
      const data = {
        labels,
        datasets: [
          { label: '成交價', data: closes, borderColor: lineColor, backgroundColor: lineColor + '22', borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 4, tension: 0.1, fill: true, order: 0 },
          ...(prev != null ? [{ label: '昨收', data: closes.map(() => prev), borderColor: '#bbb', borderWidth: 1, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 0, fill: false }] : []),
        ],
      }
      const options = {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 18, boxHeight: 2, font: { size: 11 }, color: '#888' } },
          tooltip: { callbacks: { title: (i) => labels[i[0].dataIndex], label: (it) => `${it.dataset.label} ${it.parsed.y == null ? '—' : fmtPrice(it.parsed.y)}` } },
        },
        scales: { x: { ticks: { maxTicksLimit: 7, color: '#888' }, grid: { display: false } }, y: { ticks: { color: '#888' }, grid: { color: '#eee' } } },
      }
      body = <div className="chart-box"><Line data={data} options={options} /></div>
    }
    return <div className="card">{Header}{body}</div>
  }

  // ---- 每日歷史模式 ----
  if (error) return <div className="card">{Header}<p className="empty">尚無歷史資料（{error}）</p></div>
  if (!points) return <div className="card">{Header}<p className="empty">載入中…</p></div>

  const days = DAILY_RANGES.find((r) => r.key === range).days
  const startIdx = days === Infinity ? 0 : Math.max(0, points.length - days)
  const sliced = points.slice(startIdx)
  const labels = sliced.map((p) => p.date.slice(5))
  const closes = sliced.map((p) => p.close)
  const lineColor = closes.length >= 2 && closes.at(-1) >= closes[0] ? '#d32f2f' : '#1b8a3a'

  const allCloses = points.map((p) => p.close)
  const ma = (period) => sma(allCloses, period).slice(startIdx)
  const maSet = (label, period, color) => ({ label, data: ma(period), borderColor: color, borderWidth: 1.2, pointRadius: 0, pointHoverRadius: 0, tension: 0.15, fill: false, spanGaps: true })

  const data = {
    labels,
    datasets: [
      { label: '收盤價', data: closes, borderColor: lineColor, backgroundColor: lineColor + '22', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, fill: true, order: 0 },
      maSet('MA5', 5, '#f5a623'),
      maSet('MA20', 20, '#2962ff'),
      maSet('MA60', 60, '#7b3ff2'),
    ],
  }
  const options = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 18, boxHeight: 2, font: { size: 11 }, color: '#888' } },
      tooltip: { callbacks: { title: (items) => sliced[items[0].dataIndex]?.date, label: (item) => `${item.dataset.label} ${item.parsed.y == null ? '—' : fmtPrice(item.parsed.y)}` } },
    },
    scales: { x: { ticks: { maxTicksLimit: 8, color: '#888' }, grid: { display: false } }, y: { ticks: { color: '#888' }, grid: { color: '#eee' } } },
  }

  return (
    <div className="card">
      {Header}
      {sliced.length === 0 ? <p className="empty">此區間無資料</p> : <div className="chart-box"><Line data={data} options={options} /></div>}
    </div>
  )
}
