import test from 'node:test'
import assert from 'node:assert/strict'
import { relativeExpiry } from '../lib/relative-expiry'
test('short expiry uses hours or minutes instead of a calendar-day label', () => {
  const now=1_000_000
  assert.equal(relativeExpiry(now+2*3600_000,now),'in 2 hours')
  assert.equal(relativeExpiry(now+30*60_000,now),'in 30 minutes')
  assert.equal(relativeExpiry(now+23*3600_000,now),'in 23 hours')
  assert.equal(relativeExpiry(now+3*86400_000,now),'in 3 days')
  assert.equal(relativeExpiry(now-2*3600_000,now),'2 hours ago')
})
