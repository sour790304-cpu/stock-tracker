// 個股基本面卡片，資料來自 fundamentals.json（非即時、僅供參考）。

const RATING_CLASS = (r = '') => {
  if (r.includes('核心') || r.includes('持有')) return 'r-core'
  if (r.includes('題材') || r.includes('投機') || r.includes('虧損') || r.includes('高風險')) return 'r-risk'
  if (r.includes('估值') || r.includes('偏高') || r.includes('落差')) return 'r-high'
  return 'r-neutral'
}

function Field({ label, value }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="f-field">
      <span className="f-label">{label}</span>
      <span className="f-value">{value}</span>
    </div>
  )
}

export default function FundamentalsCard({ data }) {
  if (!data) return null
  const isETF = data.type === 'ETF'

  return (
    <div className="card">
      <div className="f-head">
        <h2>基本面 — {data.name}</h2>
        {data.rating && <span className={`rating ${RATING_CLASS(data.rating)}`}>{data.rating}</span>}
      </div>
      <p className="f-industry">{data.industry}</p>

      <div className="f-grid">
        {isETF ? (
          <>
            <Field label="淨值" value={data.nav} />
            <Field label="規模" value={data.aum} />
            <Field label="上市日" value={data.listed} />
            <Field label="費用" value={data.expense_ratio} />
            <Field label="配息" value={data.dividend} />
          </>
        ) : (
          <>
            <Field label="EPS(2025)" value={data.eps_2025} />
            <Field label="EPS(近四季)" value={data.eps_ttm} />
            <Field label="本益比" value={data.pe} />
            <Field label="毛利率" value={data.gross_margin} />
            <Field label="營收YoY" value={data.rev_yoy} />
            <Field label="殖利率" value={data.dividend_yield} />
            <Field label="市值" value={data.market_cap} />
          </>
        )}
      </div>

      {data.top_holdings && <p className="f-block"><b>主要持股：</b>{data.top_holdings}</p>}
      {data.theme && <p className="f-block"><b>題材：</b>{data.theme}</p>}
      {data.competitive_position && <p className="f-block"><b>競爭地位：</b>{data.competitive_position}</p>}
      {data.risk && <p className="f-block f-risk"><b>風險：</b>{data.risk}</p>}
      {data.notes && <p className="f-note">註：{data.notes}</p>}
    </div>
  )
}
