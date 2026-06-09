import { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler,
} from 'chart.js'
import { loadData, fmtPrice } from '../lib/format.js'
import { sma } from '../lib/indicators.js'

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
  const startIdx = days === Infinity ? 0 : Math.max(0, points.length - days)
  const sliced = points.slice(startIdx)
  const labels = sliced.map((p) => p.date.slice(5)) // MM-DD
  const closes = sliced.map((p) => p.close)
  const lineColor = closes.length >= 2 && closes.at(-1) >= closes[0] ? '#d32f2f' : '#1b8a3a' // 漲紅跌綠

  // 均線：用完整歷史計算後再切到目前區間，確保區間開頭的均線值正確
  const allCloses = points.map((p) => p.close)
  const ma = (period) => sma(allCloses, period).slice(startIdx)
  const maSet = (label, period, color) => ({
    label, data: ma(period), borderColor: color, borderWidth: 1.2,
    pointRadius: 0, pointHoverRadius: 0, tension: 0.15, fill: false, spanGaps: true,
  })

  const data = {
    labels,
    datasets: [
      {
        label: '收盤價',
        data: closes,
        borderColor: lineColor,
        backgroundColor: lineColor + '22',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.15,
        fill: true,
        order: 0,
      },
      maSet('MA5', 5, '#f5a623'),
      maSet('MA20', 20, '#2962ff'),
      maSet('MA60', 60, '#7b3ff2'),
    ],
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: { boxWidth: 18, boxHeight: 2, font: { size: 11 }, color: '#888', usePointStyle: false },
      },
      tooltip: {
        callbacks: {
          title: (items) => sliced[items[0].dataIndex]?.date,
          label: (item) => `${item.dataset.label} ${item.parsed.y == null ? '—' : fmtPrice(item.parsed.y)}`,
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
