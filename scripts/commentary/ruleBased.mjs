// 方案 A：規則式當日評論。純依當日數據 + 歷史走勢產生中文短評，無外部依賴。

const PCT = (n) => (n === null || n === undefined ? 'N/A' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`)

/**
 * @param {Array} stocks 當日正規化個股(含 change_pct)
 * @param {Object} historyMap { code: [{date, close, volume}, ...] } 含當日之前的歷史
 * @returns {{summary:string, highlights:string[], stats:object}}
 */
export function buildRuleCommentary(stocks, historyMap = {}) {
  const valid = stocks.filter((s) => s.change_pct !== null)
  if (valid.length === 0) {
    return { summary: '今日無有效收盤資料。', highlights: [], stats: {} }
  }

  const sorted = [...valid].sort((a, b) => b.change_pct - a.change_pct)
  const up = valid.filter((s) => s.change_pct > 0)
  const down = valid.filter((s) => s.change_pct < 0)
  const flat = valid.filter((s) => s.change_pct === 0)
  const avgPct = valid.reduce((sum, s) => sum + s.change_pct, 0) / valid.length

  const top = sorted[0]
  const bottom = sorted[sorted.length - 1]

  const highlights = []

  // 1. 大漲大跌(±5%)
  for (const s of sorted) {
    if (Math.abs(s.change_pct) >= 5) {
      highlights.push(`${s.name}(${s.code}) ${s.change_pct > 0 ? '大漲' : '大跌'} ${PCT(s.change_pct)}，收 ${s.close}`)
    }
  }

  // 2. 爆量(量 > 近 20 日均量 2 倍)與創新高/新低
  for (const s of valid) {
    const hist = historyMap[s.code] || []
    const past = hist.filter((h) => h.date < s.trading_date)
    const recent = past.slice(-20)
    if (recent.length >= 5) {
      const vols = recent.map((h) => h.volume).filter((v) => v != null && v > 0)
      if (vols.length >= 5 && s.volume) {
        const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length
        if (s.volume > avgVol * 2) {
          highlights.push(`${s.name}(${s.code}) 爆量，成交 ${fmtVol(s.volume)} 約為近 ${vols.length} 日均量的 ${(s.volume / avgVol).toFixed(1)} 倍`)
        }
      }
      const closes = recent.map((h) => h.close).filter((c) => c != null)
      if (closes.length >= 5 && s.close != null) {
        const maxC = Math.max(...closes)
        const minC = Math.min(...closes)
        if (s.close > maxC) highlights.push(`${s.name}(${s.code}) 創近 ${closes.length} 日新高，收 ${s.close}`)
        else if (s.close < minC) highlights.push(`${s.name}(${s.code}) 創近 ${closes.length} 日新低，收 ${s.close}`)
      }
    }
  }

  const summaryParts = []
  summaryParts.push(`追蹤 ${valid.length} 檔中，上漲 ${up.length} 家、下跌 ${down.length} 家、平盤 ${flat.length} 家，平均 ${PCT(avgPct)}。`)
  if (top && top.change_pct > 0) summaryParts.push(`領漲為 ${top.name}(${top.code}) ${PCT(top.change_pct)}。`)
  if (bottom && bottom.change_pct < 0) summaryParts.push(`領跌為 ${bottom.name}(${bottom.code}) ${PCT(bottom.change_pct)}。`)
  if (highlights.length === 0) summaryParts.push('整體無顯著異常波動。')

  return {
    summary: summaryParts.join(''),
    highlights,
    stats: {
      total: valid.length,
      up: up.length,
      down: down.length,
      flat: flat.length,
      avg_pct: Math.round(avgPct * 100) / 100,
      top: top ? { code: top.code, name: top.name, change_pct: top.change_pct } : null,
      bottom: bottom ? { code: bottom.code, name: bottom.name, change_pct: bottom.change_pct } : null,
    },
  }
}

function fmtVol(v) {
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 億股`
  if (v >= 1e4) return `${(v / 1e4).toFixed(1)} 萬股`
  return `${v} 股`
}
