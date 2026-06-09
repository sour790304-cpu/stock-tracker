# 台股追蹤網站 — 開發規格書（給 Claude Code）

> 用途：把這份文件放進專案根目錄當 `SPEC.md`，然後對 Claude Code 說「請依照 SPEC.md 建置這個專案」。
> 目標：一個自動每日追蹤指定台股、顯示價格走勢、並產生「當日價格評論」的網站。資料來源使用免費公開 API。

---

## 1. 專案目標

建立一個個人用的台股追蹤網站，每個交易日收盤後自動：
1. 抓取追蹤清單中各股的當日收盤行情。
2. 更新歷史價格資料。
3. 產生一段「當日價格評論」（漲跌幅、相對表現、異常變動提示）。
4. 在網頁上以表格 + 走勢圖呈現，並保留歷史評論。

非即時報價，定位是「每日收盤後的追蹤與回顧」，不做盤中即時 tick。

---

## 2. 追蹤清單（含市場別，很重要）

不同市場要打不同 API。請依下表分流：

| 代號 | 名稱 | 市場 | 資料來源 |
|---|---|---|---|
| 2330 | 台積電 | 上市 | TWSE |
| 3231 | 緯創 | 上市 | TWSE |
| 2356 | 英業達 | 上市 | TWSE |
| 2367 | 燿華 | 上市 | TWSE |
| 3059 | 華晶科 | 上市 | TWSE |
| 3021 | 鴻名 | 上市 | TWSE |
| 5443 | 均豪 | 上市 | TWSE |
| 00403A | 主動統一升級50 | 上市(ETF) | TWSE |
| 4577 | 達航科技 | 上櫃 | TPEx |
| 3587 | 閎康 | 上櫃 | TPEx |
| 6261 | 久元 | 上櫃 | TPEx |

清單請寫成設定檔（如 `config/watchlist.json`），方便日後增刪。

---

## 3. 資料來源（免費公開 API）

### 3.1 上市股票（TWSE 臺灣證券交易所 OpenAPI）
- 全市場當日收盤（單次回傳全部上市股票，含開高低收/漲跌/量）：
  `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`
  （或舊版 `https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=open_data`）
- 單一個股歷史（指定月份/個股）：
  `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=YYYYMMDD&stockNo=2330`
- Swagger 文件：`https://openapi.twse.com.tw/`
- 欄位：日期、成交股數、成交金額、開盤價、最高價、最低價、收盤價、漲跌價差、成交筆數。

建議做法：每日抓一次 `STOCK_DAY_ALL`，再用程式過濾出 watchlist 中的上市代號，效率最高。

### 3.2 上櫃股票（TPEx 證券櫃檯買賣中心 OpenAPI）
- 上櫃每日收盤行情：
  `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`
- Swagger 文件：`https://www.tpex.org.tw/openapi/`
- 用於 4577 達航、3587 閎康、6261 久元。

### 3.3 注意事項
- 兩個來源欄位名稱/格式不同，需各寫一個 parser，正規化成統一資料結構（見第 6 節）。
- 數值欄位常含逗號（如 "1,234"）或 "--"（無成交），parser 要清洗。
- 資料是「收盤後」才更新，排程時間要設在收盤資料就緒之後（見第 5 節）。
- 這些是公開 API，請加上合理的 timeout、retry 與 User-Agent，避免短時間大量請求。

---

## 4. 技術建議（免後端、零成本部署）

因為只需要每日批次更新 + 靜態展示，建議走「靜態網站 + 排程腳本」架構，可用 GitHub 免費方案完成，不必租伺服器：

- **前端**：Vite + React（或純 HTML + Chart.js，看你偏好）。圖表用 Chart.js 或 Recharts。
- **資料抓取/評論腳本**：Python（requests + pandas）或 Node.js。
- **每日自動執行**：GitHub Actions 排程（cron），跑腳本→抓資料→產生評論→把更新後的 JSON commit 回 repo。
- **部署**：GitHub Pages（前端讀取 repo 內的 JSON 資料檔）。
- **資料儲存**：直接存成 repo 內的 JSON/CSV 檔（如 `data/prices.json`、`data/commentary/2026-06-09.json`），免資料庫。

> 若日後想要即時報價或使用者帳號，再升級成有後端（FastAPI/Express + DB）的架構。

---

## 5. 每日自動化（關鍵）

用 GitHub Actions 的 `schedule` cron 觸發。重點：

- **cron 時間是 UTC**。台股收盤 13:30，盤後資料整理完約需一段時間，建議排在台灣時間傍晚。
  例：台灣 17:30 = UTC 09:30 → `cron: "30 9 * * 1-5"`（週一到週五）。
