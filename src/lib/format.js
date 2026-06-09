// 顯示用格式化工具。台股慣例：漲紅跌綠。

const BASE = import.meta.env.BASE_URL

/** 讀取 public/data 下的 JSON */
export async function loadData(path) {
  const res = await fetch(`${BASE}data/${path}`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`讀取 ${path} 失敗 (${res.status})`)
  return res.json()
}

/** 漲跌方向 → CSS class（漲紅跌綠平灰） */
export function trendClass(v) {
  if (v === null || v === undefined || v === 0) return 'flat'
  return v > 0 ? 'up' : 'down'
}

export function fmtPct(v) {
  if (v === null || v === undefined) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

export function fmtPrice(v) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtChange(v) {
  if (v === null || v === undefined) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
}

/** 成交股數 → 張(1000股) 或 億/萬張 */
export function fmtVolume(shares) {
  if (shares === null || shares === undefined) return '—'
  const lots = shares / 1000
  if (lots >= 1e4) return `${(lots / 1e4).toFixed(1)} 萬張`
  return `${Math.round(lots).toLocaleString('zh-TW')} 張`
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
  } catch {
    return iso
  }
}
