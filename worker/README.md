# 即時報價 Proxy（Cloudflare Worker）

證交所 MIS 盤中即時 API 沒有 CORS 標頭，GitHub Pages 前端無法直接抓。
這支 Worker 代理 MIS 並加上 CORS。免費方案每日 10 萬次請求綽綽有餘。

## 部署（用 Cloudflare 後台，最簡單，不必裝 CLI）

1. 登入 https://dash.cloudflare.com → 左側 **Workers & Pages** → **Create** → **Create Worker**
2. 取名（例如 `tw-stock-quote`）→ **Deploy**（先部署預設範本）
3. 點 **Edit code**，把整個 [`worker.js`](./worker.js) 內容貼上去覆蓋 → **Deploy**
4. 複製你的網址：`https://tw-stock-quote.<你的子網域>.workers.dev`
5. 測試：瀏覽器開
   `https://tw-stock-quote.<你的子網域>.workers.dev/?ex=tse_2330.tw|otc_4577.tw`
   應該看到 JSON 報價（盤中才有跳動，收盤後是最後成交）。
6. 把這個網址填進前端 `public/data/config.json` 的 `realtime_proxy`。

## （進階）用 wrangler CLI 部署
```bash
npm i -g wrangler
cd worker
wrangler login
wrangler deploy
```
`wrangler.toml` 已備好。

## 注意
- MIS 是官方盤中即時資料，個人研究用沒問題，請勿公開大量轉散布。
- 只有交易時段（週一~五 09:00–13:30）有即時跳動。
