// 盤中即時報價：透過 Cloudflare Worker proxy 抓證交所 MIS。

/** 是否為台股交易時段(台北 週一~五 09:00–13:30) */
export function isMarketOpen(now = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (t) => f.find((p) => p.type === t)?.value
  const wd = get('weekday')
  if (['Sat', 'Sun'].includes(wd)) return false
  let hh = parseInt(get('hour'), 10)
  if (hh === 24) hh = 0
  const mm = parseInt(get('minute'), 10)
  const mins = hh * 60 + mm
  return mins >= 9 * 60 && mins <= 13 * 60 + 30 // 09:00–13:30
}

/** 由 watchlist 個股(含 market)建立 MIS 的 ex_ch 字串 */
function buildEx(stocks) {
  return stocks.map((s) => `${s.market === 'TWSE' ? 'tse' : 'otc'}_${s.code}.tw`).join('|')
}

/**
 * 抓即時報價。
 * @returns {Promise<{time:string|null, map:Object}>} map: { code: {price,change,change_pct,volume,time,bid,ask} }
 */
export async function fetchRealtime(proxy, stocks) {
  const url = `${proxy}${proxy.includes('?') ? '&' : '?'}ex=${encodeURIComponent(buildEx(stocks))}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`proxy HTTP ${res.status}`)
  const data = await res.json()
  const map = {}
  let time = data.updated || null
  for (const s of data.stocks || []) {
    map[s.code] = s
    if (s.time) time = s.time
  }
  return { time, map }
}
