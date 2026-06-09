// TWSE(上市) 與 TPEx(上櫃) 資料抓取與正規化。
// 兩個來源欄位不同，各寫一個 parser，輸出統一結構(見 SPEC 第 6 節)。

import { cleanNumber, rocToISO, changePct, fetchJSON } from './util.mjs'

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
