// 回補歷史資料：讓走勢圖一開始就有資料，不必等每日 cron 慢慢累積。
// TWSE 用 STOCK_DAY(每月/個股)、TPEx 用 tradingStock(每月/個股)。
// 用法: npm run backfill            預設回補近 3 個月
//        node scripts/backfill.mjs --months=6

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readJSON, writeJSON, cleanNumber, rocToISO, changePct, fetchJSON, sleep } from './lib/util.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'data')
const monthsArg = process.argv.find((a) => a.startsWith('--months='))
const MONTHS = monthsArg ? parseInt(monthsArg.split('=')[1], 10) : 3
const codesArg = process.argv.find((a) => a.startsWith('--codes='))
const ONLY = codesArg ? new Set(codesArg.split('=')[1].split(',').map((c) => c.trim())) : null

function recentMonths(n) {
  const out = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ y: d.getFullYear(), m: d.getMonth() + 1 })
  }
  return out.reverse()
}

// --- TWSE STOCK_DAY ---
async function backfillTWSE(code) {
  const points = []
  for (const { y, m } of recentMonths(MONTHS)) {
    const date = `${y}${String(m).padStart(2, '0')}01`
    const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date}&stockNo=${code}`
    try {
      const d = await fetchJSON(url, { label: `TWSE ${code} ${y}/${m}`, timeoutMs: 60000 })
      if (d.stat !== 'OK' || !Array.isArray(d.data)) continue
      for (const row of d.data) {
        // [日期,成交股數,成交金額,開,高,低,收,漲跌,筆數,註記]
        points.push({
          date: rocToISO(row[0]),
          open: cleanNumber(row[3]),
          high: cleanNumber(row[4]),
          low: cleanNumber(row[5]),
          close: cleanNumber(row[6]),
          volume: cleanNumber(row[1]),
        })
      }
    } catch (e) {
      console.warn(`    TWSE ${code} ${y}/${m} 跳過: ${e.message}`)
    }
    await sleep(800) // 對公開 API 客氣一點
  }
  return points
}

// --- TPEx tradingStock (量單位為仟股，轉成股) ---
async function backfillTPEx(code) {
  const points = []
  for (const { y, m } of recentMonths(MONTHS)) {
    const date = `${y}/${String(m).padStart(2, '0')}/01`
    const url = `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${code}&date=${date}&response=json`
    try {
      const d = await fetchJSON(url, { label: `TPEx ${code} ${y}/${m}`, timeoutMs: 60000 })
      const rows = d?.tables?.[0]?.data
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        // [日期,成交仟股,成交仟元,開,高,低,收,漲跌,筆數]
        const vol = cleanNumber(row[1])
        points.push({
          date: rocToISO(row[0]),
          open: cleanNumber(row[3]),
          high: cleanNumber(row[4]),
          low: cleanNumber(row[5]),
          close: cleanNumber(row[6]),
          volume: vol === null ? null : vol * 1000,
        })
      }
    } catch (e) {
      console.warn(`    TPEx ${code} ${y}/${m} 跳過: ${e.message}`)
    }
    await sleep(800)
  }
  return points
}

async function main() {
  const watchlist = await readJSON(join(ROOT, 'config', 'watchlist.json'))
  let tracked = (watchlist?.stocks || []).filter((s) => s.track !== false)
  if (ONLY) tracked = tracked.filter((s) => ONLY.has(s.code))
  console.log(`回補近 ${MONTHS} 個月歷史，共 ${tracked.length} 檔${ONLY ? '(指定 --codes)' : ''}…`)

  for (const s of tracked) {
    process.stdout.write(`  ${s.code} ${s.name} (${s.market}) … `)
    const fresh = s.market === 'TWSE' ? await backfillTWSE(s.code) : await backfillTPEx(s.code)
    const file = join(DATA, 'history', `${s.code}.json`)
    const hist = await readJSON(file, { code: s.code, name: s.name, market: s.market, points: [] })

    // 合併去重(以新抓的為準)
    const byDate = new Map((hist.points || []).map((p) => [p.date, p]))
    for (const p of fresh) if (p.date && p.close != null) byDate.set(p.date, p)
    let points = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))

    // 用相鄰收盤重算 change_pct，確保一致
    for (let i = 0; i < points.length; i++) {
      const prev = i > 0 ? points[i - 1].close : null
      points[i].change_pct = prev ? changePct(points[i].close, points[i].close - prev) : null
    }

    hist.name = s.name
    hist.market = s.market
    hist.points = points
    await writeJSON(file, hist)
    console.log(`${points.length} 筆`)
  }
  console.log('回補完成。')
}

main().catch((e) => {
  console.error('回補失敗:', e.message)
  process.exitCode = 1
})