- Workflow 步驟：
  1. checkout repo
  2. 安裝環境（Python/Node）
  3. 執行抓取腳本（TWSE + TPEx，過濾 watchlist）
  4. 更新 `data/prices.json` 與歷史檔
  5. 產生當日評論檔
  6. `git commit` & `git push`（Pages 會自動重新發布）
- 國定假日/休市日 API 不會有新資料，腳本要能偵測「今天無新資料」就略過、不要產生空評論。

---

## 6. 統一資料結構（建議）

```json
// data/prices.json — 最新一筆 + 滾動歷史
{
  "updated_at": "2026-06-09T09:30:00Z",
  "trading_date": "2026-06-09",
  "stocks": [
    {
      "code": "2330",
      "name": "台積電",
      "market": "TWSE",
      "open": 2300, "high": 2330, "low": 2295,
      "close": 2320, "change": 20, "change_pct": 0.87,
      "volume": 25000000
    }
  ]
}
```
歷史價格建議每檔一個檔（`data/history/2330.json`，append 每日收盤），供畫走勢圖。

---

## 7. 「當日價格評論」產生方式（兩種，可並用）

### 方案 A：規則式（免費、無外部依賴，建議先做）
程式依當日數據自動產生中文評論，例如：
- 個股漲跌幅排序：「今日領漲為 X（+n%），領跌為 Y（−n%）」。
- 異常提醒：單日漲跌幅 > ±5%、爆量（量 > 近 20 日均量 2 倍）、創近期新高/新低。
- 與大盤比較：可額外抓加權指數（TWSE 有指數 API）做相對強弱。
- 清單整體：上漲家數/下跌家數、平均漲跌幅。

### 方案 B：AI 評論（更自然，需 Claude API 金鑰）
在 GitHub Action 內呼叫 Claude API，把當日數據 + 近期走勢餵給模型，產生一段口語化的盤後短評。
- 需在 repo secrets 設定 `ANTHROPIC_API_KEY`。
- Prompt 要求：只根據提供的數據描述、不臆測未公開消息、結尾加免責。
- 注意這會產生 API 費用（每日一次、量小，成本很低）。

> 建議：先用方案 A 確保穩定，行有餘力再加方案 B。

---

## 8. 網站功能需求

1. **總覽表**：各股代號、名稱、收盤、漲跌、漲跌幅、成交量；漲紅跌綠（台股慣例：漲紅跌綠，與美股相反）。
2. **走勢圖**：點選個股顯示歷史收盤折線圖（可切 1 月 / 3 月 / 全部）。
3. **當日評論區**：顯示最新一日評論，並可瀏覽歷史評論。
4. **最後更新時間**：顯示 `trading_date` 與資料抓取時間。
5. **響應式**：手機可看。
6. **免責聲明**：頁尾固定顯示「資料來自公開來源，僅供參考，非投資建議」。

---

## 9. 給 Claude Code 的起手 Prompt（可直接貼）

```
我要建一個台股每日追蹤網站，需求都寫在 SPEC.md，請先讀它。
技術用 Vite + React + Chart.js 做前端，Python(requests + pandas) 寫抓取與評論腳本，
用 GitHub Actions cron 每個交易日傍晚自動更新資料並 commit，部署到 GitHub Pages。

請依序進行：
1. 建立專案骨架與 config/watchlist.json
2. 寫 TWSE 與 TPEx 兩個資料抓取模組，正規化成 SPEC 第 6 節的結構，並寫單元測試
3. 先實作規則式（方案 A）當日評論
4. 做前端：總覽表 + 個股走勢圖 + 評論區
5. 設定 GitHub Actions 排程與 Pages 部署
每完成一步先讓我確認再繼續。
```

---

## 10. 注意事項與限制

- 免費 API 為**收盤後**資料，非盤中即時；如需即時報價要改接券商/付費 API。
- cron 為 UTC，務必換算台灣時間並排除休市日。
- 公開 API 偶有改版或暫時無回應，腳本需有錯誤處理與重試，並保留前一日資料避免畫面空白。
- ETF（00403A）走 TWSE，但欄位可能與一般個股略有差異，需測試確認。
- 本網站僅供個人追蹤研究，所有內容非投資建議。

---

### 參考連結
- TWSE OpenAPI：https://openapi.twse.com.tw/
- TWSE 全市場日成交：https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL
- TPEx OpenAPI：https://www.tpex.org.tw/openapi/
- 政府資料開放平臺（個股日成交）：https://data.gov.tw/dataset/11549
