import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTWSE, normalizeTPEx } from './markets.mjs'

test('normalizeTWSE 正規化(實際回傳樣本)', () => {
  const row = {
    Date: '1150608', Code: '2330', Name: '台積電',
    TradeVolume: '52273858', TradeValue: '119557290165',
    OpeningPrice: '2230.00', HighestPrice: '2320.00', LowestPrice: '2230.00',
    ClosingPrice: '2295.00', Change: '-70.0000', Transaction: '436256',
  }
  const s = normalizeTWSE(row)
  assert.equal(s.code, '2330')
  assert.equal(s.market, 'TWSE')
  assert.equal(s.trading_date, '2026-06-08')
  assert.equal(s.close, 2295)
  assert.equal(s.change, -70)
  assert.equal(s.change_pct, -2.96)
  assert.equal(s.volume, 52273858)
})

test('normalizeTPEx 正規化(實際回傳樣本，Change 含尾端空白)', () => {
  const row = {
    Date: '1150608', SecuritiesCompanyCode: '4577', CompanyName: '達航科技',
    Close: '93.90', Change: '-3.70 ', Open: '87.90', High: '94.20', Low: '87.90',
    Average: '90.39', TradingShares: '584225', TransactionAmount: '52806751', TransactionNumber: '742',
  }
  const s = normalizeTPEx(row)
  assert.equal(s.code, '4577')
  assert.equal(s.market, 'TPEx')
  assert.equal(s.trading_date, '2026-06-08')
  assert.equal(s.close, 93.9)
  assert.equal(s.change, -3.7)
  assert.equal(s.volume, 584225)
  // prev = 93.9 - (-3.7) = 97.6 → -3.79%
  assert.equal(s.change_pct, -3.79)
})

test('normalizeTWSE 處理無成交(--)', () => {
  const row = {
    Date: '1150608', Code: '9999', Name: '測試',
    TradeVolume: '0', TradeValue: '0',
    OpeningPrice: '--', HighestPrice: '--', LowestPrice: '--',
    ClosingPrice: '--', Change: '0.00', Transaction: '0',
  }
  const s = normalizeTWSE(row)
  assert.equal(s.close, null)
  assert.equal(s.change_pct, null)
})
