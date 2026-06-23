// TWSE(上市) 與 TPEx(上櫃) 資料抓取與正規化。
// 兩個來源欄位不同，各寫一個 parser，輸出統一結構(見 SPEC 第 6 節)。

import { cleanNumber, rocToISO, changePct, fetchJSON, sleep } from './util.mjs'

const TWSE_ALL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
const TPEX_ALL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes'

/**
 * 統一個股資料結構。
 * @typedef {Object} StockQuote
 * @property {string} code
 * @property {string} name
 * @property {'TWSE'|'TPEx'} market
 * @property {string} trading_date  YYYY-MM-DD
 * @property {number|null} open,high,low,close,change,change_pct
 * @property {number|null} volume   成交股數
 * @property {number|null} value    成交金額
 * @property {number|null} transactions 成交筆數
 */

/** 把 TWSE STOCK_DAY_ALL 的一列正規化 */
function normalizeTWSE(row) {
  const close = cleanNumber(row.ClosingPrice)
  const change = cleanNumber(row.Change)
  return {
    code: row.Code,
    name: row.Name,
    market: 'TWSE',
    trading_date: rocToISO(row.Date),
    open: cleanNumber(row.OpeningPrice),
    high: cleanNumber(row.HighestPrice),
    low: cleanNumber(row.LowestPrice),
    close,
    change,
    change_pct: changePct(close, change),
    volume: cleanNumber(row.TradeVolume),
    value: cleanNumber(row.TradeValue),
    transactions: cleanNumber(row.Transaction),
  }
}

/** 把 TPEx mainboard daily close 的一列正規化 */
function normalizeTPEx(row) {
  const close = cleanNumber(row.Close)
  const change = cleanNumber(row.Change)
  return {
    code: row.SecuritiesCompanyCode,
    name: (row.CompanyName || '').trim(),
    market: 'TPEx',
    trading_date: rocToISO(row.Date),
    open: cleanNumber(row.Open),
    high: cleanNumber(row.High),
    low: cleanNumber(row.Low),
    close,
    change,
    change_pct: changePct(close, change),
    volume: cleanNumber(row.TradingShares),
    value: cleanNumber(row.TransactionAmount),
    transactions: cleanNumber(row.TransactionNumber),
  }
}

export { normalizeTWSE, normalizeTPEx }

/**
 * 抓取 watchlist 中所有上市股票的當日收盤。
 * 策略：抓一次全市場，再過濾出需要的代號(效率最高)。
 * @param {Set<string>} codes 需要的上市代號
 */
export async function fetchTWSE(codes) {
  const all = await fetchJSON(TWSE_ALL, { label: 'TWSE STOCK_DAY_ALL', timeoutMs: 90000 })
  if (!Array.isArray(all)) throw new Error('TWSE 回傳格式非陣列')
  return all
    .filter((r) => codes.has(r.Code))
    .map(normalizeTWSE)
    .filter((s) => s.close !== null) // 無成交(停牌等)略過
}

/**
 * 抓取 watchlist 中所有上櫃股票的當日收盤。
 * @param {Set<string>} codes 需要的上櫃代號
 */
export async function fetchTPEx(codes) {
  const all = await fetchJSON(TPEX_ALL, { label: 'TPEx daily_close_quotes', timeoutMs: 90000 })
  if (!Array.isArray(all)) throw new Error('TPEx 回傳格式非陣列')
  return all
    .filter((r) => codes.has(r.SecuritiesCompanyCode))
    .map(normalizeTPEx)
    .filter((s) => s.close !== null)
}

/**
 * Yahoo Finance 日線備援：當證交所/櫃買 OpenAPI 從某些環境(如 GitHub Actions 機房 IP)
 * 被封鎖時，改用 Yahoo 取得個股最新「已收盤」日線。上市 .TW、上櫃 .TWO。
 * @param {Array<{code,name,market}>} stocks 要補抓的個股
 * @returns {Promise<Array>} 正規化後的 StockQuote(僅成功者)
 */
export async function fetchYahooDaily(stocks) {
  const out = []
  const toDate = (ts) => new Date(ts * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
  for (const s of stocks) {
    const sym = `${s.code}${s.market === 'TWSE' ? '.TW' : '.TWO'}`
    try {
      const d = await fetchJSON(
        `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=5d&interval=1d`,
        { label: `Yahoo ${sym}`, timeoutMs: 30000 }
      )
      const r = d?.chart?.result?.[0]
      const q = r?.indicators?.quote?.[0]
      const ts = r?.timestamp
      if (!r || !q || !ts?.length) continue
      // 取最後一個有收盤價的交易日
      let i = ts.length - 1
      while (i >= 0 && (q.close?.[i] == null)) i--
      if (i < 0) continue
      const close = Math.round(q.close[i] * 100) / 100
      // 前一交易日收盤(算漲跌)
      let pj = i - 1
      while (pj >= 0 && q.close?.[pj] == null) pj--
      const prev = pj >= 0 ? q.close[pj] : (r.meta?.chartPreviousClose ?? null)
      const change = prev != null ? Math.round((close - prev) * 100) / 100 : null
      out.push({
        code: s.code, name: s.name, market: s.market,
        trading_date: toDate(ts[i]),
        open: q.open?.[i] != null ? Math.round(q.open[i] * 100) / 100 : null,
        high: q.high?.[i] != null ? Math.round(q.high[i] * 100) / 100 : null,
        low: q.low?.[i] != null ? Math.round(q.low[i] * 100) / 100 : null,
        close,
        change,
        change_pct: change != null && prev ? Math.round((change / prev) * 10000) / 100 : null,
        volume: q.volume?.[i] ?? null,
        value: null, transactions: null,
        source: 'yahoo',
      })
    } catch (e) {
      console.warn(`  [yahoo] ${sym} 失敗: ${e.message}`)
    }
    await sleep(300)
  }
  return out
}

/**
 * 抓全市場清單(上市+上櫃)，建立 名稱→{code,market,close} 與 code 集合。
 * 用於把新聞中的「公司名」對回正確股號，並過濾不存在的代號。
 */
export async function fetchAllLists() {
  const [tw, tp] = await Promise.all([
    fetchJSON(TWSE_ALL, { label: 'TWSE all', timeoutMs: 90000 }),
    fetchJSON(TPEX_ALL, { label: 'TPEx all', timeoutMs: 90000 }),
  ])
  const byName = new Map()
  const byCode = new Map()
  for (const r of Array.isArray(tw) ? tw : []) {
    const o = { code: r.Code, name: r.Name, market: 'TWSE', close: cleanNumber(r.ClosingPrice), change: cleanNumber(r.Change) }
    byCode.set(r.Code, o); byName.set(r.Name, o)
  }
  for (const r of Array.isArray(tp) ? tp : []) {
    const nm = (r.CompanyName || '').trim()
    const o = { code: r.SecuritiesCompanyCode, name: nm, market: 'TPEx', close: cleanNumber(r.Close), change: cleanNumber(r.Change) }
    byCode.set(r.SecuritiesCompanyCode, o); byName.set(nm, o)
  }
  return { byName, byCode }
}
