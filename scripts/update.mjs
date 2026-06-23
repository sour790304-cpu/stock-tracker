// 每日更新主程式：抓 TWSE+TPEx → 過濾 watchlist → 寫 prices.json + 歷史 → 產生評論。
// 用法: npm run update   (GitHub Actions 每交易日傍晚自動執行)
//
// 行為重點(對應 SPEC 第 5 節)：
// - 偵測「今日無新資料」(休市/假日)：若抓到的 trading_date 不晚於既有 prices.json，預設略過不覆寫。
//   可加 --force 強制覆寫(測試用)。
// - 任一來源失敗時保留前一日資料，避免畫面空白。

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readJSON, writeJSON } from './lib/util.mjs'

// 自動載入專案根目錄的 .env（若存在），讓 ANTHROPIC_API_KEY 不必手動 export。
// 用手動解析並「覆蓋」既有變數：因為部分執行環境會預先注入空的 ANTHROPIC_API_KEY，
// 而 process.loadEnvFile 不會覆蓋既有值，故改自行解析。
import { readFileSync } from 'node:fs'
try {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env')
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (val) process.env[m[1]] = val // 只在 .env 有實值時覆蓋
  }
} catch { /* 無 .env 就略過 */ }
import { fetchTWSE, fetchTPEx, fetchYahooDaily } from './lib/markets.mjs'
import { buildRuleCommentary } from './commentary/ruleBased.mjs'
import { buildAICommentary } from './commentary/ai.mjs'
import { summarize } from '../src/lib/indicators.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'data')
const FORCE = process.argv.includes('--force')

