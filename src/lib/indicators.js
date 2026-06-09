// 技術指標(純函式,無外部依賴)。前端(走勢圖)與後端(評論)共用。
// 概念參考常見台股技術分析(均線/乖離/量能/交叉)，公式自行實作。

/** 簡單移動平均，回傳與輸入等長陣列(資料不足處為 null) */
export function sma(values, period) {
  const out = new Array(values.length).fill(null)
  let sum = 0
  const q = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === null || v === undefined || Number.isNaN(v)) { q.push(0) } else { q.push(v) }
    sum += q[q.length - 1]
    if (q.length > period) sum -= q.shift()
    if (q.length === period) out[i] = Math.round((sum / period) * 100) / 100
  }
  return out
}

/** 乖離率(%)：(收盤 - 均線) / 均線 * 100 */
export function biasPct(close, ma) {
  if (close == null || ma == null || ma === 0) return null
  return Math.round(((close - ma) / ma) * 10000) / 100
}

/** 量能比：今量 / 前 period 日均量 */
export function volumeRatio(volumes, period) {
  if (volumes.length < period + 1) return null
  const prev = volumes.slice(-period - 1, -1).filter((v) => v != null && v > 0)
  if (prev.length < Math.ceil(period / 2)) return null
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length
  const today = volumes[volumes.length - 1]
  if (!avg || today == null) return null
  return Math.round((today / avg) * 100) / 100
}

/** 多空排列：ma5>ma20>ma60 多頭、ma5<ma20<ma60 空頭、其餘盤整 */
function arrangement(ma5, ma20, ma60) {
  if (ma5 == null || ma20 == null || ma60 == null) return null
  if (ma5 > ma20 && ma20 > ma60) return '多頭排列'
  if (ma5 < ma20 && ma20 < ma60) return '空頭排列'
  return '均線糾結/盤整'
}

/** 偵測最後一日 ma5 與 ma20 的黃金/死亡交叉 */
function maCross(ma5arr, ma20arr) {
  const n = ma5arr.length
  if (n < 2) return null
  const a0 = ma5arr[n - 2], a1 = ma5arr[n - 1]
  const b0 = ma20arr[n - 2], b1 = ma20arr[n - 1]
  if ([a0, a1, b0, b1].some((x) => x == null)) return null
  if (a0 <= b0 && a1 > b1) return '黃金交叉(MA5上穿MA20)'
  if (a0 >= b0 && a1 < b1) return '死亡交叉(MA5下穿MA20)'
  return null
}

/** 偵測今日是否站上/跌破某條均線 */
function lineCross(closes, maArr, label) {
  const n = closes.length
  if (n < 2 || maArr[n - 1] == null || maArr[n - 2] == null) return null
  const c0 = closes[n - 2], c1 = closes[n - 1]
  const m0 = maArr[n - 2], m1 = maArr[n - 1]
  if (c0 <= m0 && c1 > m1) return `站上${label}`
  if (c0 >= m0 && c1 < m1) return `跌破${label}`
  return null
}

/**
 * 綜合單檔技術面摘要。
 * @param {Array<{close:number,volume:number}>} points 由舊到新排序的歷史(含今日)
 */
export function summarize(points) {
  const closes = points.map((p) => p.close)
  const vols = points.map((p) => p.volume)
  const ma5a = sma(closes, 5)
  const ma20a = sma(closes, 20)
  const ma60a = sma(closes, 60)
  const last = (a) => a[a.length - 1]
  const close = last(closes)
  const ma5 = last(ma5a), ma20 = last(ma20a), ma60 = last(ma60a)

  const signals = []
  const cross = maCross(ma5a, ma20a)
  if (cross) signals.push(cross)
  const monthSig = lineCross(closes, ma20a, '月線(MA20)')
  if (monthSig) signals.push(monthSig)
  const quarterSig = lineCross(closes, ma60a, '季線(MA60)')
  if (quarterSig) signals.push(quarterSig)

  return {
    ma5, ma20, ma60,
    bias20: biasPct(close, ma20),
    vol_ratio: volumeRatio(vols, 20),
    trend: arrangement(ma5, ma20, ma60),
    signals,
  }
}
