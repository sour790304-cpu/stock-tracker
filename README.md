# 台股每日追蹤網站

收盤後追蹤指定台股、顯示走勢圖並產生「當日價格評論」。資料來自 TWSE / TPEx 公開 API，定位為**每日收盤後的追蹤與回顧**（非即時報價）。

依 [`SPEC.md`](./SPEC.md) 建置。

## 技術架構

| 層 | 技術 |
|----|------|
| 前端 | Vite + React + Chart.js |
| 抓取/評論腳本 | Node.js（原生 fetch，零額外相依） |
| 資料來源 | TWSE OpenAPI（上市）、TPEx OpenAPI（上櫃） |
| 自動化 | GitHub Actions cron（每交易日台灣 17:30） |
| 部署 | GitHub Pages |
| 資料儲存 | repo 內 JSON（`public/data/`） |

## 本機開發

```bash
npm install          # 安裝相依
npm run backfill     # 回補近 3 個月歷史(首次建議跑，讓走勢圖有資料)
npm run update       # 抓最新收盤、算技術指標、產生評論、寫入 public/data/
npm run picks        # 抓台股新聞 → AI 篩出「明日觀察清單」3 檔(排除已追蹤股)
npm run dev          # 開發伺服器 http://localhost:5173
npm run build        # 打包到 dist/
npm test             # 單元測試(parser / 工具函式)
```

- `npm run update` 會自動偵測「今日無新資料」（休市/假日）並略過；測試時可加 `--force` 強制覆寫。
- `npm run backfill --months=6` 可調整回補月數。

## 資料結構（`public/data/`）

| 檔案 | 說明 |
|------|------|
| `prices.json` | 最新一日全部追蹤股收盤 |
| `history/{code}.json` | 每檔歷史收盤（走勢圖用） |
| `commentary/{date}.json` | 當日評論（規則式 + 可選 AI） |
| `commentary/index.json` | 評論日期索引 |
| `fundamentals.json` | 各股基本面（手動維護） |

清單設定在 [`config/watchlist.json`](./config/watchlist.json)，新增/刪除標的直接改此檔（`market` 欄位決定打哪個 API）。

## 當日評論

- **方案 A 規則式**（預設）：漲跌排序、±5% 異常、爆量（>近 20 日均量 2 倍）、創新高/新低、漲跌家數統計。無外部依賴。
- **方案 B AI 短評**（可選）：設環境變數 / GitHub Secret `ANTHROPIC_API_KEY` 後自動啟用，呼叫 Claude API 產生口語化盤後短評；未設定則只輸出方案 A。

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run update   # 本機測試 AI 評論
```

## 部署到 GitHub Pages

1. 建立 GitHub repo，把本專案推上去。
2. Repo Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。
3. （可選）Settings → Secrets → Actions 新增 `ANTHROPIC_API_KEY` 啟用 AI 評論。
4. `.github/workflows/daily-update.yml` 會每交易日傍晚自動抓資料、commit、部署。也可在 Actions 頁手動觸發。

> 若部署在專案站（`username.github.io/repo-name/`），`vite.config.js` 的 `base: './'` 已可正常運作；自訂網域根目錄可改 `base: '/'`。

## 免責

資料來自公開來源，僅供個人追蹤研究參考，**非投資建議**。基本面資料含估算與來源差異，下單前請以即時報價與正式財報複核。
