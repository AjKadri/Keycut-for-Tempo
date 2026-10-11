import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeEvents, mergeRanges, type KeyEvent } from '../lib/index'

test('out-of-order duplicate events preserve first seen and permanent flags', () => {
  const events: KeyEvent[] = [
    { account: '0xAA', key: '0xBB', block: 30, kind: 'revoked' },
    { account: '0xaa', key: '0xbb', block: 10, kind: 'authorized' },
    { account: '0xAA', key: '0xBB', block: 10, kind: 'admin' },
  ]
  const shard = mergeEvents({}, events)
  assert.deepEqual(shard, { '0xaa': [['0xbb', 10, 3]] })
  assert.deepEqual(mergeEvents(shard, events), shard)
})

test('incremental merge orders newest first and preserves unrelated accounts', () => {
  const shard = { '0xaa': [['0xbb', 10, 1] as [string, number, number]], '0xcc': [['0xdd', 5, 0] as [string, number, number]] }
  const next = mergeEvents(shard, [
    { account: '0xaa', key: '0xbb', block: 50, kind: 'revoked' },
    { account: '0xaa', key: '0xee', block: 20, kind: 'authorized' },
  ])
  assert.deepEqual(next['0xaa'], [['0xee', 20, 0], ['0xbb', 10, 3]])
  assert.deepEqual(next['0xcc'], shard['0xcc'])
  assert.equal(shard['0xaa']![0]![2], 1)
})

test('coverage merge leaves gaps visible and does not extend the complete prefix', () => {
  assert.deepEqual(mergeRanges([[101, 110], [0, 99], [111, 120]]), [[0, 99], [101, 120]])
  assert.deepEqual(mergeRanges([[10, 20], [0, 9], [5, 15]]), [[0, 20]])
})
