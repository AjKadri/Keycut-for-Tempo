import test from 'node:test'
import assert from 'node:assert/strict'
import { demoCapacity } from '../lib/demo-capacity'
test('demo funding capacity budgets fees and rounds down', () => {
  assert.equal(demoCapacity(0n), '0')
  assert.equal(demoCapacity(10_999_999n), '0')
  assert.equal(demoCapacity(11_000_000n), '1')
  assert.equal(demoCapacity(32_999_999n), '2')
})
