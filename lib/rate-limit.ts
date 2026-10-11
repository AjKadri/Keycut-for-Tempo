// One process behind Caddy, which supplies the client IP. Expired buckets are
// removed on each request; restarts reset the one-minute counters.
const buckets = new Map<string, { count: number; until: number }>()
export function rateLimit(ip: string, now = Date.now()) {
  for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key)
  let bucket = buckets.get(ip)
  if (!bucket) { bucket = { count: 0, until: now + 60_000 }; buckets.set(ip, bucket) }
  bucket.count++
  return { allowed: bucket.count <= 30, retryAfter: Math.ceil((bucket.until - now) / 1000) }
}
