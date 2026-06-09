// 盤前「明日觀察清單」：抓晚間/隔夜台股新聞 → Claude 找出受惠個股 → 用證交所清單把股名對回正確股號
// → 排除已追蹤的 watchlist → 輸出 3 檔候選(附理由/催化/風險)。
// 用法: npm run picks   (GitHub Actions 盤前 07:30 自動執行)
//
// ⚠️ 僅為新聞驅動的觀察候選，非投資建議。AI 可能誤判、利多可能已反映或為假消息，進場前務必自行複核。

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { readJSON, writeJSON } from './lib/util.mjs'
import { fetchNews } from './lib/news.mjs'
import { fetchAllLists } from './lib/markets.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'data')

// 載入 .env(強制覆蓋既有空值)
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && m[2].trim()) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch { /* 無 .env */ }

const MODEL = process.env.PICKS_MODEL || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'
const WANT = 3

function taipeiDate() {
  // 取台北時區的今天日期 YYYY-MM-DD
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return parts
}

async function askClaude(news) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { console.warn('  [picks] 未設定 ANTHROPIC_API_KEY，無法產生候選。'); return [] }

  const headlines = news.map((n, i) => `${i + 1}. ${n.title}（${n.source || ''}）`).join('\n')
  const prompt = `你是台股盤前分析助理。以下是近一日的台股相關新聞標題。

請從「**新聞中實際提到的台灣上市/上櫃公司**」裡，挑出最多 8 家有「明確正面催化劑」的個股（例如營收創高、獲利成長、接獲大單、題材發酵、法人買超、產業利多）。

嚴格要求：
- 只能挑新聞標題或內容中真的出現的公司，不可自行臆測或補充新聞沒提到的股票。
- 不要挑大盤、指數、ETF、或純總經評論。
- 每家給：公司簡稱(name)、你所知的股號(code，4碼數字或6碼)、為何看好(reason，1句)、對應的催化新聞重點(catalyst，1句)、主要風險(risk，1句)、情緒(sentiment：利多/中性/利空)。
- 只輸出 JSON 陣列，不要任何其他文字。格式：
[{"name":"聯發科","code":"2454","reason":"...","catalyst":"...","risk":"...","sentiment":"利多"}]

【新聞標題】
${headlines}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) {
      let d = ''; try { d = (await res.json())?.error?.message || '' } catch { /* */ }
      console.warn(`  [picks] API ${res.status}：${d}`); return []
    }
    const data = await res.json()
    const text = data?.content?.[0]?.text || ''
    const jsonStr = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
    return JSON.parse(jsonStr)
  } catch (e) {
    console.warn(`  [picks] 解析失敗：${e.message}`); return []
  }
}

function resolve(cand, byName, byCode) {
  if (cand.name && byName.has(cand.name)) return byName.get(cand.name)
  if (cand.code && byCode.has(String(cand.code))) return byCode.get(String(cand.code))
  for (const [nm, o] of byName) {
    if (nm && cand.name && (nm.includes(cand.name) || cand.name.includes(nm))) return o
  }
  return null
}

async function main() {
  const forDate = taipeiDate()
  console.log(`產生 ${forDate} 盤前觀察清單…`)

  const watchlist = await readJSON(join(ROOT, 'config', 'watchlist.json'), { stocks: [] })
  const exclude = new Set((watchlist.stocks || []).map((s) => s.code))

  const news = await fetchNews({ maxAgeHours: 24, limit: 50 })
  console.log(`  取得新聞 ${news.length} 則`)
  if (news.length === 0) { console.error('  無新聞，結束。'); process.exitCode = 1; return }

  const { byName, byCode } = await fetchAllLists()
  console.log(`  全市場清單 ${byCode.size} 檔`)

  const cands = await askClaude(news)
  console.log(`  Claude 提出 ${cands.length} 檔候選`)

  const picks = []
  const usedCodes = new Set()
  for (const c of cands) {
    const hit = resolve(c, byName, byCode)
    if (!hit) { console.log(`    略過(查無股號)：${c.name} ${c.code || ''}`); continue }
    if (exclude.has(hit.code)) { console.log(`    略過(已在追蹤清單)：${hit.name}(${hit.code})`); continue }
    if (usedCodes.has(hit.code)) continue
    usedCodes.add(hit.code)
    // 嘗試附上一則相關新聞連結
    const relNews = news.find((n) => n.title.includes(hit.name) || (c.name && n.title.includes(c.name)))
    picks.push({
      code: hit.code, name: hit.name, market: hit.market, close: hit.close, change: hit.change,
      reason: c.reason || '', catalyst: c.catalyst || '', risk: c.risk || '', sentiment: c.sentiment || '',
      news_title: relNews?.title || null, news_link: relNews?.link || null, news_source: relNews?.source || null,
    })
    if (picks.length >= WANT) break
  }

  const out = {
    for_date: forDate,
    generated_at: new Date().toISOString(),
    model: MODEL,
    source: 'Google News RSS + Claude',
    news_count: news.length,
    disclaimer: '本清單由新聞 + AI 自動產生，僅供研究參考，非投資建議。利多可能已反映或為不實消息，開盤前請自行複核。',
    picks,
  }
  await writeJSON(join(DATA, 'picks', `${forDate}.json`), out)

  const index = await readJSON(join(DATA, 'picks', 'index.json'), { dates: [] })
  index.dates = Array.from(new Set([...(index.dates || []), forDate])).sort().reverse()
  await writeJSON(join(DATA, 'picks', 'index.json'), index)

  console.log(`  寫入 picks/${forDate}.json（${picks.length} 檔：${picks.map((p) => p.name + '(' + p.code + ')').join('、')}）`)
  console.log('完成。')
}

main().catch((e) => { console.error('picks 失敗:', e.message); process.exitCode = 1 })
