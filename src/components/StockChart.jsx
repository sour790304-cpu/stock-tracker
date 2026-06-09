import { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler,
} from 'chart.js'
import { loadData, fmtPrice } from '../lib/format.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

const RANGES = [
  { key: '1M', label: '1 月', days: 22 },
  { key: '3M', label: '3 月', days: 66 },
  { key: 'ALL', label: '全部', days: Infinity },
]

export default function StockChart({ code, name }) {
  const [points, setPoints] = useState(null)
  const [range, setRange] = useState('3M')
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setPoints(null)
    setError(null)
    loadData(`history/${code}.json`)
      .then((d) => { if (alive) setPoints(d.points || []) })
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [code])

  if (error) return <div className="card"><h2>{name} 走勢</h2><p className="empty">尚無歷史資料（{error}）</p></div>
  if (!points) return <div className="card"><h2>{name} 走勢</h2><p className="empty">載入中…</p></div>

  const days = RANGES.find((r) => r.key === range).days
  const sliced = days === Infinity ? points : points.slice(-days)
  const labels = sliced.map((p) => p.date.slice(5)) // MM-DD
  const closes = sliced.map((p) => p.close)
  const lineColor = closes.length >= 2 && closes.at(-1) >= closes[0] ? '#d32f2f' : '#1b8a3a' // 漲紅跌綠

  const data = {
    labels,
    datasets: [{
      label: '收盤價',
      data: closes,
      borderColor: lineColor,
      backgroundColor: lineColor + '22',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.15,
      fill: true,
    }],
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => sliced[items[0].dataIndex]?.date,
          label: (item) => `收盤 ${fmtPrice(item.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 8, color: '#888' }, grid: { display: false } },
      y: { ticks: { color: '#888' }, grid: { color: '#eee' } },
    },
  }

  return (
    <div className="card">
      <div className="chart-head">
        <h2>{name}（{code}）走勢</h2>
        <div className="range-toggle">
          {RANGES.map((r) => (
            <button key={r.key} className={range === r.key ? 'on' : ''} onClick={() => setRange(r.key)}>{r.label}</button>
          ))}
        </div>
      </div>
      {sliced.length === 0 ? (
        <p className="empty">此區間無資料</p>
      ) : (
        <div className="chart-box"><Line data={data} options={options} /></div>
      )}
    </div>
  )
}
