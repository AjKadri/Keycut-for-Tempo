'use client'
import { useEffect, useState } from 'react'
export function DateValue({ value, showRelative = true }: { value: string; showRelative?: boolean }) {
  const [local, setLocal] = useState(false)
  useEffect(() => setLocal(true), [])
  const date = new Date(Number(value) * 1000)
  const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(!local ? { timeZone: 'UTC' } : {}) }).format(date)
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000)
  return <><time dateTime={date.toISOString()}>{formatted}</time>{showRelative && <span className="subtext" suppressHydrationWarning>{Math.abs(days) < 1 ? 'today' : new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' }).format(days, 'day')}</span>}</>
}
