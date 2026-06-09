import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanNumber, rocToISO, changePct } from './util.mjs'

test('cleanNumber 清洗千分位與空白', () => {
  assert.equal(cleanNumber('1,234'), 1234)
  assert.equal(cleanNumber(' 2,355.00 '), 2355)
  assert.equal(cleanNumber('-6.00 '), -6)
})

test('cleanNumber 處理無資料', () => {
  assert.equal(cleanNumber('--'), null)
  assert.equal(cleanNumber(''), null)
  assert.equal(cleanNumber('N/A'), null)
  assert.equal(cleanNumber(null), null)
  assert.equal(cleanNumber(undefined), null)
})

test('rocToISO 民國轉西元', () => {
  assert.equal(rocToISO('1150608'), '2026-06-08')
  assert.equal(rocToISO('115/06/08'), '2026-06-08')
  assert.equal(rocToISO('990101'), '2010-01-01')
})

test('rocToISO 無效輸入回 null', () => {
  assert.equal(rocToISO(''), null)
  assert.equal(rocToISO('123'), null)
  assert.equal(rocToISO(null), null)
})

test('changePct 計算漲跌幅', () => {
  // close 2295, change -70 → prev 2365 → -2.96%
  assert.equal(changePct(2295, -70), -2.96)
  assert.equal(changePct(110, 10), 10) // prev 100 → +10%
  assert.equal(changePct(100, 0), 0)
})

test('changePct 邊界', () => {
  assert.equal(changePct(null, 1), null)
  assert.equal(changePct(100, null), null)
  assert.equal(changePct(0, 0), null) // prev 0
})
