// 抓取台股相關新聞(Google News RSS，免費)。回傳近期新聞標題清單供 AI 分析。

import { fetchText, sleep } from './util.mjs'

const QUERIES = [
  '台股 盤前',
  '台股 個股 利多',
  '台股 漲停',
  '台股 法人 買超',
  '半導體 OR AI伺服器 OR 散熱 台股',
]

function rss(q) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:1d')}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`
}

function decode(s) {
  return (s || '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim()
}

function parseItems(xml) {
  const items = []
  for (const m of xml.matchAll(/<item>(.*?)<\/item>/gs)) {
    const block = m[1]
    const title = decode(block.match(/<title>(.*?)<\/title>/s)?.[1])
    const pub = decode(block.match(/<pubDate>(.*?)<\/pubDate>/s)?.[1])
    const link = decode(block.match(/<link>(.*?)<\/link>/s)?.[1])
    const source = decode(block.match(/<source[^>]*>(.*?)<\/source>/s)?.[1])
    if (title) items.push({ title, pub, link, source })
  }
  return items
}

/**
 * 抓多組查詢的新聞並去重。
 * @param {number} maxAgeHours 只保留近 N 小時的新聞
 * @returns {Promise<Array<{title,pub,link,source}>>}
 */
export async function fetchNews({ maxAgeHours = 24, limit = 50 } = {}) {
  const seen = new Set()
  const all = []
  const now = Date.now()
  for (const q of QUERIES) {
    try {
      const xml = await fetchText(rss(q), { label: `news:${q}` })
      for (const it of parseItems(xml)) {
        const key = it.title
        if (seen.has(key)) continue
        // 過濾過舊新聞
        const t = it.pub ? Date.parse(it.pub) : now
        if (Number.isFinite(t) && now - t > maxAgeHours * 3600 * 1000) continue
        seen.add(key)
        all.push(it)
      }
    } catch (e) {
      console.warn(`  [news] 查詢「${q}」失敗：${e.message}`)
    }
    await sleep(500)
  }
  // 新到舊
  all.sort((a, b) => (Date.parse(b.pub || 0) || 0) - (Date.parse(a.pub || 0) || 0))
  return all.slice(0, limit)
}
