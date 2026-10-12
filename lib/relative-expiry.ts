export function relativeExpiry(expiryMs: number, nowMs: number) {
  const seconds = (expiryMs - nowMs) / 1000
  const unit = Math.abs(seconds) < 3600 ? 'minute' : Math.abs(seconds) < 86400 ? 'hour' : 'day'
  const divisor = unit === 'minute' ? 60 : unit === 'hour' ? 3600 : 86400
  const amount = Math.sign(seconds) * Math.max(1, Math.round(Math.abs(seconds) / divisor))
  return new Intl.RelativeTimeFormat('en-GB', { numeric: 'always' }).format(amount, unit)
}
