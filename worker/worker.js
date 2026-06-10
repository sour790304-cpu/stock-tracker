// Cloudflare Worker：代理證交所 MIS 盤中即時報價，並加上 CORS 讓 GitHub Pages 前端可直接抓。
// 部署後會得到一個 https://xxx.workers.dev 網址，填進前端 public/data/config.json 的 realtime_proxy。
//
// 前端呼叫範例：  https://xxx.workers.dev/?ex=tse_2330.tw|otc_4577.tw
// 回傳：{ updated, stocks:[{code,name,price,open,high,low,prevClose,change,change_pct,volume,time,bid,ask}] }

const num = (v) => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '' || s === '-' || s === '--') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const first = (v) => num((v || '').split('_')[0])
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100)

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'content-type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    const url = new URL(request.url)
    const ex = url.searchParams.get('ex')
    if (!ex) return new Response(JSON.stringify({ error: 'missing ex param' }), { status: 400, headers: cors })

    const api = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(ex)}&json=1&delay=0&_=${Date.now()}`
    try {
      const r = await fetch(api, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (stock-tracker realtime proxy)',
          Referer: 'https://mis.twse.com.tw/stock/fibest.jsp',
          Accept: 'application/json',
        },
        cf: { cacheTtl: 0 },
      })
      if (!r.ok) return new Response(JSON.stringify({ error: `MIS HTTP ${r.status}` }), { status: 502, headers: cors })
      const data = await r.json()
      const stocks = (data.msgArray || []).map((s) => {
        const price = num(s.z) ?? num(s.b?.split('_')[0]) ?? num(s.y) // 成交價，無成交時退而求其次
        const prevClose = num(s.y)
        const change = price != null && prevClose != null ? round2(price - prevClose) : null
        const change_pct = change != null && prevClose ? round2((change / prevClose) * 100) : null
        return {
          code: s.c, name: s.n,
          price, open: num(s.o), high: num(s.h), low: num(s.l), prevClose,
          change, change_pct,
          volume: num(s.v), // 累積成交量(張)
          time: s.t || null, date: s.d || null,
          bid: first(s.b), ask: first(s.a),
        }
      })
      return new Response(JSON.stringify({ updated: data.queryTime?.sysTime || null, stocks }), { headers: cors })
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: cors })
    }
  },
}
