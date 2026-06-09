// 方案 B：AI 盤後短評。呼叫 Claude API，把當日數據 + 近期走勢餵給模型產生口語化短評。
// 僅在環境變數 ANTHROPIC_API_KEY 存在時啟用；失敗時回傳 null，由呼叫端 fallback 到規則式。

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'

/**
 * @param {Array} stocks 當日正規化個股
 * @param {object} ruleResult 規則式評論結果(當作事實基礎餵給模型)
 * @param {string} techText 技術面摘要(均線排列/乖離/量能/交叉)
 * @returns {Promise<string|null>} 一段中文短評，含免責；無金鑰或失敗回傳 null
 */
export async function buildAICommentary(stocks, ruleResult, techText = '') {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.log('  [AI] 未設定 ANTHROPIC_API_KEY，略過 AI 評論。')
    return null
  }

  const facts = stocks
    .filter((s) => s.change_pct !== null)
    .map((s) => `${s.name}(${s.code},${s.market}) 收${s.close} ${s.change_pct > 0 ? '+' : ''}${s.change_pct}% 量${s.volume ?? 'NA'}`)
    .join('\n')

  const prompt = `你是台股盤後評論員。以下是今日(${stocks[0]?.trading_date || ''})追蹤清單的收盤數據與已算好的統計。請寫一段 150~250 字的繁體中文盤後短評。

規則：
- 只根據下列提供的數據描述，不可臆測未公開消息、不可預測明日走勢。
- 語氣自然口語、像給朋友看的盤後筆記，但保持客觀。
- 適度帶入技術面觀點(均線多空排列、站上/跌破月線季線、黃金/死亡交叉、量能、乖離)，但不要逐檔流水帳。
- 結尾另起一行加上免責：「以上僅為數據整理，非投資建議。」

【統計】
${ruleResult.summary}
重點：${ruleResult.highlights.join('；') || '無顯著異常'}

【技術面摘要】
${techText || '(無)'}

【個股收盤】
${facts}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      let detail = ''
      try { detail = (await res.json())?.error?.message || '' } catch { /* ignore */ }
      console.warn(`  [AI] API 回應 ${res.status}${detail ? `：${detail}` : ''}，略過 AI 評論。`)
      return null
    }
    const data = await res.json()
    const text = data?.content?.[0]?.text?.trim()
    return text || null
  } catch (err) {
    console.warn(`  [AI] 呼叫失敗(${err.message})，略過 AI 評論。`)
    return null
  }
}
