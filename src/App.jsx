import { useEffect, useState } from 'react'
import OverviewTable from './components/OverviewTable.jsx'
import StockChart from './components/StockChart.jsx'
import FundamentalsCard from './components/FundamentalsCard.jsx'
import Commentary from './components/Commentary.jsx'
import { loadData, fmtDateTime } from './lib/format.js'

export default function App() {
  const [prices, setPrices] = useState(null)
  const [fundamentals, setFundamentals] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([loadData('prices.json'), loadData('fundamentals.json')])
      .then(([p, f]) => {
        setPrices(p)
        setFundamentals(f)
        if (p.stocks?.length) setSelected(p.stocks[0].code)
      })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="state">資料載入失敗：{error}<br />請先執行 <code>npm run update</code> 產生資料。</div>
  if (!prices) return <div className="state">載入中…</div>

  const current = prices.stocks.find((s) => s.code === selected)
  const fund = fundamentals?.stocks?.[selected]

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>台股每日追蹤</h1>
          <p className="subtitle">收盤後追蹤與回顧 · 非即時報價</p>
        </div>
        <div className="updated">
          <div>交易日 <b>{prices.trading_date || '—'}</b></div>
          <div className="muted">更新於 {fmtDateTime(prices.updated_at)}</div>
        </div>
      </header>

      {prices.errors?.length > 0 && (
        <div className="banner-warn">部分來源更新異常：{prices.errors.join('；')}（顯示為前一次成功資料）</div>
      )}

      <main className="layout">
        <section className="col-main">
          <OverviewTable stocks={prices.stocks} selected={selected} onSelect={setSelected} />
          {current && <StockChart code={current.code} name={current.name} />}
        </section>
        <aside className="col-side">
          <Commentary />
          {fund && <FundamentalsCard data={fund} />}
        </aside>
      </main>

      <footer className="footer">
        資料來自公開來源（TWSE 證交所、TPEx 櫃買中心），僅供參考，非投資建議。
        {fundamentals?.as_of && <> 基本面資料截至 {fundamentals.as_of}，數字含估算與來源差異，下單前請複核。</>}
      </footer>
    </div>
  )
}
