// 共用工具：數值清洗、民國日期轉換、帶 retry/timeout 的 fetch、檔案讀寫

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * 清洗證交所/櫃買回傳的數字字串。
 * 會處理：千分位逗號、前後空白、"--"(無成交)、空字串。
 * @returns {number|null} 無法解析或無資料時回傳 null
 */
export function cleanNumber(raw) {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim().replace(/,/g, '')
  if (s === '' || s === '--' || s === '---' || s === 'N/A') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * 民國日期字串轉西元 ISO 日期。
 * 例: "1150608" -> "2026-06-08"；也接受 "115/06/08"。
 * @returns {string|null} YYYY-MM-DD
 */
export function rocToISO(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/[^0-9]/g, '')
  if (digits.length < 6) return null
  const mmdd = digits.slice(-4)
  const rocYear = parseInt(digits.slice(0, -4), 10)
  if (!Number.isFinite(rocYear)) return null
  const year = rocYear + 1911
  const mm = mmdd.slice(0, 2)
  const dd = mmdd.slice(2, 4)
  return `${year}-${mm}-${dd}`
}

/**
 * 計算漲跌幅(%)。close 與 change 已知時，前收 = close - change。
 * @returns {number|null} 四捨五入到小數兩位
 */
export function changePct(close, change) {
  if (close === null || change === null) return null
  const prev = close - change
  if (!prev) return null
  return Math.round((change / prev) * 10000) / 100
}

/**
 * 帶 timeout 與重試的 fetch，回傳已解析的 JSON。
 */
export async function fetchJSON(url, { retries = 3, timeoutMs = 60000, label = '' } = {}) {
  let lastErr
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'tw-stock-tracker/1.0 (+personal use)',
          Accept: 'application/json',
        },
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      const wait = attempt * 2000
      console.warn(`  [retry] ${label || url} 第 ${attempt}/${retries} 次失敗: ${err.message}${attempt < retries ? `，${wait / 1000}s 後重試` : ''}`)
      if (attempt < retries) await sleep(wait)
    }
  }
  throw new Error(`抓取失敗(${label || url}): ${lastErr?.message}`)
}

/** 帶 timeout 與重試的 fetch，回傳純文字(用於 RSS/XML) */
export async function fetchText(url, { retries = 3, timeoutMs = 30000, label = '' } = {}) {
  let lastErr
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'tw-stock-tracker/1.0 (+personal use)' },
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      if (attempt < retries) await sleep(attempt * 1500)
    }
  }
  throw new Error(`抓取失敗(${label || url}): ${lastErr?.message}`)
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function readJSON(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeJSON(path, data) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}