async function main() {
  const watchlist = await readJSON(join(ROOT, 'config', 'watchlist.json'))
  if (!watchlist?.stocks?.length) throw new Error('讀不到 config/watchlist.json 或清單為空')

  const tracked = watchlist.stocks.filter((s) => s.track !== false)
  const twseCodes = new Set(tracked.filter((s) => s.market === 'TWSE').map((s) => s.code))
  const tpexCodes = new Set(tracked.filter((s) => s.market === 'TPEx').map((s) => s.code))
  console.log(`追蹤 ${tracked.length} 檔：上市 ${twseCodes.size}、上櫃 ${tpexCodes.size}`)

  // 分別抓取；任一來源失敗只記錄、不中斷(保留另一來源)
  let twse = []
  let tpex = []
  const errors = []
  if (twseCodes.size) {
    try { twse = await fetchTWSE(twseCodes); console.log(`  TWSE 取得 ${twse.length} 檔`) }
    catch (e) { errors.push(`TWSE: ${e.message}`); console.error(`  TWSE 失敗: ${e.message}`) }
  }
  if (tpexCodes.size) {
    try { tpex = await fetchTPEx(tpexCodes); console.log(`  TPEx 取得 ${tpex.length} 檔`) }
    catch (e) { errors.push(`TPEx: ${e.message}`); console.error(`  TPEx 失敗: ${e.message}`) }
  }

  let fetched = [...twse, ...tpex]
  if (fetched.length === 0) {
    console.error('兩個來源皆無資料，保留既有檔案，結束。')
    process.exitCode = 1
    return
  }

  // Yahoo 備援：官方 API(STOCK_DAY_ALL/TPEx)可能從 GitHub 機房 IP 被封鎖而失敗，
  // 對「本次沒抓到」的 watchlist 個股改用 Yahoo 日線補抓「當日真實收盤」(優先於沿用前一日)。
  {
    const got = new Set(fetched.map((s) => s.code))
    const need = tracked.filter((t) => !got.has(t.code))
    if (need.length) {
      console.log(`  官方來源缺 ${need.length} 檔，改用 Yahoo 日線備援…`)
      const yh = await fetchYahooDaily(need)
      if (yh.length) {
        fetched.push(...yh)
        console.log(`  Yahoo 補到 ${yh.length} 檔`)
      }
    }
  }

  // 把 watchlist 的分類資訊(tags/industry)併入每筆，供前端篩選
  const meta = new Map(tracked.map((s) => [s.code, s]))
  for (const s of fetched) {
    const m = meta.get(s.code)
    if (m) {
      s.tags = m.tags || []
      s.industry = m.industry || ''
      if (m.type) s.type = m.type
    }
  }

  // 依 watchlist 順序「重建」陣列(直接照 tracked 順序挑出對應個股，找不到的附在最後)。
  // 比用 sort 比較器 + (?? 999) 穩健：避免任何查找落空時把上市/上櫃排錯。
  const byCode = new Map(fetched.map((s) => [s.code, s]))
  const ordered = tracked.map((t) => byCode.get(t.code)).filter(Boolean)
  const extras = fetched.filter((s) => !tracked.some((t) => t.code === s.code))
  fetched = [...ordered, ...extras]

  // 補足缺漏：若某來源本次失敗(例如 TWSE 暫時抓不到)，用前一份資料補上缺的個股，
  // 避免把殘缺檔(只剩部分股)蓋掉完整檔。被補的標記 stale。
  const prevPrices = await readJSON(join(DATA, 'prices.json'))
  const prevByCode = new Map((prevPrices?.stocks || []).map((s) => [s.code, s]))
  const freshCodes = new Set(fetched.map((s) => s.code))
  const missing = tracked.filter((t) => !freshCodes.has(t.code))
  if (missing.length) {
    for (const t of missing) {
      const old = prevByCode.get(t.code)
      if (old) { fetched.push({ ...old, stale: true }); errors.push(`${t.code}(${t.name}) 本次未取得，沿用前一日`) }
      else errors.push(`${t.code}(${t.name}) 本次未取得且無前一日資料`)
    }
    // 補完後重新依 watchlist 順序排
    const bc = new Map(fetched.map((s) => [s.code, s]))
    fetched = tracked.map((t) => bc.get(t.code)).filter(Boolean)
      .concat(fetched.filter((s) => !tracked.some((t) => t.code === s.code)))
    console.warn(`  ⚠ 本次缺 ${missing.length} 檔(${missing.map((m) => m.code).join(',')})，已沿用前一日補足`)
  }

  const freshStocks = fetched.filter((s) => !s.stale)
  const tradingDate = mostCommonDate(freshStocks)
  console.log(`最新交易日：${tradingDate}（新資料 ${freshStocks.length} 檔${missing.length ? `、沿用 ${missing.length} 檔` : ''}）`)

  // 偵測無新資料：同交易日且既有資料「沒有 stale 殘留」才略過；
  // 若既有有 stale(前次某來源失敗沿用舊值),即使同交易日也重寫，以本次新資料修復。
  const prevHasStale = (prevPrices?.stocks || []).some((s) => s.stale)
  if (!FORCE && !prevHasStale && prevPrices?.trading_date && tradingDate && tradingDate <= prevPrices.trading_date) {
    console.log(`資料未更新(既有 ${prevPrices.trading_date} >= 抓取 ${tradingDate})，略過。加 --force 可強制覆寫。`)
    return
  }
  if (prevHasStale && tradingDate && tradingDate <= prevPrices.trading_date) {
    console.log(`既有資料含 stale 殘留，同交易日仍重寫以修復。`)
  }

  // 載入歷史(供評論判斷量比/新高低)
  const historyMap = {}
  for (const s of fetched) {
    historyMap[s.code] = (await readJSON(join(DATA, 'history', `${s.code}.json`), { code: s.code, points: [] })).points || []
  }

  // 計算技術指標(均線/乖離/量能/交叉)；stale(沿用前一日)的保留其既有指標
  for (const s of fetched) {
    if (s.stale) continue
    const past = (historyMap[s.code] || []).filter((p) => p.date < s.trading_date)
    const series = [...past, { close: s.close, volume: s.volume }]
    s.indicators = summarize(series)
  }
  const techText = freshStocks
    .filter((s) => s.indicators?.trend)
    .map((s) => {
      const ind = s.indicators
      const sig = ind.signals.length ? `，${ind.signals.join('、')}` : ''
      const bias = ind.bias20 != null ? `，月線乖離${ind.bias20 > 0 ? '+' : ''}${ind.bias20}%` : ''
      const vr = ind.vol_ratio != null ? `，量能${ind.vol_ratio}倍` : ''
      return `${s.name}(${s.code}) ${ind.trend}${bias}${vr}${sig}`
    })
    .join('\n')

  // 產生評論：先規則式，再(可選)AI；只用本次新資料(排除 stale)
  const rule = buildRuleCommentary(freshStocks, historyMap)

  // 把顯著技術訊號(交叉/月線季線得失)補進規則式重點
  for (const s of freshStocks) {
    for (const sig of s.indicators?.signals || []) {
      rule.highlights.push(`${s.name}(${s.code}) ${sig}`)
    }
  }

  const ai = await buildAICommentary(freshStocks, rule, techText)

  // 寫 prices.json
  const prices = {
    updated_at: new Date().toISOString(),
    trading_date: tradingDate,
    errors,
    stocks: fetched,
  }
  await writeJSON(join(DATA, 'prices.json'), prices)
  console.log(`  寫入 prices.json (${fetched.length} 檔)`)

  // append 歷史(去重同一交易日)；stale 不寫入歷史，避免污染
  for (const s of freshStocks) {
    const file = join(DATA, 'history', `${s.code}.json`)
    const hist = await readJSON(file, { code: s.code, name: s.name, market: s.market, points: [] })
    hist.name = s.name
    hist.market = s.market
    hist.points = (hist.points || []).filter((p) => p.date !== s.trading_date)
    hist.points.push({ date: s.trading_date, open: s.open, high: s.high, low: s.low, close: s.close, change_pct: s.change_pct, volume: s.volume })
    hist.points.sort((a, b) => (a.date < b.date ? -1 : 1))
    await writeJSON(file, hist)
  }
  console.log(`  更新 ${freshStocks.length} 個歷史檔`)

  // 寫評論檔 + 更新索引
  const commentary = {
    trading_date: tradingDate,
    generated_at: new Date().toISOString(),
    rule,
    ai, // 可能為 null
  }
  await writeJSON(join(DATA, 'commentary', `${tradingDate}.json`), commentary)

  const index = await readJSON(join(DATA, 'commentary', 'index.json'), { dates: [] })
  index.dates = Array.from(new Set([...(index.dates || []), tradingDate])).sort().reverse()
  await writeJSON(join(DATA, 'commentary', 'index.json'), index)
  console.log(`  寫入評論 ${tradingDate}.json${ai ? ' (含 AI)' : ' (規則式)'}`)

  console.log('完成。')
}

function mostCommonDate(stocks) {
  const counts = {}
  for (const s of stocks) if (s.trading_date) counts[s.trading_date] = (counts[s.trading_date] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
}

main().catch((e) => {
  console.error('更新失敗:', e.message)
  process.exitCode = 1
})
